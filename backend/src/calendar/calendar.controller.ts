import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import { Public } from '../common/auth/public.decorator';
import type { Principal } from '../common/auth/principal';
import { CalendarService } from './calendar.service';
import { UpdateCalendarConnectionDto } from './dto/update-calendar-connection.dto';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @ApiBearerAuth()
  @Get('connections')
  list(@CurrentPrincipal() principal: Principal) {
    return this.calendar.list(principal);
  }

  @ApiBearerAuth()
  @Post('oauth/:provider/start')
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('provider') providerValue: string,
  ) {
    return this.calendar.startOAuth(
      principal,
      this.calendar.parseProvider(providerValue),
    );
  }

  @Public()
  @Get('oauth/:provider/callback')
  async callback(
    @Param('provider') providerValue: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const provider = this.calendar.parseProvider(providerValue);
    if (providerError || !code || !state) {
      return reply.redirect(
        this.calendar.failureRedirect(
          provider,
          providerError || 'missing_oauth_response',
        ),
      );
    }

    try {
      await this.calendar.completeOAuth(provider, code, state);
      return reply.redirect(this.calendar.successRedirect(provider));
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message.slice(0, 120) : 'oauth_failed';
      return reply.redirect(this.calendar.failureRedirect(provider, reason));
    }
  }

  @ApiBearerAuth()
  @Patch('connections/:id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateCalendarConnectionDto,
  ) {
    return this.calendar.update(principal, id, body);
  }

  @ApiBearerAuth()
  @Post('connections/:id/disconnect')
  disconnect(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.calendar.disconnect(principal, id);
  }
}
