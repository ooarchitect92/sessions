import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.webhooks.list(principal);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateWebhookDto,
  ) {
    return this.webhooks.create(principal, body);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateWebhookDto,
  ) {
    return this.webhooks.update(principal, id, parseVersion(ifMatch), body);
  }

  @Delete(':id')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.webhooks.remove(principal, id);
  }

  @Post(':id/rotate-secret')
  rotateSecret(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.webhooks.rotateSecret(principal, id);
  }

  @Get(':id/deliveries')
  deliveries(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.webhooks.listDeliveries(principal, id);
  }

  @Post('deliveries/:deliveryId/replay')
  replay(
    @CurrentPrincipal() principal: Principal,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' }))
    deliveryId: string,
  ) {
    return this.webhooks.replay(principal, deliveryId);
  }
}
