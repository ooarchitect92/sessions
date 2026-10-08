import { Module } from '@nestjs/common';
import { MarketingLeadOutboxService } from './marketing-lead-outbox.service';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  controllers: [MarketingController],
  providers: [MarketingService, MarketingLeadOutboxService],
})
export class MarketingModule {}
