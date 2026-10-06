import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EventStatus,
  Prisma,
  RegistrationStatus,
  SessionKind,
  SessionStatus,
  type Event,
  type EventRegistration,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import {
  HOST_ROLES,
  hasAnyRole,
  type Principal,
} from "../common/auth/principal";
import { TenantDatabaseService } from "../database/tenant-database.service";
import { WorkerPrismaService } from "../database/worker-prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { NotificationSchedulerService } from "../notifications/notification-scheduler.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { RegisterEventDto } from "./dto/register-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";

const PUBLIC_EVENT_STATUSES: EventStatus[] = [
  EventStatus.PUBLISHED,
  EventStatus.LIVE,
];

const TERMINAL_EVENT_STATUSES: EventStatus[] = [
  EventStatus.ENDED,
  EventStatus.CANCELLED,
];

@Injectable()
export class EventsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly publicDatabase: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationSchedulerService,
  ) {}

  async create(
    principal: Principal,
    input: CreateEventDto,
    idempotencyKey: string,
  ): Promise<Event | Prisma.JsonObject> {
    this.assertHost(principal);
    this.assertTimeZone(input.timezone);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ operation: "event.create", input }))
      .digest("hex");

    return this.database.run(principal, async (transaction) => {
      const lockKey = `event.create:${principal.workspaceId}:${idempotencyKey}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const existing = await transaction.idempotencyKey.findUnique({
        where: {
          workspaceId_key: {
            workspaceId: principal.workspaceId,
            key: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            "This idempotency key was already used with a different request",
          );
        }
        return existing.response as Prisma.JsonObject;
      }

      const duplicate = await transaction.event.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: principal.workspaceId,
            slug: input.slug,
          },
        },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException("An event with this slug already exists");

      const event = await transaction.event.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          slug: input.slug,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          startsAt: new Date(input.startsAt),
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          capacity: input.capacity ?? null,
          registrationFields: input.registrationFields as Prisma.InputJsonValue,
          branding: input.branding as Prisma.InputJsonValue,
        },
      });
      const response = this.toJson(event);
      await this.audit.record(transaction, principal, {
        action: "event.created",
        resourceType: "event",
        resourceId: event.id,
        metadata: { slug: event.slug, startsAt: event.startsAt.toISOString() },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event",
        aggregateId: event.id,
        eventType: "event.created",
        payload: response,
      });
      await transaction.idempotencyKey.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          key: idempotencyKey,
          requestHash,
          response,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return event;
    });
  }

  async list(principal: Principal) {
    return this.database.run(principal, (transaction) =>
      transaction.event.findMany({
        orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
        include: { _count: { select: { registrations: true } } },
      }),
    );
  }

  async getById(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id },
        include: {
          session: true,
          _count: { select: { registrations: true } },
        },
      });
      if (!event) throw new NotFoundException("Event not found");
      return event;
    });
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    input: UpdateEventDto,
  ): Promise<Event> {
    this.assertHost(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException(
        "At least one event field must be supplied",
      );
    }
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);

    return this.database.run(principal, async (transaction) => {
      if (input.slug !== undefined) {
        const duplicate = await transaction.event.findFirst({
          where: {
            workspaceId: principal.workspaceId,
            slug: input.slug,
            id: { not: id },
          },
          select: { id: true },
        });
        if (duplicate)
          throw new ConflictException("An event with this slug already exists");
      }

      const result = await transaction.event.updateMany({
        where: { id, version: expectedVersion, status: EventStatus.DRAFT },
        data: {
          version: { increment: 1 },
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.startsAt !== undefined
            ? { startsAt: new Date(input.startsAt) }
            : {}),
          ...(input.durationMinutes !== undefined
            ? { durationMinutes: input.durationMinutes }
            : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.registrationFields !== undefined
            ? {
                registrationFields:
                  input.registrationFields as Prisma.InputJsonValue,
              }
            : {}),
          ...(input.branding !== undefined
            ? { branding: input.branding as Prisma.InputJsonValue }
            : {}),
        },
      });
      if (result.count === 0) {
        await this.throwUpdateConflict(transaction, id, expectedVersion);
      }
      const event = await transaction.event.findUniqueOrThrow({
        where: { id },
      });
      await this.audit.record(transaction, principal, {
        action: "event.updated",
        resourceType: "event",
        resourceId: id,
        metadata: { previousVersion: expectedVersion, version: event.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event",
        aggregateId: id,
        eventType: "event.updated",
        payload: this.toJson(event),
      });
      return event;
    });
  }

  async publish(
    principal: Principal,
    id: string,
    expectedVersion: number,
  ): Promise<Event> {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({ where: { id } });
      if (!event) throw new NotFoundException("Event not found");
      if (event.version !== expectedVersion) {
        throw new ConflictException(
          `Version conflict. Current version is ${event.version}`,
        );
      }
      if (event.status !== EventStatus.DRAFT) {
        throw new ConflictException(
          `A ${event.status} event cannot be published`,
        );
      }

      const sessionId = randomUUID();
      await transaction.session.create({
        data: {
          id: sessionId,
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          title: event.title,
          description: event.description,
          kind: SessionKind.WEBINAR,
          status: SessionStatus.SCHEDULED,
          startsAt: event.startsAt,
          durationMinutes: event.durationMinutes,
          timezone: event.timezone,
          recordingEnabled: false,
          transcriptionEnabled: false,
          livekitRoomName: `session-${sessionId}`,
        },
      });
      const published = await transaction.event.update({
        where: { id },
        data: {
          sessionId,
          status: EventStatus.PUBLISHED,
          publishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.record(transaction, principal, {
        action: "event.published",
        resourceType: "event",
        resourceId: id,
        metadata: { sessionId, version: published.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event",
        aggregateId: id,
        eventType: "event.published",
        payload: this.toJson(published),
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "session",
        aggregateId: sessionId,
        eventType: "session.scheduled",
        payload: { sessionId, source: "event", eventId: id },
      });
      return published;
    });
  }

  async cancel(
    principal: Principal,
    id: string,
    expectedVersion: number,
  ): Promise<Event> {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({ where: { id } });
      if (!event) throw new NotFoundException("Event not found");
      if (event.version !== expectedVersion) {
        throw new ConflictException(
          `Version conflict. Current version is ${event.version}`,
        );
      }
      if (TERMINAL_EVENT_STATUSES.includes(event.status)) {
        throw new ConflictException(
          `A ${event.status} event cannot be cancelled`,
        );
      }
      const cancelled = await transaction.event.update({
        where: { id },
        data: { status: EventStatus.CANCELLED, version: { increment: 1 } },
      });
      if (event.sessionId) {
        await transaction.session.updateMany({
          where: {
            id: event.sessionId,
            status: { in: [SessionStatus.DRAFT, SessionStatus.SCHEDULED] },
          },
          data: { status: SessionStatus.CANCELLED, version: { increment: 1 } },
        });
      }
      await this.audit.record(transaction, principal, {
        action: "event.cancelled",
        resourceType: "event",
        resourceId: id,
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event",
        aggregateId: id,
        eventType: "event.cancelled",
        payload: this.toJson(cancelled),
      });
      return cancelled;
    });
  }

  async listRegistrations(principal: Principal, eventId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
      });
      if (!event) throw new NotFoundException("Event not found");
      return transaction.eventRegistration.findMany({
        where: { eventId },
        orderBy: { registeredAt: "desc" },
      });
    });
  }

  async updateRegistrationStatus(
    principal: Principal,
    eventId: string,
    registrationId: string,
    status: RegistrationStatus,
  ): Promise<EventRegistration> {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const registration = await transaction.eventRegistration.findFirst({
        where: { id: registrationId, eventId },
      });
      if (!registration) throw new NotFoundException("Registration not found");
      const updated = await transaction.eventRegistration.update({
        where: { id: registrationId },
        data: {
          status,
          checkedInAt:
            status === RegistrationStatus.ATTENDED
              ? (registration.checkedInAt ?? new Date())
              : registration.checkedInAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: "event.registration.status_changed",
        resourceType: "event_registration",
        resourceId: registrationId,
        metadata: { eventId, from: registration.status, to: status },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event_registration",
        aggregateId: registrationId,
        eventType: "event.registration.updated",
        payload: this.toJson(updated),
      });
      return updated;
    });
  }

  async getPublished(
    organizationSlug: string,
    workspaceSlug: string,
    eventSlug: string,
  ) {
    const event = await this.findPublicEvent(
      organizationSlug,
      workspaceSlug,
      eventSlug,
    );
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      durationMinutes: event.durationMinutes,
      timezone: event.timezone,
      capacity: event.capacity,
      registrationFields: event.registrationFields,
      branding: event.branding,
      status: event.status,
      registrationCount: event._count.registrations,
    };
  }

  async register(
    organizationSlug: string,
    workspaceSlug: string,
    eventSlug: string,
    input: RegisterEventDto,
  ): Promise<EventRegistration> {
    const event = await this.findPublicEvent(
      organizationSlug,
      workspaceSlug,
      eventSlug,
    );
    return this.publicDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${event.id}, 0))`;
      const duplicate = await transaction.eventRegistration.findUnique({
        where: { eventId_email: { eventId: event.id, email: input.email } },
      });
      if (duplicate)
        throw new ConflictException("This email is already registered");
      const confirmedCount = await transaction.eventRegistration.count({
        where: {
          eventId: event.id,
          status: {
            in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED],
          },
        },
      });
      const status =
        event.capacity !== null && confirmedCount >= event.capacity
          ? RegistrationStatus.WAITLISTED
          : RegistrationStatus.REGISTERED;
      const registration = await transaction.eventRegistration.create({
        data: {
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          eventId: event.id,
          name: input.name.trim(),
          email: input.email.toLowerCase(),
          answers: input.answers as Prisma.InputJsonValue,
          status,
        },
      });
      await this.outbox.enqueue(
        transaction,
        {
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
        },
        {
          aggregateType: "event_registration",
          aggregateId: registration.id,
          eventType: "event.registration.created",
          payload: this.toJson(registration),
        },
      );
      await this.notifications.queueEventRegistrationEmails(transaction, {
        event,
        registration,
      });
      return registration;
    });
  }

  private async findPublicEvent(
    organizationSlug: string,
    workspaceSlug: string,
    eventSlug: string,
  ) {
    const organization = await this.publicDatabase.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("Event not found");
    const workspace = await this.publicDatabase.workspace.findUnique({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: workspaceSlug,
        },
      },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException("Event not found");
    const event = await this.publicDatabase.event.findFirst({
      where: {
        workspaceId: workspace.id,
        slug: eventSlug,
        status: { in: PUBLIC_EVENT_STATUSES },
      },
      include: { _count: { select: { registrations: true } } },
    });
    if (!event) throw new NotFoundException("Event not found");
    return event;
  }

  private async throwUpdateConflict(
    transaction: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
  ): Promise<never> {
    const current = await transaction.event.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Event not found");
    if (current.version !== expectedVersion) {
      throw new ConflictException(
        `Version conflict. Current version is ${current.version}`,
      );
    }
    throw new ConflictException(`A ${current.status} event cannot be edited`);
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException("timezone must be a valid IANA timezone");
    }
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException("A host role is required");
    }
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
