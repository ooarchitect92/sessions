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
import { CreateCrmNoteDto } from './dto/create-crm-note.dto';
import { CreateFollowUpEmailDto } from './dto/create-follow-up-email.dto';
import { ListMemoryQuery } from './dto/list-memory.query';
import { UpdateAiExternalActionDto } from './dto/update-ai-external-action.dto';
import { UpdateMemorySummaryDto } from './dto/update-memory-summary.dto';
import { UpdateTranscriptDto } from './dto/update-transcript.dto';
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


  @Get(':sessionId/follow-ups')
  listExternalActions(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.listExternalActions(principal, sessionId);
  }

  @Post(':sessionId/follow-ups/email/draft')
  createFollowUpEmailDraft(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateFollowUpEmailDto,
  ) {
    return this.memory.createFollowUpEmailDraft(principal, sessionId, body);
  }

  @Post(':sessionId/follow-ups/crm-note/draft')
  createCrmNoteDraft(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateCrmNoteDto,
  ) {
    return this.memory.createCrmNoteDraft(principal, sessionId, body);
  }

  @Patch(':sessionId/follow-ups/:actionId')
  updateExternalAction(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('actionId', new ParseUUIDPipe({ version: '4' })) actionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAiExternalActionDto,
  ) {
    return this.memory.updateExternalAction(
      principal,
      sessionId,
      actionId,
      parseVersion(ifMatch),
      body,
    );
  }

  @Post(':sessionId/follow-ups/:actionId/approve')
  approveExternalAction(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('actionId', new ParseUUIDPipe({ version: '4' })) actionId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.memory.approveExternalAction(
      principal,
      sessionId,
      actionId,
      parseVersion(ifMatch),
    );
  }

  @Post(':sessionId/follow-ups/:actionId/retry')
  retryExternalAction(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('actionId', new ParseUUIDPipe({ version: '4' })) actionId: string,
  ) {
    return this.memory.retryExternalAction(principal, sessionId, actionId);
  }

  @Post(':sessionId/follow-ups/:actionId/cancel')
  cancelExternalAction(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('actionId', new ParseUUIDPipe({ version: '4' })) actionId: string,
  ) {
    return this.memory.cancelExternalAction(principal, sessionId, actionId);
  }

  @Get(':sessionId/transcript/revisions')
  listTranscriptRevisions(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.listTranscriptRevisions(principal, sessionId);
  }

  @Patch(':sessionId/transcript')
  updateTranscript(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTranscriptDto,
  ) {
    return this.memory.updateTranscript(
      principal,
      sessionId,
      parseVersion(ifMatch),
      body,
    );
  }

  @Post(':sessionId/transcript/revisions/:revisionId/restore')
  restoreTranscriptRevision(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('revisionId', new ParseUUIDPipe({ version: '4' })) revisionId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.memory.restoreTranscriptRevision(
      principal,
      sessionId,
      revisionId,
      parseVersion(ifMatch),
    );
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

  @Post(':sessionId/semantic-index/retry')
  retrySemanticIndex(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.retrySemanticIndex(principal, sessionId);
  }

  @Post(':sessionId/retry')
  retryFailed(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.retryFailed(principal, sessionId);
  }
}
