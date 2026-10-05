import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { HttpAiProvider } from './http-ai.provider';
import { SummaryWorker } from './summary.worker';

@Module({
  imports: [OutboxModule],
  providers: [HttpAiProvider, SummaryWorker],
})
export class AiModule {}
