import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsController, TranscriptsController } from './artifacts.controller';
import { EmbeddingProviderService } from './embedding-provider.service';
import { MemoryEmbeddingWorker } from './memory-embedding.worker';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [MemoryController, RecordingsController, TranscriptsController],
  providers: [MemoryService, EmbeddingProviderService, MemoryEmbeddingWorker],
  exports: [MemoryService],
})
export class MemoryModule {}
