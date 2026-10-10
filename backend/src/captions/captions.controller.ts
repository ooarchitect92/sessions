import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CaptionsService } from './captions.service';
import { PublishCaptionDto } from './dto/publish-caption.dto';

@Controller('sessions/:sessionId/captions')
export class CaptionsController {
  constructor(private readonly captions: CaptionsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.captions.list(principal, sessionId);
  }

  @Post()
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: PublishCaptionDto,
  ) {
    return this.captions.publish(principal, sessionId, body);
  }
}
