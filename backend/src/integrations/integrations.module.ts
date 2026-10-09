import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IntegrationsController } from './integrations.controller';
import { ApiKeyAuthService } from './api-key-auth.service';
import { IntegrationsService } from './integrations.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { WebhookHttpClient } from './webhook-http.client';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    ApiKeyAuthService,
    WebhookHttpClient,
    WebhookDeliveryWorker,
  ],
  exports: [IntegrationsService, ApiKeyAuthService],
})
export class IntegrationsModule {}
