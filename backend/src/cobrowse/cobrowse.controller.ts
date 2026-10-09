import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import {
  GrantCobrowseControlDto,
  NavigateCobrowseDto,
  StartCobrowseDto,
  StopCobrowseDto,
} from './cobrowse.dto';
import { CobrowseService } from './cobrowse.service';

@ApiTags('cobrowse')
@ApiBearerAuth()
@Controller('sessions/:sessionId/cobrowse')
export class CobrowseController {
  constructor(private readonly cobrowse: CobrowseService) {}

  @Get()
  getState(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.cobrowse.getState(principal, sessionId);
  }

  @Post('start')
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: StartCobrowseDto,
  ) {
    return this.cobrowse.start(principal, sessionId, body);
  }

  @Patch('navigate')
  navigate(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: NavigateCobrowseDto,
  ) {
    return this.cobrowse.navigate(principal, sessionId, body);
  }

  @Post('control')
  grantControl(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: GrantCobrowseControlDto,
  ) {
    return this.cobrowse.grantControl(principal, sessionId, body);
  }

  @Post('stop')
  stop(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: StopCobrowseDto,
  ) {
    return this.cobrowse.stop(principal, sessionId, body);
  }
}
