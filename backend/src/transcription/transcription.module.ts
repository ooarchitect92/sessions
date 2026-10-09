import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { MediaNormalizerService } from './media-normalizer.service';
import { TranscriptionProviderService } from './transcription-provider.service';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [OutboxModule, RecordingsModule],
  providers: [
    MediaNormalizerService,
    TranscriptionProviderService,
    TranscriptionWorker,
  ],
  exports: [TranscriptionProviderService],
})
export class TranscriptionModule {}
