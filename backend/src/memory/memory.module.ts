import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsController, TranscriptsController } from './artifacts.controller';
import { CrmWriteProvider } from './crm-write.provider';
import { EmbeddingProviderService } from './embedding-provider.service';
import { AiExternalActionWorker } from './ai-external-action.worker';
import { MemoryEmbeddingWorker } from './memory-embedding.worker';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

@Module({
  imports: [
    AiModule,
    AuditModule,
    IntegrationsModule,
    NotificationsModule,
    OutboxModule,
  ],
  controllers: [MemoryController, RecordingsController, TranscriptsController],
  providers: [
    MemoryService,
    EmbeddingProviderService,
    MemoryEmbeddingWorker,
    CrmWriteProvider,
    AiExternalActionWorker,
  ],
  exports: [MemoryService],
})
export class MemoryModule {}
