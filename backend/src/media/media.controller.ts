import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('sessions')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post(':id/media-token')
  createJoinToken(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.media.createJoinToken(principal, sessionId);
  }

  @Post(':id/breakouts/:breakoutRoomId/media-token')
  createBreakoutJoinToken(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('breakoutRoomId', new ParseUUIDPipe({ version: '4' }))
    breakoutRoomId: string,
  ) {
    return this.media.createBreakoutJoinToken(
      principal,
      sessionId,
      breakoutRoomId,
    );
  }
}
