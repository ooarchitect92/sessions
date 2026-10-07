import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { MalwareScannerService } from './malware-scanner.service';
import { UploadScanWorker } from './upload-scan.worker';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [AuditModule, OutboxModule, RecordingsModule],
  controllers: [UploadsController],
  providers: [UploadsService, MalwareScannerService, UploadScanWorker],
  exports: [UploadsService],
})
export class UploadsModule {}
