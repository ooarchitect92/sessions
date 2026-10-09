import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { DiarizationProviderService } from './diarization-provider.service';
import { MediaNormalizationService } from './media-normalization.service';
import { TranscriptionProviderService } from './transcription-provider.service';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [OutboxModule, RecordingsModule],
  providers: [
    TranscriptionProviderService,
    MediaNormalizationService,
    DiarizationProviderService,
    TranscriptionWorker,
  ],
  exports: [
    TranscriptionProviderService,
    MediaNormalizationService,
    DiarizationProviderService,
  ],
})
export class TranscriptionModule {}
