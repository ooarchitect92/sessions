import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { WebhookWorker } from './webhook.worker';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookWorker],
})
export class WebhooksModule {}
