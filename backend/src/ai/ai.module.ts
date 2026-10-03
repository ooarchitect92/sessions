import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { AiMemoryWorker } from './ai-memory.worker';
import { OpenAiCompatibleAgendaProvider } from './openai-compatible-agenda.provider';
import { OpenAiCompatibleMemoryProvider } from './openai-compatible-memory.provider';

@Module({
  imports: [OutboxModule],
  providers: [OpenAiCompatibleAgendaProvider, OpenAiCompatibleMemoryProvider, AiMemoryWorker],
  exports: [OpenAiCompatibleAgendaProvider],
})
export class AiModule {}
