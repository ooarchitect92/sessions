import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AgendasService } from './agendas.service';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto';
import { ControlAgendaTimerDto } from './dto/control-agenda-timer.dto';
import { GenerateAgendaDto } from './dto/generate-agenda.dto';
import { ReorderAgendaDto } from './dto/reorder-agenda.dto';

@ApiTags('agendas')
@ApiBearerAuth()
@Controller('sessions/:sessionId/agenda-items')
export class AgendasController {
  constructor(private readonly agendas: AgendasService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.agendas.list(principal, sessionId);
  }

  @Get('timer')
  getTimer(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.agendas.getTimer(principal, sessionId);
  }

  @Post('timer')
  controlTimer(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: ControlAgendaTimerDto,
  ) {
    return this.agendas.controlTimer(principal, sessionId, body.action);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateAgendaItemDto,
  ) {
    return this.agendas.create(principal, sessionId, body);
  }

  @Post('generate')
  generate(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: GenerateAgendaDto,
  ) {
    return this.agendas.generate(principal, sessionId, body);
  }

  @Put('order')
  reorder(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: ReorderAgendaDto,
  ) {
    return this.agendas.reorder(principal, sessionId, body);
  }

  @Post(':agendaItemId/activate')
  activate(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('agendaItemId', new ParseUUIDPipe({ version: '4' })) agendaItemId: string,
  ) {
    return this.agendas.activate(principal, sessionId, agendaItemId);
  }
}
