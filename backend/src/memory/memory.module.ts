import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsController, TranscriptsController } from './artifacts.controller';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [MemoryController, RecordingsController, TranscriptsController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
