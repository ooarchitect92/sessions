import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, IsUUID, Length } from 'class-validator';
import { WorkspaceRole } from '@prisma/client';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { Public } from '../common/auth/public.decorator';
import { EnterpriseIdentityService } from './enterprise-identity.service';

class EnterpriseIdentityDto {
  @IsIn(['OIDC','SAML']) protocol!: 'OIDC' | 'SAML';
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() enforceSso?: boolean;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) issuerUrl?: string;
  @IsOptional() @IsString() @Length(1,255) clientId?: string;
  @IsOptional() @IsString() @Length(1,1000) clientSecret?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) authorizationEndpoint?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) tokenEndpoint?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) userinfoEndpoint?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) jwksUri?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) scopes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) emailDomains?: string[];
  @IsOptional() @IsString() @Length(1,120) roleAttribute?: string;
  @IsOptional() @IsIn(['ADMIN','HOST','MEMBER','ANALYST','GUEST']) defaultRole?: WorkspaceRole;
}
class CreateScimTokenDto { @IsString() @Length(2,120) name!: string; @IsOptional() @IsString() expiresAt?: string; }
class ScimCreateUserDto { @IsOptional() @IsString() externalId?: string; @IsString() userName!: string; @IsOptional() @IsBoolean() active?: boolean; @IsOptional() @IsString() displayName?: string; @IsOptional() name?: { formatted?: string }; }
class ScimPatchUserDto { @IsOptional() Operations?: Array<{ op?: string; path?: string; value?: unknown }>; }

@ApiTags('enterprise')
@ApiBearerAuth()
@Controller('enterprise')
export class EnterpriseIdentityController {
  constructor(private readonly enterprise: EnterpriseIdentityService) {}
  @Get('identity') getIdentity(@CurrentPrincipal() principal: Principal) { return this.enterprise.getConnection(principal); }
  @Put('identity') updateIdentity(@CurrentPrincipal() principal: Principal, @Body() body: EnterpriseIdentityDto) { return this.enterprise.upsertConnection(principal, body); }
  @Get('scim/tokens') listTokens(@CurrentPrincipal() principal: Principal) { return this.enterprise.listScimTokens(principal); }
  @Post('scim/tokens') createToken(@CurrentPrincipal() principal: Principal, @Body() body: CreateScimTokenDto) { return this.enterprise.createScimToken(principal, body.name, body.expiresAt); }
  @Delete('scim/tokens/:id') revokeToken(@CurrentPrincipal() principal: Principal, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.enterprise.revokeScimToken(principal, id); }
}

@ApiTags('scim')
@Public()
@Controller('scim/v2')
export class ScimController {
  constructor(private readonly enterprise: EnterpriseIdentityService) {}
  @Get('Users') users(@Headers('authorization') authorization?: string) { return this.enterprise.scimListUsers(authorization); }
  @Post('Users') create(@Headers('authorization') authorization: string | undefined, @Body() body: ScimCreateUserDto) { return this.enterprise.scimCreateUser(authorization, body); }
  @Patch('Users/:id') patch(@Headers('authorization') authorization: string | undefined, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: ScimPatchUserDto) { return this.enterprise.scimPatchUser(authorization, id, body); }
}