import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { ListMemoryQuery } from './dto/list-memory.query';
import { UpdateMemorySummaryDto } from './dto/update-memory-summary.dto';
import { MemoryService } from './memory.service';

@ApiTags('memory')
@ApiBearerAuth()
@Controller('memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query() query: ListMemoryQuery) {
    return this.memory.list(principal, query);
  }

  @Get(':sessionId')
  getBySession(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.getBySession(principal, sessionId);
  }

  @Get(':sessionId/summary/revisions')
  summaryRevisions(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.listMemorySummaryRevisions(principal, sessionId);
  }

  @Patch(':sessionId/summary')
  updateSummary(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: UpdateMemorySummaryDto,
  ) {
    return this.memory.updateMemorySummary(principal, sessionId, body);
  }

  @Post(':sessionId/retry')
  retryFailed(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.retryFailed(principal, sessionId);
  }
}
