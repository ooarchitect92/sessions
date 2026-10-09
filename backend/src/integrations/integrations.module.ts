import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IntegrationsController } from './integrations.controller';
import { ProviderConnectionsController } from './provider-connections.controller';
import { ProviderConnectionsService } from './provider-connections.service';
import { ApiKeyAuthService } from './api-key-auth.service';
import { IntegrationsService } from './integrations.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { WebhookHttpClient } from './webhook-http.client';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [IntegrationsController, ProviderConnectionsController],
  providers: [
    IntegrationsService,
    ApiKeyAuthService,
    ProviderConnectionsService,
    WebhookHttpClient,
    WebhookDeliveryWorker,
  ],
  exports: [
    IntegrationsService,
    ApiKeyAuthService,
    ProviderConnectionsService,
    WebhookHttpClient,
  ],
})
export class IntegrationsModule {}
