import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CalendarCryptoService } from './calendar-crypto.service';
import { CalendarIntegrationsController } from './calendar-integrations.controller';
import { CalendarIntegrationsService } from './calendar-integrations.service';
import { CalendarProviderService } from './calendar-provider.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [CalendarIntegrationsController],
  providers: [
    CalendarCryptoService,
    CalendarProviderService,
    CalendarIntegrationsService,
  ],
  exports: [CalendarIntegrationsService],
})
export class CalendarModule {}
