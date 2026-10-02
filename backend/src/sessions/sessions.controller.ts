import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateSessionDto } from './dto/create-session.dto';
import { ListSessionsQuery } from './dto/list-sessions.query';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

function parseIfMatch(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const normalized = value.replace(/^W\//, '').replaceAll('"', '').trim();
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    return this.sessions.create(principal, body, idempotencyKey);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListSessionsQuery,
  ) {
    return this.sessions.list(principal, query);
  }

  @Get(':id')
  getById(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.sessions.getById(principal, id);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSessionDto,
  ) {
    return this.sessions.update(principal, id, parseIfMatch(ifMatch), body);
  }

  @Post(':id/publish')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.sessions.publish(principal, id, parseIfMatch(ifMatch));
  }

  @Post(':id/start')
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.sessions.start(principal, id, parseIfMatch(ifMatch));
  }

  @Post(':id/end')
  end(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.sessions.end(principal, id, parseIfMatch(ifMatch));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.sessions.cancel(principal, id, parseIfMatch(ifMatch));
  }
}
