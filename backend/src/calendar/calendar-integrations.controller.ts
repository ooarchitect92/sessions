import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CalendarProvider } from '@prisma/client';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { Public } from '../common/auth/public.decorator';
import { CalendarIntegrationsService } from './calendar-integrations.service';

function parseProvider(value: string): CalendarProvider {
  if (value.toLowerCase() === 'google') return CalendarProvider.GOOGLE;
  if (value.toLowerCase() === 'microsoft') return CalendarProvider.MICROSOFT;
  throw new Error('Unsupported calendar provider');
}

@ApiTags('calendar-integrations')
@Controller('integrations/calendars')
export class CalendarIntegrationsController {
  constructor(private readonly calendars: CalendarIntegrationsService) {}

  @Get()
  @ApiBearerAuth()
  list(@CurrentPrincipal() principal: Principal) {
    return this.calendars.list(principal);
  }

  @Post(':provider/oauth/start')
  @ApiBearerAuth()
  startOauth(
    @CurrentPrincipal() principal: Principal,
    @Param('provider') provider: string,
  ) {
    return this.calendars.startOauth(principal, parseProvider(provider));
  }

  @Public()
  @Get('oauth/callback/:provider')
  async callback(
    @Param('provider') providerValue: string,
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const provider = parseProvider(providerValue);
    const successUrl =
      process.env.CALENDAR_OAUTH_SUCCESS_URL ??
      'http://localhost:3000/settings?tab=integrations';

    if (providerError || !state || !code) {
      const target = new URL(successUrl);
      target.searchParams.set('calendar', 'error');
      target.searchParams.set(
        'reason',
        providerError ?? 'missing_oauth_parameters',
      );
      return reply.redirect(target.toString());
    }

    try {
      const result = await this.calendars.completeOauth(provider, state, code);
      const target = new URL(successUrl);
      target.searchParams.set('calendar', 'connected');
      target.searchParams.set('provider', result.provider.toLowerCase());
      target.searchParams.set('connectionId', result.connectionId);
      return reply.redirect(target.toString());
    } catch (error) {
      const target = new URL(successUrl);
      target.searchParams.set('calendar', 'error');
      target.searchParams.set(
        'reason',
        error instanceof Error ? error.message.slice(0, 160) : 'oauth_failed',
      );
      return reply.redirect(target.toString());
    }
  }

  @Post(':id/sync')
  @ApiBearerAuth()
  sync(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.calendars.sync(principal, id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  disconnect(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.calendars.disconnect(principal, id);
  }
}
