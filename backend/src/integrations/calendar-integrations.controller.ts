import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { Public } from '../common/auth/public.decorator';
import { CalendarIntegrationsService } from './calendar-integrations.service';

@ApiTags('calendar-integrations')
@ApiBearerAuth()
@Controller('calendar-integrations')
export class CalendarIntegrationsController {
  constructor(private readonly calendars: CalendarIntegrationsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.calendars.list(principal);
  }

  @Post(':provider/connect')
  connect(
    @CurrentPrincipal() principal: Principal,
    @Param('provider') provider: string,
    @Query('returnUrl') returnUrl?: string,
  ) {
    return this.calendars.beginConnection(principal, provider, returnUrl);
  }

  @Delete(':provider')
  disconnect(
    @CurrentPrincipal() principal: Principal,
    @Param('provider') provider: string,
  ) {
    return this.calendars.disconnect(principal, provider);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @Redirect(undefined, 302)
  async callback(
    @Param('provider') provider: string,
    @Query('state') state: string,
    @Query('code') code: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      return {
        url: `/settings?tab=integrations&calendar_error=${encodeURIComponent(error)}`,
      };
    }
    const result = await this.calendars.completeConnection(provider, state, code);
    const url = new URL(result.returnUrl);
    url.searchParams.set('calendar_connected', result.provider.toLowerCase());
    return { url: url.toString() };
  }
}
