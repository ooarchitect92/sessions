import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('sessions/:sessionId')
  sessionAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.analytics.sessionAnalytics(principal, sessionId);
  }

  @Get('events/:eventId')
  eventAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.analytics.eventAnalytics(principal, eventId);
  }
}
