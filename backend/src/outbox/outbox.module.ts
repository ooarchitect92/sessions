import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OutboxService } from './outbox.service';

@Module({
  imports: [WebhooksModule],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
