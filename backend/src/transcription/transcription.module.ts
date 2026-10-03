import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { OpenAiCompatibleTranscriptionProvider } from './openai-compatible-transcription.provider';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [OutboxModule, RecordingsModule],
  providers: [OpenAiCompatibleTranscriptionProvider, TranscriptionWorker],
})
export class TranscriptionModule {}
