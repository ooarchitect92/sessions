import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { AiProviderService } from './ai-provider.service';
import { MemorySummaryWorker } from './memory-summary.worker';

@Module({
  imports: [OutboxModule],
  providers: [AiProviderService, MemorySummaryWorker],
  exports: [AiProviderService],
})
export class AiModule {}
