import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WebhookCryptoService } from './webhook-crypto.service';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { WebhookEgressPolicyService } from './webhook-egress-policy.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuditModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookCryptoService,
    WebhookEgressPolicyService,
    WebhookDeliveryWorker,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
