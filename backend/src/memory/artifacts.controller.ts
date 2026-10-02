import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { MemoryService } from './memory.service';

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
}
