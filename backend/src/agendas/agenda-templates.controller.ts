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
import { AgendaTemplatesService } from './agenda-templates.service';
import { SaveAgendaTemplateDto } from './dto/save-agenda-template.dto';
import { UpdateAgendaTemplateDto } from './dto/update-agenda-template.dto';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      'If-Match must contain a positive integer version',
    );
  }
  return parsed;
}

@ApiTags('agenda-templates')
@ApiBearerAuth()
@Controller()
export class AgendaTemplatesController {
  constructor(private readonly templates: AgendaTemplatesService) {}

  @Get('agenda-templates')
  list(@CurrentPrincipal() principal: Principal) {
    return this.templates.list(principal);
  }

  @Get('agenda-templates/:id')
  getById(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.templates.getById(principal, id);
  }

  @Post('sessions/:sessionId/agenda-templates')
  saveFromSession(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: SaveAgendaTemplateDto,
  ) {
    return this.templates.saveFromSession(principal, sessionId, body);
  }

  @Patch('agenda-templates/:id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAgendaTemplateDto,
  ) {
    return this.templates.update(principal, id, parseVersion(ifMatch), body);
  }

  @Delete('agenda-templates/:id')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.templates.remove(principal, id, parseVersion(ifMatch));
  }

  @Post('sessions/:sessionId/agenda-templates/:templateId/apply')
  applyToSession(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string,
  ) {
    return this.templates.applyToSession(principal, sessionId, templateId);
  }
}
