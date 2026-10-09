import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { GovernanceLifecycleWorker } from './governance-lifecycle.worker';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, GovernanceLifecycleWorker],
  exports: [GovernanceService],
})
export class GovernanceModule {}