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
import { CreateProviderConnectionDto } from './dto/create-provider-connection.dto';
import { RotateProviderCredentialDto } from './dto/rotate-provider-credential.dto';
import { UpdateProviderConnectionDto } from './dto/update-provider-connection.dto';
import { ProviderConnectionsService } from './provider-connections.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations/providers')
export class ProviderConnectionsController {
  constructor(private readonly providers: ProviderConnectionsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.providers.list(principal);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateProviderConnectionDto,
  ) {
    return this.providers.create(principal, input);
  }

  @Patch(':connectionId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('connectionId', new ParseUUIDPipe({ version: '4' }))
    connectionId: string,
    @Body() input: UpdateProviderConnectionDto,
  ) {
    return this.providers.update(principal, connectionId, input);
  }

  @Post(':connectionId/rotate-secret')
  rotateSecret(
    @CurrentPrincipal() principal: Principal,
    @Param('connectionId', new ParseUUIDPipe({ version: '4' }))
    connectionId: string,
    @Body() input: RotateProviderCredentialDto,
  ) {
    return this.providers.rotateCredential(principal, connectionId, input);
  }

  @Post(':connectionId/enable')
  enable(
    @CurrentPrincipal() principal: Principal,
    @Param('connectionId', new ParseUUIDPipe({ version: '4' }))
    connectionId: string,
  ) {
    return this.providers.setEnabled(principal, connectionId, true);
  }

  @Post(':connectionId/disable')
  disable(
    @CurrentPrincipal() principal: Principal,
    @Param('connectionId', new ParseUUIDPipe({ version: '4' }))
    connectionId: string,
  ) {
    return this.providers.setEnabled(principal, connectionId, false);
  }
}
