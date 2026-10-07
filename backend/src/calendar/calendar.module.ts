import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CalendarController } from './calendar.controller';
import { CalendarProviderClientService } from './calendar-provider-client.service';
import { CalendarService } from './calendar.service';
import { CalendarTokenVaultService } from './calendar-token-vault.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    CalendarProviderClientService,
    CalendarTokenVaultService,
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
