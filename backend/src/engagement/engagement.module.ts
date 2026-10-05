import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';

@Module({
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
