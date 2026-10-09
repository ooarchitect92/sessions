import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('api-keys')
  listApiKeys(@CurrentPrincipal() principal: Principal) {
    return this.integrations.listApiKeys(principal);
  }

  @Post('api-keys')
  createApiKey(@CurrentPrincipal() principal: Principal, @Body() input: CreateApiKeyDto) {
    return this.integrations.createApiKey(principal, input);
  }

  @Delete('api-keys/:apiKeyId')
  revokeApiKey(
    @CurrentPrincipal() principal: Principal,
    @Param('apiKeyId', new ParseUUIDPipe({ version: '4' })) apiKeyId: string,
  ) {
    return this.integrations.revokeApiKey(principal, apiKeyId);
  }

  @Get('webhooks')
  listWebhooks(@CurrentPrincipal() principal: Principal) {
    return this.integrations.listWebhookSubscriptions(principal);
  }

  @Post('webhooks')
  createWebhook(
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateWebhookSubscriptionDto,
  ) {
    return this.integrations.createWebhookSubscription(principal, input);
  }

  @Get('webhooks/:subscriptionId/deliveries')
  listWebhookDeliveries(
    @CurrentPrincipal() principal: Principal,
    @Param('subscriptionId', new ParseUUIDPipe({ version: '4' })) subscriptionId: string,
  ) {
    return this.integrations.listWebhookDeliveries(principal, subscriptionId);
  }

  @Post('webhooks/deliveries/:deliveryId/replay')
  replayWebhookDelivery(
    @CurrentPrincipal() principal: Principal,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
  ) {
    return this.integrations.replayWebhookDelivery(principal, deliveryId);
  }

  @Delete('webhooks/:subscriptionId')
  deleteWebhook(
    @CurrentPrincipal() principal: Principal,
    @Param('subscriptionId', new ParseUUIDPipe({ version: '4' })) subscriptionId: string,
  ) {
    return this.integrations.deleteWebhookSubscription(principal, subscriptionId);
  }
}
