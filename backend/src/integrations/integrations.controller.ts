import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateApiKeyDto, CreateWebhookSubscriptionDto } from './integrations.dto';
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
  createApiKey(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateApiKeyDto,
  ) {
    return this.integrations.createApiKey(principal, body);
  }

  @Delete('api-keys/:id')
  revokeApiKey(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.integrations.revokeApiKey(principal, id);
  }

  @Get('webhooks')
  listWebhooks(@CurrentPrincipal() principal: Principal) {
    return this.integrations.listWebhooks(principal);
  }

  @Post('webhooks')
  createWebhook(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateWebhookSubscriptionDto,
  ) {
    return this.integrations.createWebhook(principal, body);
  }

  @Delete('webhooks/:id')
  deleteWebhook(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.integrations.deleteWebhook(principal, id);
  }

  @Get('webhooks/:id/deliveries')
  listDeliveries(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.integrations.listDeliveries(principal, id);
  }

  @Post('webhook-deliveries/:id/retry')
  retryDelivery(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.integrations.retryDelivery(principal, id);
  }
}