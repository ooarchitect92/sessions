import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { Public } from '../common/auth/public.decorator';
import { CreateEnterpriseIdentityProviderDto } from './dto/create-enterprise-identity-provider.dto';
import { CreateScimTokenDto } from './dto/create-scim-token.dto';
import { OidcCallbackDto } from './dto/oidc-callback.dto';
import { RotateEnterpriseClientSecretDto } from './dto/rotate-enterprise-client-secret.dto';
import { UpdateEnterpriseIdentityProviderDto } from './dto/update-enterprise-identity-provider.dto';
import { EnterpriseIdentityService } from './enterprise-identity.service';

@ApiTags('enterprise')
@ApiBearerAuth()
@Controller('enterprise')
export class EnterpriseIdentityController {
  constructor(private readonly enterprise: EnterpriseIdentityService) {}

  @Get('identity-providers')
  listProviders(@CurrentPrincipal() principal: Principal) {
    return this.enterprise.listProviders(principal);
  }

  @Post('identity-providers')
  createProvider(
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateEnterpriseIdentityProviderDto,
  ) {
    return this.enterprise.createProvider(principal, input);
  }

  @Patch('identity-providers/:providerId')
  updateProvider(
    @CurrentPrincipal() principal: Principal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: UpdateEnterpriseIdentityProviderDto,
  ) {
    return this.enterprise.updateProvider(principal, providerId, input);
  }

  @Post('identity-providers/:providerId/rotate-secret')
  rotateSecret(
    @CurrentPrincipal() principal: Principal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: RotateEnterpriseClientSecretDto,
  ) {
    return this.enterprise.rotateClientSecret(principal, providerId, input);
  }

  @Post('identity-providers/:providerId/enable')
  enableProvider(
    @CurrentPrincipal() principal: Principal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ) {
    return this.enterprise.setProviderEnabled(principal, providerId, true);
  }

  @Post('identity-providers/:providerId/disable')
  disableProvider(
    @CurrentPrincipal() principal: Principal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ) {
    return this.enterprise.setProviderEnabled(principal, providerId, false);
  }

  @Get('identity-providers/:providerId/scim-tokens')
  listScimTokens(
    @CurrentPrincipal() principal: Principal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ) {
    return this.enterprise.listScimTokens(principal, providerId);
  }

  @Post('identity-providers/:providerId/scim-tokens')
  createScimToken(
    @CurrentPrincipal() principal: Principal,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() input: CreateScimTokenDto,
  ) {
    return this.enterprise.createScimToken(principal, providerId, input);
  }

  @Post('scim-tokens/:tokenId/revoke')
  revokeScimToken(
    @CurrentPrincipal() principal: Principal,
    @Param('tokenId', new ParseUUIDPipe({ version: '4' })) tokenId: string,
  ) {
    return this.enterprise.revokeScimToken(principal, tokenId);
  }

  @Public()
  @Get('sso/discover')
  discover(@Query('email') email: string) {
    return this.enterprise.discoverByEmail(email);
  }

  @Public()
  @Get('sso/oidc/:providerId/start')
  startOidc(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ) {
    return this.enterprise.startOidc(providerId);
  }

  @Public()
  @Post('sso/oidc/callback')
  completeOidc(
    @Body() input: OidcCallbackDto,
    @Req() request: FastifyRequest,
  ) {
    const userAgent = request.headers['user-agent'];
    return this.enterprise.completeOidc(input, {
      ...(typeof userAgent === 'string' ? { userAgent } : {}),
      ip: request.ip,
    });
  }
}
