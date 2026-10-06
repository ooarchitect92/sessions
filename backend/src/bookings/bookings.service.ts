import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  CalendarConnectionStatus,
  CalendarSyncAction,
  CalendarSyncStatus,
  Prisma,
  SessionKind,
  SessionStatus,
  type BookingPage,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { SecurityService } from '../auth/security.service';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import {
  assertPublicFormFields,
  validatePublicFormAnswers,
} from '../common/forms/public-form-validation';
import type { PublicFormFieldDto } from '../common/forms/public-form-field.dto';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CalendarIntegrationsService } from '../integrations/calendar-integrations.service';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import {
  AvailabilityRuleDto,
  CreateBookingPageDto,
} from './dto/create-booking-page.dto';
import { ReserveBookingDto } from './dto/reserve-booking.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { CalendarInviteService } from './calendar-invite.service';
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
    private readonly calendarInvite: CalendarInviteService,
    private readonly calendars: CalendarIntegrationsService,
    private readonly notifications: NotificationSchedulerService,
    private readonly security: SecurityService,
  ) {}

  async create(
    principal: Principal,
    input: CreateBookingPageDto,
    idempotencyKey: string,
  ): Promise<BookingPage | Prisma.JsonObject> {
    this.assertHost(principal);
    this.assertTimeZone(input.timezone);
    this.assertAvailabilityRules(input.availabilityRules);
    assertPublicFormFields(input.intakeFields);
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
          intakeFields: input.intakeFields as unknown as Prisma.InputJsonValue,
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
      assertPublicFormFields(input.intakeFields);
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
            ? { intakeFields: input.intakeFields as unknown as Prisma.InputJsonValue }
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
        include: {
          session: true,
          calendarEventSyncs: {
            select: {
              id: true,
              provider: true,
              action: true,
              status: true,
              providerEventId: true,
              attempts: true,
              syncedAt: true,
              failureCode: true,
              updatedAt: true,
            },
            orderBy: { provider: 'asc' },
          },
        },
      });
    });
  }

  async getReservationCalendar(
    principal: Principal,
    bookingPageId: string,
    reservationId: string,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const reservation = await transaction.bookingReservation.findFirst({
        where: { id: reservationId, bookingPageId },
        include: { bookingPage: true, session: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      return this.calendarInvite.create({
        reservation,
        bookingPage: reservation.bookingPage,
        session: reservation.session,
      });
    });
  }

  async rescheduleReservation(
    principal: Principal,
    bookingPageId: string,
    reservationId: string,
    expectedVersion: number,
    input: RescheduleReservationDto,
  ) {
    this.assertHost(principal);
    this.assertTimeZone(input.timezone);
    const requested = new Date(input.startsAt);
    if (Number.isNaN(requested.getTime())) {
      throw new BadRequestException('startsAt must be a valid ISO timestamp');
    }

    return this.database.run(principal, async (transaction) => {
      const page = await transaction.bookingPage.findUnique({
        where: { id: bookingPageId },
      });
      if (!page) throw new NotFoundException('Booking page not found');

      const reservation = await transaction.bookingReservation.findFirst({
        where: { id: reservationId, bookingPageId },
        include: { session: true, bookingPage: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      if (reservation.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException('Only confirmed reservations can be rescheduled');
      }
      if (reservation.version !== expectedVersion) {
        throw new ConflictException(
          `Version conflict. Current version is ${reservation.version}`,
        );
      }

      const requestedParts = this.getZonedParts(requested, page.timezone);
      const localDate = this.formatCalendarDate(requestedParts);
      const dayRange = this.validateDateRange(localDate, localDate);
      const externalBusy = await this.calendars.getBusyIntervalsForUser({
        workspaceId: page.workspaceId,
        userId: page.createdById,
        startsAt: dayRange.start,
        endsAt: dayRange.endExclusive,
      });
      const reservations = await transaction.bookingReservation.findMany({
        where: {
          bookingPageId,
          id: { not: reservationId },
          status: BookingStatus.CONFIRMED,
          startsAt: { lt: new Date(requested.getTime() + 24 * 60 * 60 * 1000) },
          endsAt: { gt: new Date(requested.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { startsAt: true, endsAt: true },
      });
      const available = this.generateSlots(page, localDate, localDate, [
        ...reservations,
        ...externalBusy,
      ]);
      const selected = available.find(
        (slot) => slot.startsAt === requested.toISOString(),
      );
      if (!selected) {
        throw new ConflictException('The selected slot is no longer available');
      }

      const endsAt = new Date(selected.endsAt);
      const updatedCount = await transaction.bookingReservation.updateMany({
        where: {
          id: reservationId,
          bookingPageId,
          version: expectedVersion,
          status: BookingStatus.CONFIRMED,
        },
        data: {
          startsAt: requested,
          endsAt,
          timezone: input.timezone,
          rescheduledAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updatedCount.count === 0) {
        throw new ConflictException('The reservation changed while rescheduling');
      }

      if (reservation.sessionId && reservation.session) {
        if (
          reservation.session.status !== SessionStatus.DRAFT &&
          reservation.session.status !== SessionStatus.SCHEDULED
        ) {
          throw new ConflictException(
            'The linked session can no longer be rescheduled',
          );
        }
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

      const updated = await transaction.bookingReservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: { bookingPage: true, session: true },
      });
      await this.audit.record(transaction, principal, {
        action: 'booking.rescheduled',
        resourceType: 'booking_reservation',
        resourceId: reservationId,
        metadata: {
          bookingPageId,
          previousStartsAt: reservation.startsAt.toISOString(),
          startsAt: updated.startsAt.toISOString(),
          previousVersion: expectedVersion,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'booking_reservation',
        aggregateId: reservationId,
        eventType: 'booking.rescheduled',
        payload: this.toJson(updated),
      });
      await this.queueCalendarEventSyncs(transaction, {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        userId: page.createdById,
        reservationId,
        action: CalendarSyncAction.UPDATE,
      });
      await this.notifications.rescheduleBookingLifecycleEmails(transaction, {
        bookingPage: updated.bookingPage,
        reservation: updated,
      });
      return updated;
    });
  }

  async cancelReservation(
    principal: Principal,
    bookingPageId: string,
    reservationId: string,
    expectedVersion: number,
  ) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const reservation = await transaction.bookingReservation.findFirst({
        where: { id: reservationId, bookingPageId },
        include: { session: true, bookingPage: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      if (reservation.status === BookingStatus.CANCELLED) {
        return transaction.bookingReservation.findUniqueOrThrow({
          where: { id: reservationId },
          include: { session: true },
        });
      }
      if (reservation.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException('Only confirmed reservations can be cancelled');
      }
      if (reservation.version !== expectedVersion) {
        throw new ConflictException(
          `Version conflict. Current version is ${reservation.version}`,
        );
      }

      const result = await transaction.bookingReservation.updateMany({
        where: {
          id: reservationId,
          bookingPageId,
          version: expectedVersion,
          status: BookingStatus.CONFIRMED,
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('The reservation changed while cancelling');
      }

      if (
        reservation.sessionId &&
        reservation.session &&
        (reservation.session.status === SessionStatus.DRAFT ||
          reservation.session.status === SessionStatus.SCHEDULED)
      ) {
        await transaction.session.update({
          where: { id: reservation.sessionId },
          data: {
            status: SessionStatus.CANCELLED,
            version: { increment: 1 },
          },
        });
      }

      const updated = await transaction.bookingReservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: { session: true },
      });
      await this.audit.record(transaction, principal, {
        action: 'booking.cancelled',
        resourceType: 'booking_reservation',
        resourceId: reservationId,
        metadata: {
          bookingPageId,
          previousVersion: expectedVersion,
          version: updated.version,
        },
      });
      await this.outbox.enqueue(transaction, principal, {
        aggregateType: 'booking_reservation',
        aggregateId: reservationId,
        eventType: 'booking.cancelled',
        payload: this.toJson(updated),
      });
      await this.queueCalendarEventSyncs(transaction, {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        userId: reservation.bookingPage.createdById,
        reservationId,
        action: CalendarSyncAction.CANCEL,
      });
      await this.notifications.cancelBookingLifecycleEmails(transaction, {
        bookingPage: reservation.bookingPage,
        reservation: updated,
      });
      return updated;
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
    const [reservations, externalBusy] = await Promise.all([
      this.publicDatabase.bookingReservation.findMany({
        where: {
          bookingPageId: page.id,
          status: BookingStatus.CONFIRMED,
          startsAt: { lt: range.endExclusive },
          endsAt: { gt: range.start },
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.calendars.getBusyIntervalsForUser({
        workspaceId: page.workspaceId,
        userId: page.createdById,
        startsAt: range.start,
        endsAt: range.endExclusive,
      }),
    ]);
    return this.generateSlots(page, dateFrom, dateTo, [
      ...reservations,
      ...externalBusy,
    ]);
  }

  async reserve(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    input: ReserveBookingDto,
  ) {
    this.assertTimeZone(input.timezone);
    const page = await this.findPublicPage(organizationSlug, workspaceSlug, bookingSlug);
    const normalizedAnswers = validatePublicFormAnswers(
      page.intakeFields as unknown as PublicFormFieldDto[],
      input.answers,
    );
    const requested = new Date(input.startsAt);
    const requestedParts = this.getZonedParts(requested, page.timezone);
    const localDate = this.formatCalendarDate(requestedParts);
    const dayRange = this.validateDateRange(localDate, localDate);
    const externalBusy = await this.calendars.getBusyIntervalsForUser({
      workspaceId: page.workspaceId,
      userId: page.createdById,
      startsAt: dayRange.start,
      endsAt: dayRange.endExclusive,
    });

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
      const slots = this.generateSlots(page, localDate, localDate, [
        ...reservations,
        ...externalBusy,
      ]);
      const selected = slots.find((slot) => slot.startsAt === requested.toISOString());
      if (!selected) throw new ConflictException('The selected slot is no longer available');

      const sessionId = randomUUID();
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
      const reservationId = randomUUID();
      const manageToken = this.security.createOpaqueToken(reservationId);
      const reservation = await transaction.bookingReservation.create({
        data: {
          id: reservationId,
          organizationId: page.organizationId,
          workspaceId: page.workspaceId,
          bookingPageId: page.id,
          sessionId,
          name: input.name.trim(),
          email: input.email.toLowerCase(),
          startsAt: requested,
          endsAt,
          timezone: input.timezone,
          answers: normalizedAnswers as Prisma.InputJsonValue,
          manageTokenHash: manageToken.tokenHash,
          manageTokenExpiresAt: new Date(endsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        include: { session: true },
      });
      await this.outbox.enqueue(
        transaction,
        { organizationId: page.organizationId, workspaceId: page.workspaceId },
        {
          aggregateType: 'booking_reservation',
          aggregateId: reservation.id,
          eventType: 'booking.created',
          payload: this.toJson(reservation),
        },
      );
      await this.queueCalendarEventSyncs(transaction, {
        organizationId: page.organizationId,
        workspaceId: page.workspaceId,
        userId: page.createdById,
        reservationId: reservation.id,
        action: CalendarSyncAction.CREATE,
      });
      await this.notifications.queueBookingLifecycleEmails(transaction, {
        bookingPage: page,
        reservation,
      });
      return {
        ...this.publicReservationShape(reservation),
        manageToken: manageToken.token,
      };
    });
  }

  async getPublicReservationManagement(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    token: string,
  ) {
    const { reservation } = await this.resolveManagedReservation(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      token,
    );
    return this.publicReservationShape(reservation);
  }

  async reschedulePublicReservation(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    token: string,
    input: RescheduleReservationDto,
  ) {
    this.assertTimeZone(input.timezone);
    const managed = await this.resolveManagedReservation(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      token,
    );
    const page = managed.page;
    const current = managed.reservation;
    if (current.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException('Only confirmed reservations can be rescheduled');
    }

    const requested = new Date(input.startsAt);
    if (Number.isNaN(requested.getTime())) {
      throw new BadRequestException('startsAt must be a valid ISO timestamp');
    }
    const requestedParts = this.getZonedParts(requested, page.timezone);
    const localDate = this.formatCalendarDate(requestedParts);
    const dayRange = this.validateDateRange(localDate, localDate);
    const externalBusy = await this.calendars.getBusyIntervalsForUser({
      workspaceId: page.workspaceId,
      userId: page.createdById,
      startsAt: dayRange.start,
      endsAt: dayRange.endExclusive,
    });

    return this.publicDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservationId}, 0))`;
      const reservation = await transaction.bookingReservation.findFirst({
        where: { id: reservationId, bookingPageId: page.id },
        include: { session: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      this.assertManageToken(reservation, reservationId, token);
      if (reservation.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException('Only confirmed reservations can be rescheduled');
      }

      const reservations = await transaction.bookingReservation.findMany({
        where: {
          bookingPageId: page.id,
          id: { not: reservationId },
          status: BookingStatus.CONFIRMED,
          startsAt: { lt: new Date(requested.getTime() + 24 * 60 * 60 * 1000) },
          endsAt: { gt: new Date(requested.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { startsAt: true, endsAt: true },
      });
      const slots = this.generateSlots(page, localDate, localDate, [
        ...reservations,
        ...externalBusy,
      ]);
      const selected = slots.find((slot) => slot.startsAt === requested.toISOString());
      if (!selected) {
        throw new ConflictException('The selected slot is no longer available');
      }

      const endsAt = new Date(selected.endsAt);
      if (
        reservation.sessionId &&
        reservation.session &&
        reservation.session.status !== SessionStatus.DRAFT &&
        reservation.session.status !== SessionStatus.SCHEDULED
      ) {
        throw new ConflictException('The linked session can no longer be rescheduled');
      }

      const updatedCount = await transaction.bookingReservation.updateMany({
        where: {
          id: reservationId,
          bookingPageId: page.id,
          version: reservation.version,
          status: BookingStatus.CONFIRMED,
        },
        data: {
          startsAt: requested,
          endsAt,
          timezone: input.timezone,
          rescheduledAt: new Date(),
          manageTokenExpiresAt: new Date(endsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          version: { increment: 1 },
        },
      });
      if (updatedCount.count === 0) {
        throw new ConflictException('The reservation changed while rescheduling');
      }

      if (reservation.sessionId && reservation.session) {
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

      const updated = await transaction.bookingReservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: { bookingPage: true, session: true },
      });
      await this.outbox.enqueue(
        transaction,
        { organizationId: page.organizationId, workspaceId: page.workspaceId },
        {
          aggregateType: 'booking_reservation',
          aggregateId: reservationId,
          eventType: 'booking.rescheduled',
          payload: this.toJson(updated),
        },
      );
      await this.queueCalendarEventSyncs(transaction, {
        organizationId: page.organizationId,
        workspaceId: page.workspaceId,
        userId: page.createdById,
        reservationId,
        action: CalendarSyncAction.UPDATE,
      });
      await this.notifications.rescheduleBookingLifecycleEmails(transaction, {
        bookingPage: updated.bookingPage,
        reservation: updated,
      });
      return this.publicReservationShape(updated);
    });
  }

  async cancelPublicReservation(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    token: string,
  ) {
    const managed = await this.resolveManagedReservation(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      token,
    );
    const page = managed.page;

    return this.publicDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservationId}, 0))`;
      const reservation = await transaction.bookingReservation.findFirst({
        where: { id: reservationId, bookingPageId: page.id },
        include: { session: true },
      });
      if (!reservation) throw new NotFoundException('Booking reservation not found');
      this.assertManageToken(reservation, reservationId, token);
      if (reservation.status === BookingStatus.CANCELLED) {
        return this.publicReservationShape(reservation);
      }
      if (reservation.status !== BookingStatus.CONFIRMED) {
        throw new ConflictException('Only confirmed reservations can be cancelled');
      }

      const result = await transaction.bookingReservation.updateMany({
        where: {
          id: reservationId,
          bookingPageId: page.id,
          version: reservation.version,
          status: BookingStatus.CONFIRMED,
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('The reservation changed while cancelling');
      }

      if (
        reservation.sessionId &&
        reservation.session &&
        (reservation.session.status === SessionStatus.DRAFT ||
          reservation.session.status === SessionStatus.SCHEDULED)
      ) {
        await transaction.session.update({
          where: { id: reservation.sessionId },
          data: {
            status: SessionStatus.CANCELLED,
            version: { increment: 1 },
          },
        });
      }

      const updated = await transaction.bookingReservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: { bookingPage: true, session: true },
      });
      await this.outbox.enqueue(
        transaction,
        { organizationId: page.organizationId, workspaceId: page.workspaceId },
        {
          aggregateType: 'booking_reservation',
          aggregateId: reservationId,
          eventType: 'booking.cancelled',
          payload: this.toJson(updated),
        },
      );
      await this.queueCalendarEventSyncs(transaction, {
        organizationId: page.organizationId,
        workspaceId: page.workspaceId,
        userId: page.createdById,
        reservationId,
        action: CalendarSyncAction.CANCEL,
      });
      await this.notifications.cancelBookingLifecycleEmails(transaction, {
        bookingPage: updated.bookingPage,
        reservation: updated,
      });
      return this.publicReservationShape(updated);
    });
  }

  private async resolveManagedReservation(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
    reservationId: string,
    token: string,
  ) {
    const page = await this.findPublicPage(organizationSlug, workspaceSlug, bookingSlug);
    const reservation = await this.publicDatabase.bookingReservation.findFirst({
      where: { id: reservationId, bookingPageId: page.id },
      include: { session: true },
    });
    if (!reservation) throw new NotFoundException('Booking reservation not found');
    this.assertManageToken(reservation, reservationId, token);
    return { page, reservation };
  }

  private assertManageToken(
    reservation: {
      manageTokenHash: string | null;
      manageTokenExpiresAt: Date | null;
    },
    reservationId: string,
    token: string,
  ): void {
    const parsed = token ? this.security.parseOpaqueToken(token) : null;
    if (
      !parsed ||
      parsed.id !== reservationId ||
      !reservation.manageTokenHash ||
      !reservation.manageTokenExpiresAt ||
      reservation.manageTokenExpiresAt <= new Date() ||
      !this.security.verifyTokenDigest(parsed.secret, reservation.manageTokenHash)
    ) {
      throw new NotFoundException('Booking reservation not found');
    }
  }

  private publicReservationShape(reservation: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    status: BookingStatus;
    version: number;
    rescheduledAt: Date | null;
    cancelledAt: Date | null;
    session?: { id: string; title: string } | null;
  }) {
    return {
      id: reservation.id,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      timezone: reservation.timezone,
      status: reservation.status,
      version: reservation.version,
      rescheduledAt: reservation.rescheduledAt,
      cancelledAt: reservation.cancelledAt,
      session: reservation.session
        ? { id: reservation.session.id, title: reservation.session.title }
        : null,
    };
  }

  private async queueCalendarEventSyncs(
    transaction: Prisma.TransactionClient,
    input: {
      organizationId: string;
      workspaceId: string;
      userId: string;
      reservationId: string;
      action: CalendarSyncAction;
    },
  ): Promise<void> {
    const connections = await transaction.calendarConnection.findMany({
      where: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        syncEnabled: true,
        status: {
          in: [
            CalendarConnectionStatus.CONNECTED,
            CalendarConnectionStatus.ERROR,
          ],
        },
      },
      select: { id: true, provider: true },
    });

    for (const connection of connections) {
      await transaction.calendarEventSync.upsert({
        where: {
          reservationId_connectionId: {
            reservationId: input.reservationId,
            connectionId: connection.id,
          },
        },
        update: {
          action: input.action,
          status: CalendarSyncStatus.PENDING,
          attempts: 0,
          nextAttemptAt: null,
          failureCode: null,
          syncedAt: null,
          version: { increment: 1 },
        },
        create: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          reservationId: input.reservationId,
          connectionId: connection.id,
          provider: connection.provider,
          action: input.action,
          status: CalendarSyncStatus.PENDING,
        },
      });
    }
  }

  private async findPublicPage(
    organizationSlug: string,
    workspaceSlug: string,
    bookingSlug: string,
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
      where: { workspaceId: workspace.id, slug: bookingSlug, active: true },
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
