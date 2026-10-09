import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateMediaTokenDto } from './dto/create-media-token.dto';
import { MediaRoomQueryDto } from './dto/media-room-query.dto';
import { MuteMediaTrackDto } from './dto/mute-media-track.dto';
import { UpdateHandRaiseDto } from './dto/update-hand-raise.dto';
import { UpdateMediaPublishingDto } from './dto/update-media-publishing.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('sessions')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id/media-participants')
  listParticipants(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Query() query: MediaRoomQueryDto,
  ) {
    return this.media.listParticipants(principal, sessionId, query.breakoutRoomId);
  }

  @Patch(':id/media-participants/:participantIdentity/tracks/:trackSid')
  setTrackMuted(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantIdentity', new ParseUUIDPipe({ version: '4' }))
    participantIdentity: string,
    @Param('trackSid') trackSid: string,
    @Query() query: MediaRoomQueryDto,
    @Body() body: MuteMediaTrackDto,
  ) {
    return this.media.setTrackMuted(
      principal,
      sessionId,
      participantIdentity,
      trackSid,
      body.muted,
      query.breakoutRoomId,
    );
  }

  @Patch(':id/media-participants/:participantIdentity/media-permissions')
  setParticipantPublishing(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantIdentity', new ParseUUIDPipe({ version: '4' }))
    participantIdentity: string,
    @Query() query: MediaRoomQueryDto,
    @Body() body: UpdateMediaPublishingDto,
  ) {
    return this.media.setParticipantPublishing(
      principal,
      sessionId,
      participantIdentity,
      body.canPublish,
      query.breakoutRoomId,
    );
  }

  @Delete(':id/media-participants/:participantIdentity')
  removeParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantIdentity', new ParseUUIDPipe({ version: '4' }))
    participantIdentity: string,
    @Query() query: MediaRoomQueryDto,
  ) {
    return this.media.removeParticipant(
      principal,
      sessionId,
      participantIdentity,
      query.breakoutRoomId,
    );
  }

  @Post(':id/media-token')
  createJoinToken(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateMediaTokenDto,
  ) {
    return this.media.createJoinToken(principal, sessionId, body.breakoutRoomId);
  }
}
