import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { TranscriptionProviderService } from './transcription-provider.service';
import { TranscriptionWorker } from './transcription.worker';

@Module({
  imports: [OutboxModule, RecordingsModule],
  providers: [TranscriptionProviderService, TranscriptionWorker],
  exports: [TranscriptionProviderService],
})
export class TranscriptionModule {}
