import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { WebhookHttpClient } from './webhook-http.client';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhookHttpClient, WebhookDeliveryWorker],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
