import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AssignBreakoutParticipantDto } from './dto/assign-breakout-participant.dto';
import { BroadcastBreakoutMessageDto } from './dto/broadcast-breakout-message.dto';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';
import { RandomizeBreakoutAssignmentsDto } from './dto/randomize-breakout-assignments.dto';
import { BreakoutsService } from './breakouts.service';

@ApiTags('breakouts')
@ApiBearerAuth()
@Controller('sessions/:sessionId/breakouts')
export class BreakoutsController {
  constructor(private readonly breakouts: BreakoutsService) {}

  @Get()
  state(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.breakouts.state(principal, sessionId);
  }

  @Post()
  createRooms(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateBreakoutRoomsDto,
  ) {
    return this.breakouts.createRooms(principal, sessionId, body);
  }

  @Post('assignments/randomize')
  randomize(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: RandomizeBreakoutAssignmentsDto,
  ) {
    return this.breakouts.randomize(principal, sessionId, body);
  }

  @Patch('assignments')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: AssignBreakoutParticipantDto,
  ) {
    return this.breakouts.assign(principal, sessionId, body);
  }

  @Post('open')
  open(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.breakouts.open(principal, sessionId);
  }

  @Post('close')
  close(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.breakouts.close(principal, sessionId);
  }

  @Post('broadcast')
  broadcast(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: BroadcastBreakoutMessageDto,
  ) {
    return this.breakouts.broadcast(principal, sessionId, body);
  }
}
