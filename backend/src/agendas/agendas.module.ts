import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { ContentModule } from '../content/content.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AgendasController } from './agendas.controller';
import { AgendasService } from './agendas.service';

@Module({
  imports: [AiModule, AuditModule, ContentModule, OutboxModule],
  controllers: [AgendasController],
  providers: [AgendasService],
  exports: [AgendasService],
})
export class AgendasModule {}
