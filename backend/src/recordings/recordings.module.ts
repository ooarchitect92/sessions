import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingConsentController } from './recording-consent.controller';
import { RecordingEgressWorker } from './recording-egress.worker';
import { RecordingControlsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';
import { S3ObjectStoreService } from './s3-object-store.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [RecordingConsentController, RecordingControlsController],
  providers: [RecordingsService, RecordingEgressWorker, S3ObjectStoreService],
  exports: [RecordingsService, S3ObjectStoreService],
})
export class RecordingsModule {}
