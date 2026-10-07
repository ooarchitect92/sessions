import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AgendasService } from './agendas.service';
import { CreateAgendaTemplateDto } from './dto/create-agenda-template.dto';
import { UpdateAgendaTemplateDto } from './dto/update-agenda-template.dto';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('agenda-templates')
@ApiBearerAuth()
@Controller('agenda-templates')
export class AgendaTemplatesController {
  constructor(private readonly agendas: AgendasService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.agendas.listTemplates(principal);
  }

  @Get(':templateId')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
  ) {
    return this.agendas.getTemplate(principal, templateId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateAgendaTemplateDto,
  ) {
    return this.agendas.createTemplate(principal, body);
  }

  @Patch(':templateId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAgendaTemplateDto,
  ) {
    return this.agendas.updateTemplate(
      principal,
      templateId,
      parseVersion(ifMatch),
      body,
    );
  }

  @Delete(':templateId')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
  ) {
    return this.agendas.deleteTemplate(principal, templateId);
  }
}
