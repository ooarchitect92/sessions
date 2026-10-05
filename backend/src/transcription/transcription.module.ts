import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { HttpTranscriptionProvider } from './http-transcription.provider';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [OutboxModule, RecordingsModule],
  providers: [HttpTranscriptionProvider, TranscriptionWorker],
})
export class TranscriptionModule {}
