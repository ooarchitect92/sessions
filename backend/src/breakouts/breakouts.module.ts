import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BreakoutsController } from './breakouts.controller';
import { BreakoutsService } from './breakouts.service';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [BreakoutsController],
  providers: [BreakoutsService],
  exports: [BreakoutsService],
})
export class BreakoutsModule {}
