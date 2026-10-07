import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AssignBreakoutDto } from './dto/assign-breakout.dto';
import { BroadcastBreakoutDto } from './dto/broadcast-breakout.dto';
import { CreateBreakoutRoomDto } from './dto/create-breakout-room.dto';
import { RandomizeBreakoutsDto } from './dto/randomize-breakouts.dto';
import { BreakoutsService } from './breakouts.service';

@ApiTags('breakouts')
@ApiBearerAuth()
@Controller('sessions/:sessionId/breakouts')
export class BreakoutsController {
  constructor(private readonly breakouts: BreakoutsService) {}

  @Get()
  getState(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.breakouts.getState(principal, sessionId);
  }

  @Post('rooms')
  createRoom(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateBreakoutRoomDto,
  ) {
    return this.breakouts.createRoom(principal, sessionId, body);
  }

  @Post('assign')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: AssignBreakoutDto,
  ) {
    return this.breakouts.assign(principal, sessionId, body);
  }

  @Post('randomize')
  randomize(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: RandomizeBreakoutsDto,
  ) {
    return this.breakouts.randomize(principal, sessionId, body);
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
    @Body() body: BroadcastBreakoutDto,
  ) {
    return this.breakouts.broadcast(principal, sessionId, body);
  }
}
