import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateMediaTokenDto } from './dto/create-media-token.dto';
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
    @Body() body: CreateMediaTokenDto,
  ) {
    return this.media.createJoinToken(principal, sessionId, body.breakoutRoomId);
  }
}
