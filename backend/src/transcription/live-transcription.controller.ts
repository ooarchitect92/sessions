import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { SubmitLiveTranscriptionChunkDto } from './dto/submit-live-transcription-chunk.dto';
import { LiveTranscriptionService } from './live-transcription.service';

@ApiTags('transcription')
@ApiBearerAuth()
@Controller('sessions/:sessionId/transcription')
export class LiveTranscriptionController {
  constructor(private readonly liveTranscription: LiveTranscriptionService) {}

  @Post('chunks')
  submitChunk(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: SubmitLiveTranscriptionChunkDto,
  ) {
    return this.liveTranscription.submitChunk(principal, sessionId, body);
  }
}
