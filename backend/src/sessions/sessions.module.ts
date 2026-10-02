import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MemoryModule } from '../memory/memory.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AuditModule, OutboxModule, MemoryModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
