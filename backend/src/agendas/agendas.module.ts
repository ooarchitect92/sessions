import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { ContentModule } from '../content/content.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AgendaTemplatesController } from './agenda-templates.controller';
import { AgendaTemplatesService } from './agenda-templates.service';
import { AgendasController } from './agendas.controller';
import { AgendasService } from './agendas.service';

@Module({
  imports: [AiModule, AuditModule, ContentModule, OutboxModule],
  controllers: [AgendasController, AgendaTemplatesController],
  providers: [AgendasService, AgendaTemplatesService],
  exports: [AgendasService],
})
export class AgendasModule {}
