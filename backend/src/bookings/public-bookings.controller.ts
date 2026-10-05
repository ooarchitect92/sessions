import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { BookingsService } from './bookings.service';
import { ListSlotsQuery } from './dto/list-slots.query';
import {
  ManageReservationDto,
  ManageReservationQueryDto,
} from './dto/manage-reservation.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { ReserveBookingDto } from './dto/reserve-booking.dto';

@ApiTags('public-bookings')
@Public()
@Controller('public/:organizationSlug/:workspaceSlug/bookings')
export class PublicBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get(':bookingSlug')
  getPublished(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
  ) {
    return this.bookings.getPublished(organizationSlug, workspaceSlug, bookingSlug);
  }

  @Get(':bookingSlug/slots')
  slots(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
    @Query() query: ListSlotsQuery,
  ) {
    return this.bookings.listPublicSlots(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      query.dateFrom,
      query.dateTo,
    );
  }

  @Post(':bookingSlug/reservations')
  reserve(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
    @Body() body: ReserveBookingDto,
  ) {
    return this.bookings.reserve(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      body,
    );
  }

  @Get(':bookingSlug/reservations/:reservationId')
  managedReservation(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Query() query: ManageReservationQueryDto,
  ) {
    return this.bookings.getManagedReservation(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      query.token,
    );
  }

  @Post(':bookingSlug/reservations/:reservationId/reschedule')
  reschedule(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Body() body: RescheduleReservationDto,
  ) {
    return this.bookings.reschedule(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      body,
    );
  }

  @Post(':bookingSlug/reservations/:reservationId/cancel')
  cancel(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Body() body: ManageReservationDto,
  ) {
    return this.bookings.cancel(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      body,
    );
  }

  @Get(':bookingSlug/reservations/:reservationId/calendar')
  calendar(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('bookingSlug') bookingSlug: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Query() query: ManageReservationQueryDto,
  ) {
    return this.bookings.calendarFile(
      organizationSlug,
      workspaceSlug,
      bookingSlug,
      reservationId,
      query.token,
    );
  }
}
