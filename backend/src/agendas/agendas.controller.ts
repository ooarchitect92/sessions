import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AgendasService } from './agendas.service';
import { ApplyAgendaDraftDto } from './dto/apply-agenda-draft.dto';
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto';
import { GenerateAgendaDraftDto } from './dto/generate-agenda-draft.dto';
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

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateAgendaItemDto,
  ) {
    return this.agendas.create(principal, sessionId, body);
  }


  @Post('generate-draft')
  generateDraft(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: GenerateAgendaDraftDto,
  ) {
    return this.agendas.generateDraft(principal, sessionId, body);
  }

  @Post('apply-draft')
  applyDraft(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: ApplyAgendaDraftDto,
  ) {
    return this.agendas.applyDraft(principal, sessionId, body);
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
