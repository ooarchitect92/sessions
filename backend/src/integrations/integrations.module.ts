import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';

@Module({
  imports: [AuditModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhookDeliveryWorker],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
