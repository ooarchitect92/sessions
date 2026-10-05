import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeQuery } from './dto/analytics-range.query';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('workspace')
  workspace(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AnalyticsRangeQuery,
  ) {
    return this.analytics.workspace(principal, query);
  }

  @Get('sessions/:id')
  session(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.analytics.session(principal, id);
  }
}
