import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { AiMemoryWorker } from './ai-memory.worker';
import { OpenAiCompatibleMemoryProvider } from './openai-compatible-memory.provider';

@Module({
  imports: [OutboxModule],
  providers: [OpenAiCompatibleMemoryProvider, AiMemoryWorker],
})
export class AiModule {}
