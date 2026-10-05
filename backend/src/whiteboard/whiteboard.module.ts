import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardService } from './whiteboard.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService],
  exports: [WhiteboardService],
})
export class WhiteboardModule {}
