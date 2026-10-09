import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingReconciliationWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingReconciliationWorker.name);
  private running = false;

  constructor(private readonly billing: BillingService) {}

  onApplicationBootstrap(): void {
    void this.runCycle();
  }

  @Interval(5 * 60 * 1000)
  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.billing.reconcileAllWorkspaces();
    } catch (error: unknown) {
      this.logger.error(
        'Billing reconciliation cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
