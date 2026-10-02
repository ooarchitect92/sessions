import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { BookingsService } from './bookings.service';
import { ListSlotsQuery } from './dto/list-slots.query';
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
}
