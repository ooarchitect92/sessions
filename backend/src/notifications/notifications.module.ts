import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { OutboxModule } from '../outbox/outbox.module';
import { EmailWorker } from './email.worker';
import { HttpEmailProvider } from './http-email.provider';
import { NotificationSchedulerService } from './notification-scheduler.service';

@Module({
  imports: [InfrastructureModule, OutboxModule],
  providers: [HttpEmailProvider, EmailWorker, NotificationSchedulerService],
  exports: [HttpEmailProvider, NotificationSchedulerService],
})
export class NotificationsModule {}
