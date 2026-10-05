import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { BreakoutsService } from './breakouts.service';
import { AssignBreakoutRoomDto } from './dto/assign-breakout-room.dto';
import { BroadcastBreakoutDto } from './dto/broadcast-breakout.dto';
import { CreateBreakoutRoomDto } from './dto/create-breakout-room.dto';
import { RandomizeBreakoutsDto } from './dto/randomize-breakouts.dto';

@ApiTags('breakouts')
@ApiBearerAuth()
@Controller('sessions/:sessionId/breakouts')
export class BreakoutsController {
  constructor(private readonly breakouts: BreakoutsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.breakouts.list(principal, sessionId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateBreakoutRoomDto,
  ) {
    return this.breakouts.create(principal, sessionId, body);
  }

  @Put(':breakoutRoomId/assignments')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('breakoutRoomId', new ParseUUIDPipe({ version: '4' }))
    breakoutRoomId: string,
    @Body() body: AssignBreakoutRoomDto,
  ) {
    return this.breakouts.assign(principal, sessionId, breakoutRoomId, body);
  }

  @Post('randomize')
  randomize(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: RandomizeBreakoutsDto,
  ) {
    return this.breakouts.randomize(principal, sessionId, body);
  }

  @Post('start')
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.breakouts.start(principal, sessionId);
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
