import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { UpdateRecordingRetentionDto } from './dto/update-retention.dto';
import { RecordingsService } from './recordings.service';

@ApiTags('recordings')
@ApiBearerAuth()
@Controller('recordings')
export class RecordingControlsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Get(':sessionId/playback')
  playback(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Query('disposition') disposition?: string,
  ) {
    return this.recordings.createPlaybackGrant(
      principal,
      sessionId,
      disposition === 'attachment' ? 'attachment' : 'inline',
    );
  }

  @Patch(':sessionId/retention')
  updateRetention(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() input: UpdateRecordingRetentionDto,
  ) {
    return this.recordings.updateRetention(principal, sessionId, input);
  }

  @Delete(':sessionId')
  @HttpCode(202)
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.recordings.requestDeletion(principal, sessionId);
  }
}
