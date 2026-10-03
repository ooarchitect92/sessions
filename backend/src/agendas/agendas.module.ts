import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AgendaContentPolicyService } from './agenda-content-policy.service';
import { AgendasController } from './agendas.controller';
import { AgendasService } from './agendas.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [AgendasController],
  providers: [AgendasService, AgendaContentPolicyService],
  exports: [AgendasService],
})
export class AgendasModule {}
