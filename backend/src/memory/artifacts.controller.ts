import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { UpdateTranscriptSegmentDto } from './dto/update-transcript-segment.dto';
import { MemoryService } from './memory.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('recordings')
@ApiBearerAuth()
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly memory: MemoryService) {}

  @Get(':sessionId')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.getRecording(principal, sessionId);
  }
}

@ApiTags('transcripts')
@ApiBearerAuth()
@Controller('transcripts')
export class TranscriptsController {
  constructor(private readonly memory: MemoryService) {}

  @Get(':sessionId')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.memory.getTranscript(principal, sessionId);
  }

  @Patch(':sessionId/segments/:segmentId')
  updateSegment(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('segmentId', new ParseUUIDPipe({ version: '4' })) segmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTranscriptSegmentDto,
  ) {
    return this.memory.updateTranscriptSegment(
      principal,
      sessionId,
      segmentId,
      parseVersion(ifMatch),
      body,
    );
  }
}
