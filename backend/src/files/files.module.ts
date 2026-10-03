import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { ClamAvScannerService } from './clamav-scanner.service';
import { FileScanWorker } from './file-scan.worker';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuditModule, OutboxModule, RecordingsModule],
  controllers: [FilesController],
  providers: [FilesService, ClamAvScannerService, FileScanWorker],
  exports: [FilesService],
})
export class FilesModule {}
