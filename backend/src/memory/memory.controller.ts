import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { ListMemoryQuery } from './dto/list-memory.query';
import { UpdateMemorySummaryDto } from './dto/update-memory-summary.dto';
import { MemoryService } from './memory.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

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


  @Patch(':sessionId/summary')
  updateSummary(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateMemorySummaryDto,
  ) {
    return this.memory.updateSummary(
      principal,
      sessionId,
      parseVersion(ifMatch),
      body,
    );
  }

  @Post(':sessionId/retry')
  retryFailed(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.retryFailed(principal, sessionId);
  }
}
