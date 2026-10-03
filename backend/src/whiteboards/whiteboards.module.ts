import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { WhiteboardsController } from './whiteboards.controller';
import { WhiteboardsService } from './whiteboards.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [WhiteboardsController],
  providers: [WhiteboardsService],
  exports: [WhiteboardsService],
})
export class WhiteboardsModule {}
