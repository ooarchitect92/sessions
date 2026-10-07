import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { EventReminderKind } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { UpdateEventNotificationTemplateDto } from './dto/update-event-notification-template.dto';
import { NotificationsService } from './notifications.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      'If-Match must contain a positive integer version',
    );
  }
  return parsed;
}

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

  @Get('events/:eventId/templates')
  listEventTemplates(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.notifications.listEventTemplates(principal, eventId);
  }

  @Patch('events/:eventId/templates/:kind')
  updateEventTemplate(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('kind', new ParseEnumPipe(EventReminderKind))
    kind: EventReminderKind,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateEventNotificationTemplateDto,
  ) {
    return this.notifications.updateEventTemplate(
      principal,
      eventId,
      kind,
      parseVersion(ifMatch),
      body,
    );
  }

  @Get('events/:eventId/deliveries')
  listEventDeliveries(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.notifications.listEventDeliveries(principal, eventId);
  }

  @Post('events/deliveries/:deliveryId/retry')
  retryEventDelivery(
    @CurrentPrincipal() principal: Principal,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' }))
    deliveryId: string,
  ) {
    return this.notifications.retryEventDelivery(principal, deliveryId);
  }

  @Post(':deliveryId/retry')
  retry(
    @CurrentPrincipal() principal: Principal,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
  ) {
    return this.notifications.retry(principal, deliveryId);
  }
}
