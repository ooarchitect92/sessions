import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { RecordConsentDto } from './dto/record-consent.dto';
import { RecordingsService } from './recordings.service';

@ApiTags('recording-consent')
@ApiBearerAuth()
@Controller('sessions/:sessionId/recording-consent')
export class RecordingConsentController {
  constructor(private readonly recordings: RecordingsService) {}

  @Get()
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.recordings.getConsentStatus(principal, sessionId);
  }

  @Post()
  record(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() input: RecordConsentDto,
  ) {
    return this.recordings.recordConsent(principal, sessionId, input);
  }
}
