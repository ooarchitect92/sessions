import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { EmailProviderService } from './email-provider.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [NotificationsController],
  providers: [EmailProviderService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
