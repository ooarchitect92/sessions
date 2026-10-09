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
import { AgendaTemplatesService } from './agenda-templates.service';
import { ApplyAgendaTemplateDto } from './dto/apply-agenda-template.dto';
import { CreateAgendaTemplateFromSessionDto } from './dto/create-agenda-template-from-session.dto';
import { CreateAgendaTemplateDto } from './dto/create-agenda-template.dto';
import { UpdateAgendaTemplateDto } from './dto/update-agenda-template.dto';

@ApiTags('agenda-templates')
@ApiBearerAuth()
@Controller('agenda-templates')
export class AgendaTemplatesController {
  constructor(private readonly templates: AgendaTemplatesService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.templates.list(principal);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateAgendaTemplateDto,
  ) {
    return this.templates.create(principal, body);
  }

  @Post('from-session/:sessionId')
  createFromSession(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateAgendaTemplateFromSessionDto,
  ) {
    return this.templates.createFromSession(principal, sessionId, body);
  }

  @Patch(':templateId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
    @Body() body: UpdateAgendaTemplateDto,
  ) {
    return this.templates.update(principal, templateId, body);
  }

  @Delete(':templateId')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
  ) {
    return this.templates.remove(principal, templateId);
  }

  @Post(':templateId/apply/:sessionId')
  apply(
    @CurrentPrincipal() principal: Principal,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: ApplyAgendaTemplateDto,
  ) {
    return this.templates.apply(principal, templateId, sessionId, body);
  }
}
