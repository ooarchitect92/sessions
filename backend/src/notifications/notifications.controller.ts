import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationKind } from '@prisma/client';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { UpsertNotificationTemplateDto } from './dto/upsert-notification-template.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('templates')
  templates(@CurrentPrincipal() principal: Principal) {
    return this.notifications.listTemplates(principal);
  }

  @Patch('templates')
  upsertTemplate(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpsertNotificationTemplateDto,
  ) {
    return this.notifications.upsertTemplate(principal, body);
  }

  @Delete('templates/:kind')
  resetTemplate(
    @CurrentPrincipal() principal: Principal,
    @Param('kind', new ParseEnumPipe(NotificationKind)) kind: NotificationKind,
  ) {
    return this.notifications.resetTemplate(principal, kind);
  }

  @Get('deliveries')
  deliveries(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : 100;
    return this.notifications.listDeliveries(
      principal,
      Number.isInteger(parsed) ? parsed : 100,
    );
  }

  @Patch('deliveries/:id/retry')
  retryDelivery(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notifications.retryDelivery(principal, id);
  }
}
