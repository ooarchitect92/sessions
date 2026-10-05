import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CalendarIntegrationsController } from './calendar-integrations.controller';
import { CalendarIntegrationsService } from './calendar-integrations.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [CalendarIntegrationsController],
  providers: [CalendarIntegrationsService],
  exports: [CalendarIntegrationsService],
})
export class IntegrationsModule {}
