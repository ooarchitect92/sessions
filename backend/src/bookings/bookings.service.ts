import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  SessionKind,
  SessionStatus,
  type BookingPage,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  AvailabilityRuleDto,
  CreateBookingPageDto,
  IntakeFieldDto,
  IntakeFieldType,
} from './dto/create-booking-page.dto';
import { ManageReservationDto } from './dto/manage-reservation.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { ReserveBookingDto } from './dto/reserve-booking.dto';
import { UpdateBookingPageDto } from './dto/update-booking-page.dto';

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly publicDatabase: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    principal: Principal,
    input: CreateBookingPageDto,
    idempotencyKey: string,
  ): Promise<BookingPage | Prisma.JsonObject> {
    this.assertHost(principal);
    this.assertTimeZone(input.timezone);
    this.assertAvailabilityRules(input.availabilityRules);
    this.assertIntakeFields(input.intakeFields);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ operation: 'booking.create', input }))
      .digest('hex');

    return this.database.run(principal, async (transaction) => {
      const lockKey = `booking.create:${principal.workspaceId}:${idempotencyKey}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const existing = await transaction.idempotencyKey.findUnique({
        where: {
          workspaceId_key: { workspaceId: principal.workspaceId, key: idempotencyKey },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'This idempotency key was already used with a different request',
          );
        }
        return existing.response as Prisma.JsonObject;
      }

      const duplicate = await transaction.bookingPage.findUnique({
        where: { workspaceId_slug: { workspaceId: principal.workspaceId, slug: input.slug } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('A booking page with this slug already exists');

      const page = await transaction.bookingPage.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          createdById: principal.userId,
          slug: input.slug,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          minimumNoticeMinutes: input.minimumNoticeMinutes,
          bufferBeforeMinutes: input.bufferBeforeMinutes,
          bufferAfterMinutes: input.bufferAfterMinutes,
          availabilityRules: input.availabilityRules as unknown as Prisma.InputJsonValue,
          intakeFields: input.intakeFields as Prisma.InputJsonValue,
        },
      });
      const response = this.toJson(page);
      await this.audit.record(transaction, principal, {
        action: 'booking_page.created',
        resourceType: 'booking_page',
        resourceId: page.id,
        metadata: { slug: page.slug },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'booking_page',
        aggregateId: page.id,
        eventType: 'booking.page.created',
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
      return page;
    });
  }

  async list(principal: Principal) {
    return this.database.run(principal, (transaction) =>
      transaction.bookingPage.findMany({
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
        include: { _count: { select: { reservations: true } } },
      }),
    );
  }

  async getById(principal: Principal, id: string) {
    return this.database.run(principal, async (transaction) => {
      const page = await transaction.bookingPage.findUnique({
        where: { id },
        include: { _count: { select: { reservations: true } } },
      });
      if (!page) throw new NotFoundException('Booking page not found');
      return page;
    });
  }

  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    input: UpdateBookingPageDto,
  ): Promise<BookingPage> {
    this.assertHost(principal);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one booking page field must be supplied');
    }
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);
    if (input.availabilityRules !== undefined) {
      this.assertAvailabilityRules(input.availabilityRules);
    }
    if (input.intakeFields !== undefined) {
      this.assertIntakeFields(input.intakeFields);
    }

    return this.database.run(principal, async (transaction) => {
      if (input.slug !== undefined) {
        const duplicate = await transaction.bookingPage.findFirst({
          where: { workspaceId: principal.workspaceId, slug: input.slug, id: { not: id } },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException('A booking page with this slug already exists');
        }
      }
      const result = await transaction.bookingPage.updateMany({
        where: { id, version: expectedVersion },
        data: {
          version: { increment: 1 },
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.durationMinutes !== undefined
            ? { durationMinutes: input.durationMinutes }
            : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.minimumNoticeMinutes !== undefined
            ? { minimumNoticeMinutes: input.minimumNoticeMinutes }
            : {}),
          ...(input.bufferBeforeMinutes !== undefined
            ? { bufferBeforeMinutes: input.bufferBeforeMinutes }
            : {}),
          ...(input.bufferAfterMinutes !== undefined
            ? { bufferAfterMinutes: input.bufferAfterMinutes }
            : {}),
          ...(input.availabilityRules !== undefined
            ? {
                availabilityRules:
                  input.availabilityRules as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(input.intakeFields !== undefined
            ? { intakeFields: input.intakeFields as Prisma.InputJsonValue }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      if (result.count === 0) {
        const current = await transaction.bookingPage.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Booking page not found');
        throw new ConflictException(`Version conflict. Current version is ${current.version}`);
      }
      const page = await transaction.bookingPage.findUniqueOrThrow({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: 'booking_page.updated',
        resourceType: 'booking_page',
        resourceId: id,
        metadata: { previousVersion: expectedVersion, version: page.version },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'booking_page',
        aggregateId: id,
        eventType: 'booking.page.updated',
        payload: this.toJson(page),
      });
      return page;
    });
  }

  async listReservations(principal: Principal, bookingPageId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const page = await transaction.bookingPage.findUnique({
        where: { id: bookingPageId },
        select: { id: true },
      });
      if (!page) throw new NotFoundException('Booking page not found');
      return transaction.bookingReservation.findMany({
        where: { bookingPageId },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          bookingPageId: true,
          sessionId: true,
          name: true,
          email: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          answers: true,
          status: true,
          cancelledAt: true,
          rescheduleCount: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          session: true,
        },
      });
    });
  }

  async getPublished(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
  ) {
    const page = await this.findPublicPage(organizationSlug, workspaceSlug, bookingSlug);
    return this.publicShape(page);
  }

  async listPublicSlots(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Slot[]> {
    const page = await this.findPublicPage(organizationSlug, workspaceSlug, bookingSlug);
    const range = this.validateDateRange(dateFrom, dateTo);
    const reservations = await this.publicDatabase.bookingReservation.findMany({
      where: {
        bookingPageId: page.id,
        status: BookingStatus.CONFIRMED,
        startsAt: { lt: range.endExclusive },
        endsAt: { gt: range.start },
      },
      select: { startsAt: true, endsAt: true },
    });
    return this.generateSlots(page, dateFrom, dateTo, reservations);
  }

  async reserve(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    input: ReserveBookingDto,
  ) {
    this.assertTimeZone(input.timezone);
    const page = await this.findPublicPage(organizationSlug, workspaceSlug, bookingSlug);
    const normalizedAnswers = this.validateIntakeAnswers(page, input.answers);
    const requested = new Date(input.startsAt);
    const requestedParts = this.getZonedParts(requested, page.timezone);
    const localDate = this.formatCalendarDate(requestedParts);

    return this.publicDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${page.id}, 0))`;
      const reservations = await transaction.bookingReservation.findMany({
        where: {
          bookingPageId: page.id,
          status: BookingStatus.CONFIRMED,
          startsAt: { lt: new Date(requested.getTime() + 24 * 60 * 60 * 1000) },
          endsAt: { gt: new Date(requested.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { startsAt: true, endsAt: true },
      });
      const slots = this.generateSlots(page, localDate, localDate, reservations);
      const selected = slots.find((slot) => slot.startsAt === requested.toISOString());
      if (!selected) throw new ConflictException('The selected slot is no longer available');

      const sessionId = randomUUID();
      const managementToken = randomBytes(32).toString('base64url');
      const managementTokenHash = this.hashManagementToken(managementToken);
      const endsAt = new Date(selected.endsAt);
      await transaction.session.create({
        data: {
          id: sessionId,
          organizationId: page.organizationId,
          workspaceId: page.workspaceId,
          createdById: page.createdById,
          title: `${page.title} · ${input.name.trim()}`,
          kind: SessionKind.MEETING,
          status: SessionStatus.SCHEDULED,
          startsAt: requested,
          durationMinutes: page.durationMinutes,
          timezone: page.timezone,
          recordingEnabled: false,
          transcriptionEnabled: false,
          livekitRoomName: `session-${sessionId}`,
        },
      });
      const reservation = await transaction.bookingReservation.create({
        data: {
          organizationId: page.organizationId,
          workspaceId: page.workspaceId,
          bookingPageId: page.id,
          sessionId,
          name: input.name.trim(),
          email: input.email.toLowerCase(),
          startsAt: requested,
          endsAt,
          timezone: input.timezone,
          answers: normalizedAnswers,
          managementTokenHash,
        },
        include: { session: true },
      });
      const publicReservation = this.publicReservationShape(reservation);
      await this.outbox.enqueue(
        transaction,
        { organizationId: page.organizationId, workspaceId: page.workspaceId },
        {
          aggregateType: 'booking_reservation',
          aggregateId: reservation.id,
          eventType: 'booking.created',
          payload: this.toJson(publicReservation),
        },
      );
      return { ...publicReservation, managementToken };
    });
  }

  async reschedule(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    input: RescheduleReservationDto,
  ) {
    this.assertTimeZone(input.timezone);
    const page = await this.findPublicPage(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      false,
    );
    const requested = new Date(input.startsAt);
    const localDate = this.formatCalendarDate(
      this.getZonedParts(requested, page.timezone),
    );
    const managementTokenHash = this.hashManagementToken(input.managementToken);

    return this.publicDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${page.id}, 0))`;
      const reservation = await transaction.bookingReservation.findFirst({
        where: {
          id: reservationId,
          bookingPageId: page.id,
          managementTokenHash,
        },
        include: { session: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      if (reservation.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException('Only confirmed bookings can be rescheduled');
      }
      if (
        reservation.session &&
        ![SessionStatus.DRAFT, SessionStatus.SCHEDULED].includes(
          reservation.session.status,
        )
      ) {
        throw new ConflictException(
          `The linked session cannot be rescheduled while ${reservation.session.status}`,
        );
      }

      const reservations = await transaction.bookingReservation.findMany({
        where: {
          bookingPageId: page.id,
          id: { not: reservation.id },
          status: BookingStatus.CONFIRMED,
          startsAt: { lt: new Date(requested.getTime() + 24 * 60 * 60 * 1000) },
          endsAt: { gt: new Date(requested.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { startsAt: true, endsAt: true },
      });
      const slots = this.generateSlots(page, localDate, localDate, reservations);
      const selected = slots.find((slot) => slot.startsAt === requested.toISOString());
      if (!selected) throw new ConflictException('The selected slot is no longer available');

      const endsAt = new Date(selected.endsAt);
      const updated = await transaction.bookingReservation.update({
        where: { id: reservation.id },
        data: {
          startsAt: requested,
          endsAt,
          timezone: input.timezone,
          cancelledAt: null,
          rescheduleCount: { increment: 1 },
          version: { increment: 1 },
        },
        include: { session: true },
      });

      if (reservation.sessionId) {
        await transaction.session.update({
          where: { id: reservation.sessionId },
          data: {
            startsAt: requested,
            durationMinutes: page.durationMinutes,
            timezone: page.timezone,
            version: { increment: 1 },
          },
        });
      }

      const publicReservation = this.publicReservationShape(updated);
      await this.outbox.enqueue(
        transaction,
        { organizationId: page.organizationId, workspaceId: page.workspaceId },
        {
          aggregateType: 'booking_reservation',
          aggregateId: reservation.id,
          eventType: 'booking.rescheduled',
          payload: this.toJson(publicReservation),
        },
      );
      return publicReservation;
    });
  }

  async cancel(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    input: ManageReservationDto,
  ) {
    const page = await this.findPublicPage(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      false,
    );
    const managementTokenHash = this.hashManagementToken(input.managementToken);

    return this.publicDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservationId}, 0))`;
      const reservation = await transaction.bookingReservation.findFirst({
        where: {
          id: reservationId,
          bookingPageId: page.id,
          managementTokenHash,
        },
        include: { session: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      if (reservation.status === BookingStatus.CANCELLED) {
        return this.publicReservationShape(reservation);
      }
      if (reservation.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException('Only confirmed bookings can be cancelled');
      }
      if (
        reservation.session &&
        ![
          SessionStatus.DRAFT,
          SessionStatus.SCHEDULED,
          SessionStatus.CANCELLED,
        ].includes(reservation.session.status)
      ) {
        throw new ConflictException(
          `The linked session cannot be cancelled while ${reservation.session.status}`,
        );
      }

      if (
        reservation.sessionId &&
        reservation.session &&
        reservation.session.status !== SessionStatus.CANCELLED
      ) {
        await transaction.session.update({
          where: { id: reservation.sessionId },
          data: {
            status: SessionStatus.CANCELLED,
            version: { increment: 1 },
          },
        });
      }

      const updated = await transaction.bookingReservation.update({
        where: { id: reservation.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
        include: { session: true },
      });

      const publicReservation = this.publicReservationShape(updated);
      await this.outbox.enqueue(
        transaction,
        { organizationId: page.organizationId, workspaceId: page.workspaceId },
        {
          aggregateType: 'booking_reservation',
          aggregateId: reservation.id,
          eventType: 'booking.cancelled',
          payload: this.toJson(publicReservation),
        },
      );
      return publicReservation;
    });
  }

  async calendarFile(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    managementToken: string,
  ) {
    const page = await this.findPublicPage(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      false,
    );
    const reservation = await this.publicDatabase.bookingReservation.findFirst({
      where: {
        id: reservationId,
        bookingPageId: page.id,
        managementTokenHash: this.hashManagementToken(managementToken),
      },
      include: { session: true },
    });
    if (!reservation) throw new NotFoundException('Booking reservation not found');

    return this.buildCalendarFile({
      id: reservation.id,
      title: reservation.session?.title ?? page.title,
      description: page.description,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      status: reservation.status,
    });
  }

  private async findPublicPage(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    requireActive = true,
  ) {
    const organization = await this.publicDatabase.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException('Booking page not found');
    const workspace = await this.publicDatabase.workspace.findUnique({
      where: {
        organizationId_slug: { organizationId: organization.id, slug: workspaceSlug },
      },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Booking page not found');
    const page = await this.publicDatabase.bookingPage.findFirst({
      where: {
        workspaceId: workspace.id,
        slug: bookingSlug,
        ...(requireActive ? { active: true } : {}),
      },
    });
    if (!page) throw new NotFoundException('Booking page not found');
    return page;
  }

  private publicShape(page: BookingPage) {
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      durationMinutes: page.durationMinutes,
      timezone: page.timezone,
      minimumNoticeMinutes: page.minimumNoticeMinutes,
      availabilityRules: page.availabilityRules,
      intakeFields: page.intakeFields,
    };
  }

  private generateSlots(
    page: BookingPage,
    dateFrom: string,
    dateTo: string,
    reservations: { startsAt: Date; endsAt: Date }[],
  ): Slot[] {
    const from = this.parseCalendarDate(dateFrom);
    const to = this.parseCalendarDate(dateTo);
    const cursor = new Date(Date.UTC(from.year, from.month - 1, from.day, 12));
    const end = new Date(Date.UTC(to.year, to.month - 1, to.day, 12));
    const rules = page.availabilityRules as unknown as AvailabilityRuleDto[];
    const slots: Slot[] = [];
    const minimumStart = Date.now() + page.minimumNoticeMinutes * 60_000;

    while (cursor <= end) {
      const date: CalendarDate = {
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
        day: cursor.getUTCDate(),
      };
      const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
      for (const rule of rules.filter((candidate) => candidate.weekday === weekday)) {
        const [startHour, startMinute] = rule.startTime.split(':').map(Number) as [number, number];
        const [endHour, endMinute] = rule.endTime.split(':').map(Number) as [number, number];
        const windowStart = this.localDateTimeToUtc(
          date,
          startHour,
          startMinute,
          page.timezone,
        );
        const windowEnd = this.localDateTimeToUtc(date, endHour, endMinute, page.timezone);
        const stepMs = page.durationMinutes * 60_000;
        for (
          let startsAt = windowStart.getTime();
          startsAt + stepMs <= windowEnd.getTime();
          startsAt += stepMs
        ) {
          const endsAt = startsAt + stepMs;
          if (startsAt < minimumStart) continue;
          const effectiveStart = startsAt - page.bufferBeforeMinutes * 60_000;
          const effectiveEnd = endsAt + page.bufferAfterMinutes * 60_000;
          const overlaps = reservations.some((reservation) => {
            const existingStart =
              reservation.startsAt.getTime() - page.bufferBeforeMinutes * 60_000;
            const existingEnd =
              reservation.endsAt.getTime() + page.bufferAfterMinutes * 60_000;
            return effectiveStart < existingEnd && effectiveEnd > existingStart;
          });
          if (!overlaps) {
            slots.push({
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
            });
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return slots;
  }

  private validateDateRange(dateFrom: string, dateTo: string) {
    const from = this.parseCalendarDate(dateFrom);
    const to = this.parseCalendarDate(dateTo);
    const start = new Date(Date.UTC(from.year, from.month - 1, from.day));
    const end = new Date(Date.UTC(to.year, to.month - 1, to.day));
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (days < 0 || days > 31) {
      throw new BadRequestException('Slot searches must cover between 1 and 32 calendar days');
    }
    return { start, endExclusive: new Date(end.getTime() + 86_400_000) };
  }

  private parseCalendarDate(value: string): CalendarDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) throw new BadRequestException('Dates must use YYYY-MM-DD');
    const date = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
    const probe = new Date(Date.UTC(date.year, date.month - 1, date.day));
    if (
      probe.getUTCFullYear() !== date.year ||
      probe.getUTCMonth() + 1 !== date.month ||
      probe.getUTCDate() !== date.day
    ) {
      throw new BadRequestException('The supplied calendar date is invalid');
    }
    return date;
  }

  private formatCalendarDate(date: CalendarDate): string {
    return `${date.year.toString().padStart(4, '0')}-${date.month
      .toString()
      .padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;
  }

  private localDateTimeToUtc(
    date: CalendarDate,
    hour: number,
    minute: number,
    timeZone: string,
  ): Date {
    const desired = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
    let guess = desired;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const parts = this.getZonedParts(new Date(guess), timeZone);
      const represented = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
      );
      const correction = desired - represented;
      guess += correction;
      if (correction === 0) break;
    }
    return new Date(guess);
  }

  private getZonedParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  }

  private publicReservationShape(reservation: {
    id: string;
    bookingPageId: string;
    sessionId: string | null;
    name: string;
    email: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    answers: Prisma.JsonValue;
    status: BookingStatus;
    cancelledAt: Date | null;
    rescheduleCount: number;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    session?: {
      id: string;
      title: string;
      status: SessionStatus;
    } | null;
  }) {
    return {
      id: reservation.id,
      bookingPageId: reservation.bookingPageId,
      sessionId: reservation.sessionId,
      name: reservation.name,
      email: reservation.email,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      timezone: reservation.timezone,
      answers: reservation.answers,
      status: reservation.status,
      cancelledAt: reservation.cancelledAt,
      rescheduleCount: reservation.rescheduleCount,
      version: reservation.version,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
      session: reservation.session
        ? {
            id: reservation.session.id,
            title: reservation.session.title,
            status: reservation.session.status,
          }
        : null,
    };
  }

  private hashManagementToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildCalendarFile(input: {
    id: string;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    status: BookingStatus;
  }) {
    const status =
      input.status === BookingStatus.CANCELLED ? 'CANCELLED' : 'CONFIRMED';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sessions//Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${input.id}@sessions`,
      `DTSTAMP:${this.formatIcsDate(new Date())}`,
      `DTSTART:${this.formatIcsDate(input.startsAt)}`,
      `DTEND:${this.formatIcsDate(input.endsAt)}`,
      `SUMMARY:${this.escapeIcs(input.title)}`,
      `DESCRIPTION:${this.escapeIcs(input.description ?? 'Scheduled through Sessions')}`,
      `STATUS:${status}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ];
    return {
      filename: `session-${input.id}.ics`,
      contentType: 'text/calendar; charset=utf-8',
      content: lines.join('\r\n'),
    };
  }

  private formatIcsDate(value: Date): string {
    return value
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private escapeIcs(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll(';', '\\;')
      .replaceAll(',', '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private assertIntakeFields(fields: IntakeFieldDto[]): void {
    const keys = new Set<string>();
    for (const field of fields) {
      if (keys.has(field.key)) {
        throw new BadRequestException(`Duplicate intake field key: ${field.key}`);
      }
      keys.add(field.key);

      const options = (field.options ?? []).map((option) => option.trim());
      if (field.type === IntakeFieldType.SELECT) {
        if (options.length === 0) {
          throw new BadRequestException(
            `Select intake field "${field.label}" requires at least one option`,
          );
        }
        if (
          options.some((option) => option.length === 0 || option.length > 160) ||
          new Set(options).size !== options.length
        ) {
          throw new BadRequestException(
            `Select intake field "${field.label}" has invalid or duplicate options`,
          );
        }
      } else if (options.length > 0) {
        throw new BadRequestException(
          `Only select intake fields may define options`,
        );
      }
    }
  }

  private validateIntakeAnswers(
    page: BookingPage,
    answers: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const fields = page.intakeFields as unknown as IntakeFieldDto[];
    this.assertIntakeFields(fields);
    const fieldByKey = new Map(fields.map((field) => [field.key, field]));
    for (const key of Object.keys(answers)) {
      if (!fieldByKey.has(key)) {
        throw new BadRequestException(`Unknown intake field: ${key}`);
      }
    }

    const normalized: Record<string, Prisma.InputJsonValue> = {};
    for (const field of fields) {
      const value = answers[field.key];
      if (value === undefined || value === null || value === '') {
        if (field.required) {
          throw new BadRequestException(
            `Intake field "${field.label}" is required`,
          );
        }
        continue;
      }

      if (
        field.type === IntakeFieldType.CHECKBOX ||
        field.type === IntakeFieldType.CONSENT
      ) {
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `Intake field "${field.label}" must be true or false`,
          );
        }
        if (field.required && value !== true) {
          throw new BadRequestException(
            `Intake field "${field.label}" must be accepted`,
          );
        }
        normalized[field.key] = value;
        continue;
      }

      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Intake field "${field.label}" must be text`,
        );
      }
      const text = value.trim();
      const maxLength =
        field.type === IntakeFieldType.TEXTAREA ? 5000 : 1000;
      if (!text && field.required) {
        throw new BadRequestException(
          `Intake field "${field.label}" is required`,
        );
      }
      if (text.length > maxLength) {
        throw new BadRequestException(
          `Intake field "${field.label}" is too long`,
        );
      }
      if (
        field.type === IntakeFieldType.EMAIL &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
      ) {
        throw new BadRequestException(
          `Intake field "${field.label}" must be a valid email address`,
        );
      }
      if (
        field.type === IntakeFieldType.SELECT &&
        !(field.options ?? []).map((option) => option.trim()).includes(text)
      ) {
        throw new BadRequestException(
          `Intake field "${field.label}" contains an invalid option`,
        );
      }
      normalized[field.key] = text;
    }
    return normalized as Prisma.InputJsonObject;
  }

  private assertAvailabilityRules(rules: AvailabilityRuleDto[]): void {
    for (const rule of rules) {
      if (rule.startTime >= rule.endTime) {
        throw new BadRequestException('Availability windows must end after they start');
      }
    }
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }

  private toJson(value: unknown): Prisma.JsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
  }
}
