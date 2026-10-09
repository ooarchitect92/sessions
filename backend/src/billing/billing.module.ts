import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingReconciliationWorker } from './billing-reconciliation.worker';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingReconciliationWorker],
  exports: [BillingService],
})
export class BillingModule {}
