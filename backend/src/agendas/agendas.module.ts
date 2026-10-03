import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AgendaContentPolicyService } from './agenda-content-policy.service';
import { AgendaTemplatesController } from './agenda-templates.controller';
import { AgendaTemplatesService } from './agenda-templates.service';
import { AgendasController } from './agendas.controller';
import { AgendasService } from './agendas.service';

@Module({
  imports: [AiModule, AuditModule, OutboxModule],
  controllers: [AgendasController, AgendaTemplatesController],
  providers: [AgendasService, AgendaContentPolicyService, AgendaTemplatesService],
  exports: [AgendasService, AgendaTemplatesService],
})
export class AgendasModule {}
