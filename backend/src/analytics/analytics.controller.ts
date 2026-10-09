import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { ApiKeyScopes } from '../integrations/api-key-scopes';
import { AnalyticsService } from './analytics.service';
import { WorkspaceAnalyticsRangeDto } from './dto/workspace-analytics-range.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('workspace')
  @ApiKeyScopes('analytics:read')
  workspaceAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query() query: WorkspaceAnalyticsRangeDto,
  ) {
    return this.analytics.workspaceAnalytics(principal, query);
  }

  @Get('workspace/export')
  @ApiKeyScopes('analytics:export')
  exportWorkspaceAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query() query: WorkspaceAnalyticsRangeDto,
  ) {
    return this.analytics.exportWorkspaceAnalytics(principal, query);
  }

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
