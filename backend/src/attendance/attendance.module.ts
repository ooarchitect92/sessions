import { Module } from '@nestjs/common';
import { EngagementModule } from '../engagement/engagement.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [EngagementModule, OutboxModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
