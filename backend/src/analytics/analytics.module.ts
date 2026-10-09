import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { WorkspaceAnalyticsRollupWorker } from './workspace-analytics-rollup.worker';

@Module({
  imports: [AuditModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, WorkspaceAnalyticsRollupWorker],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
