import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EventStageRole,
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
import { CreateEventDto } from "./dto/create-event.dto";
import { CreateEventSpeakerDto } from "./dto/create-event-speaker.dto";
import type { EventRegistrationFieldDto } from "./dto/event-registration-field.dto";
import { RegisterEventDto } from "./dto/register-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { UpdateEventSpeakerDto } from "./dto/update-event-speaker.dto";
import {
  normalizeRegistrationAnswers,
  normalizeRegistrationFields,
  type NormalizedEventRegistrationField,
} from "./event-registration-form";

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
  ) {}

  async create(
    principal: Principal,
    input: CreateEventDto,
    idempotencyKey: string,
  ): Promise<Event | Prisma.JsonObject> {
    this.assertHost(principal);
    this.assertTimeZone(input.timezone);
    const registrationFields = normalizeRegistrationFields(input.registrationFields);
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          operation: "event.create",
          input: { ...input, registrationFields },
        }),
      )
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
          registrationFields:
            registrationFields as unknown as Prisma.InputJsonValue,
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
        include: {
          speakers: { orderBy: { position: "asc" } },
          _count: { select: { registrations: true, speakers: true } },
        },
      }),
    );
  }

  async getById(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id },
        include: {
          session: true,
          speakers: { orderBy: { position: "asc" } },
          _count: { select: { registrations: true, speakers: true } },
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
    const registrationFields =
      input.registrationFields !== undefined
        ? normalizeRegistrationFields(input.registrationFields)
        : undefined;

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
          ...(registrationFields !== undefined
            ? {
                registrationFields:
                  registrationFields as unknown as Prisma.InputJsonValue,
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

      const organizer = await transaction.eventSpeaker.findFirst({
        where: { eventId: id, role: EventStageRole.ORGANIZER },
        select: { id: true },
      });
      if (!organizer) {
        const maxPosition = await transaction.eventSpeaker.aggregate({
          where: { eventId: id },
          _max: { position: true },
        });
        await transaction.eventSpeaker.create({
          data: {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
            eventId: id,
            userId: principal.userId,
            role: EventStageRole.ORGANIZER,
            position: (maxPosition._max.position ?? -1) + 1,
            displayName: principal.displayName,
            email: principal.email.toLowerCase(),
          },
        });
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

  async listSpeakers(principal: Principal, eventId: string) {
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (!event) throw new NotFoundException("Event not found");
      return transaction.eventSpeaker.findMany({
        where: { eventId },
        orderBy: { position: "asc" },
      });
    });
  }

  async createSpeaker(
    principal: Principal,
    eventId: string,
    input: CreateEventSpeakerDto,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      });
      if (!event) throw new NotFoundException("Event not found");
      if (TERMINAL_EVENT_STATUSES.includes(event.status)) {
        throw new ConflictException(
          `A ${event.status} event cannot change stage profiles`,
        );
      }

      if (input.userId) {
        const membership = await transaction.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: principal.workspaceId,
              userId: input.userId,
            },
          },
          select: { id: true },
        });
        if (!membership) {
          throw new BadRequestException(
            "Linked speaker user must belong to the current workspace",
          );
        }
      }

      const maxPosition = await transaction.eventSpeaker.aggregate({
        where: { eventId },
        _max: { position: true },
      });
      const speaker = await transaction.eventSpeaker.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          eventId,
          ...(input.userId ? { userId: input.userId } : {}),
          role: input.role,
          position: (maxPosition._max.position ?? -1) + 1,
          displayName: input.displayName.trim(),
          email: input.email?.toLowerCase() ?? null,
          title: input.title?.trim() || null,
          bio: input.bio?.trim() || null,
          avatarUrl: input.avatarUrl ?? null,
        },
      });

      await this.audit.record(transaction, principal, {
        action: "event.speaker.created",
        resourceType: "event_speaker",
        resourceId: speaker.id,
        metadata: { eventId, role: speaker.role },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event_speaker",
        aggregateId: speaker.id,
        eventType: "event.speaker.created",
        payload: this.toJson(speaker),
      });
      return speaker;
    });
  }

  async updateSpeaker(
    principal: Principal,
    eventId: string,
    speakerId: string,
    input: UpdateEventSpeakerDto,
  ) {
    this.assertHost(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException("At least one speaker field is required");
    }

    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.eventSpeaker.findFirst({
        where: { id: speakerId, eventId },
        include: { event: { select: { status: true } } },
      });
      if (!existing) throw new NotFoundException("Speaker profile not found");
      if (TERMINAL_EVENT_STATUSES.includes(existing.event.status)) {
        throw new ConflictException(
          `A ${existing.event.status} event cannot change stage profiles`,
        );
      }

      if (input.userId) {
        const membership = await transaction.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: principal.workspaceId,
              userId: input.userId,
            },
          },
          select: { id: true },
        });
        if (!membership) {
          throw new BadRequestException(
            "Linked speaker user must belong to the current workspace",
          );
        }
      }

      const speaker = await transaction.eventSpeaker.update({
        where: { id: speakerId },
        data: {
          ...(input.userId !== undefined ? { userId: input.userId } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.displayName !== undefined
            ? { displayName: input.displayName.trim() }
            : {}),
          ...(input.email !== undefined
            ? { email: input.email?.toLowerCase() ?? null }
            : {}),
          ...(input.title !== undefined
            ? { title: input.title?.trim() || null }
            : {}),
          ...(input.bio !== undefined
            ? { bio: input.bio?.trim() || null }
            : {}),
          ...(input.avatarUrl !== undefined
            ? { avatarUrl: input.avatarUrl }
            : {}),
        },
      });

      await this.audit.record(transaction, principal, {
        action: "event.speaker.updated",
        resourceType: "event_speaker",
        resourceId: speaker.id,
        metadata: { eventId, role: speaker.role },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event_speaker",
        aggregateId: speaker.id,
        eventType: "event.speaker.updated",
        payload: this.toJson(speaker),
      });
      return speaker;
    });
  }

  async deleteSpeaker(
    principal: Principal,
    eventId: string,
    speakerId: string,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const existing = await transaction.eventSpeaker.findFirst({
        where: { id: speakerId, eventId },
        include: { event: { select: { status: true } } },
      });
      if (!existing) throw new NotFoundException("Speaker profile not found");
      if (TERMINAL_EVENT_STATUSES.includes(existing.event.status)) {
        throw new ConflictException(
          `A ${existing.event.status} event cannot change stage profiles`,
        );
      }

      await transaction.eventSpeaker.delete({ where: { id: speakerId } });
      await this.audit.record(transaction, principal, {
        action: "event.speaker.deleted",
        resourceType: "event_speaker",
        resourceId: speakerId,
        metadata: { eventId, role: existing.role },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: "event_speaker",
        aggregateId: speakerId,
        eventType: "event.speaker.deleted",
        payload: { eventId, speakerId, role: existing.role },
      });
      return { id: speakerId, deleted: true as const };
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
      speakers: event.speakers.map((speaker) => ({
        id: speaker.id,
        role: speaker.role,
        displayName: speaker.displayName,
        title: speaker.title,
        bio: speaker.bio,
        avatarUrl: speaker.avatarUrl,
      })),
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
      const registrationFields = this.registrationFields(event.registrationFields);
      const answers = normalizeRegistrationAnswers(
        registrationFields,
        input.answers,
      );
      const registration = await transaction.eventRegistration.create({
        data: {
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          eventId: event.id,
          name: input.name.trim(),
          email: input.email.toLowerCase(),
          answers: answers as Prisma.InputJsonValue,
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
      return registration;
    });
  }

  private registrationFields(
    value: Prisma.JsonValue,
  ): NormalizedEventRegistrationField[] {
    if (!Array.isArray(value)) return [];
    return normalizeRegistrationFields(
      value as unknown as EventRegistrationFieldDto[],
    );
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
      include: {
        speakers: { orderBy: { position: "asc" } },
        _count: { select: { registrations: true } },
      },
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
