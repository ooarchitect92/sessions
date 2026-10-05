import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { OutboxModule } from '../outbox/outbox.module';
import { EmailWorker } from './email.worker';
import { HttpEmailProvider } from './http-email.provider';

@Module({
  imports: [InfrastructureModule, OutboxModule],
  providers: [HttpEmailProvider, EmailWorker],
  exports: [HttpEmailProvider],
})
export class NotificationsModule {}
