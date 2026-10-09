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
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { UpdateWebhookSubscriptionDto } from './dto/update-webhook-subscription.dto';
import { IntegrationsService } from './integrations.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) throw new BadRequestException('If-Match must contain a positive integer version');
  return parsed;
}

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('api-keys')
  listApiKeys(@CurrentPrincipal() principal: Principal) { return this.integrations.listApiKeys(principal); }

  @Post('api-keys')
  createApiKey(@CurrentPrincipal() principal: Principal, @Body() body: CreateApiKeyDto) { return this.integrations.createApiKey(principal, body); }

  @Post('api-keys/:id/revoke')
  revokeApiKey(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.integrations.revokeApiKey(principal, id); }

  @Get('webhooks')
  listWebhooks(@CurrentPrincipal() principal: Principal) { return this.integrations.listWebhooks(principal); }

  @Post('webhooks')
  createWebhook(@CurrentPrincipal() principal: Principal, @Body() body: CreateWebhookSubscriptionDto) { return this.integrations.createWebhook(principal, body); }

  @Patch('webhooks/:id')
  updateWebhook(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Headers('if-match') ifMatch: string | undefined, @Body() body: UpdateWebhookSubscriptionDto) {
    return this.integrations.updateWebhook(principal, id, parseVersion(ifMatch), body);
  }

  @Delete('webhooks/:id')
  deleteWebhook(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Headers('if-match') ifMatch: string | undefined) {
    return this.integrations.deleteWebhook(principal, id, parseVersion(ifMatch));
  }

  @Get('webhooks/:id/deliveries')
  listWebhookDeliveries(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.integrations.listWebhookDeliveries(principal, id);
  }

  @Post('webhooks/deliveries/:deliveryId/replay')
  replayWebhookDelivery(@CurrentPrincipal() principal: Principal, @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string) {
    return this.integrations.replayWebhookDelivery(principal, deliveryId);
  }
}
