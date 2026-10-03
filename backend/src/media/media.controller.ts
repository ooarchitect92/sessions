import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { MuteParticipantTrackDto } from './dto/mute-participant-track.dto';
import { UpdateParticipantPermissionsDto } from './dto/update-participant-permissions.dto';
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

  @Get(':id/media/participants')
  listParticipants(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.media.listParticipants(principal, sessionId);
  }

  @Post(':id/media/participants/:participantId/tracks/:trackSid/mute')
  mutePublishedTrack(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
    @Param('trackSid') trackSid: string,
    @Body() body: MuteParticipantTrackDto,
  ) {
    return this.media.mutePublishedTrack(
      principal,
      sessionId,
      participantId,
      trackSid,
      body.muted,
    );
  }

  @Patch(':id/media/participants/:participantId/permissions')
  updateParticipantPermissions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
    @Body() body: UpdateParticipantPermissionsDto,
  ) {
    return this.media.setPublishPermission(
      principal,
      sessionId,
      participantId,
      body.canPublish,
    );
  }

  @Delete(':id/media/participants/:participantId')
  removeParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
  ) {
    return this.media.removeParticipant(principal, sessionId, participantId);
  }

  @Post(':id/media/participants/:participantId/allow-rejoin')
  allowRejoin(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
  ) {
    return this.media.allowRejoin(principal, sessionId, participantId);
  }
}
