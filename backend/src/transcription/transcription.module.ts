import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { HttpTranscriptionProvider } from './http-transcription.provider';
import { LiveTranscriptionController } from './live-transcription.controller';
import { LiveTranscriptionService } from './live-transcription.service';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [OutboxModule, RecordingsModule],
  controllers: [LiveTranscriptionController],
  providers: [
    HttpTranscriptionProvider,
    LiveTranscriptionService,
    TranscriptionWorker,
  ],
})
export class TranscriptionModule {}
