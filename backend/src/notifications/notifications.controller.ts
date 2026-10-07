import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('bookings/:reservationId')
  listBookingDeliveries(
    @CurrentPrincipal() principal: Principal,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
  ) {
    return this.notifications.listBookingDeliveries(principal, reservationId);
  }

  @Post(':deliveryId/retry')
  retry(
    @CurrentPrincipal() principal: Principal,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
  ) {
    return this.notifications.retry(principal, deliveryId);
  }
}
