import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { CreateMarketingLeadDto } from './dto/create-marketing-lead.dto';
import { MarketingService } from './marketing.service';

@ApiTags('public-marketing')
@Public()
@Controller('public/marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Post('leads')
  createLead(@Body() body: CreateMarketingLeadDto) {
    return this.marketing.createLead(body);
  }
}
