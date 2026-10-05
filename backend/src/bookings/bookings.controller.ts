import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { BookingsService } from './bookings.service';
import { CreateBookingPageDto } from './dto/create-booking-page.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { UpdateBookingPageDto } from './dto/update-booking-page.dto';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateBookingPageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    return this.bookings.create(principal, body, idempotencyKey);
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.bookings.list(principal);
  }

  @Get(':id')
  getById(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.bookings.getById(principal, id);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateBookingPageDto,
  ) {
    return this.bookings.update(principal, id, parseVersion(ifMatch), body);
  }

  @Get(':id/reservations/:reservationId/calendar')
  reservationCalendar(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
  ) {
    return this.bookings.getReservationCalendar(principal, id, reservationId);
  }

  @Patch(':id/reservations/:reservationId/reschedule')
  rescheduleReservation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RescheduleReservationDto,
  ) {
    return this.bookings.rescheduleReservation(
      principal,
      id,
      reservationId,
      parseVersion(ifMatch),
      body,
    );
  }

  @Post(':id/reservations/:reservationId/cancel')
  cancelReservation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.bookings.cancelReservation(
      principal,
      id,
      reservationId,
      parseVersion(ifMatch),
    );
  }

  @Get(':id/reservations')
  reservations(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.bookings.listReservations(principal, id);
  }
}
