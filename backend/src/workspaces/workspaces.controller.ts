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
import { CreateWorkspaceDomainDto } from './dto/create-workspace-domain.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspacesService } from './workspaces.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.workspaces.listAccessible(principal);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateWorkspaceDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    return this.workspaces.create(principal, body, idempotencyKey);
  }

  @Get('current')
  current(@CurrentPrincipal() principal: Principal) {
    return this.workspaces.getCurrent(principal);
  }

  @Patch('current')
  updateCurrent(
    @CurrentPrincipal() principal: Principal,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateWorkspaceDto,
  ) {
    return this.workspaces.updateCurrent(principal, parseVersion(ifMatch), body);
  }

  @Get('current/domains')
  listDomains(@CurrentPrincipal() principal: Principal) {
    return this.workspaces.listDomains(principal);
  }

  @Post('current/domains')
  createDomain(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateWorkspaceDomainDto,
  ) {
    return this.workspaces.createDomain(principal, body.hostname);
  }

  @Post('current/domains/:domainId/verify')
  verifyDomain(
    @CurrentPrincipal() principal: Principal,
    @Param('domainId', new ParseUUIDPipe({ version: '4' })) domainId: string,
  ) {
    return this.workspaces.verifyDomain(principal, domainId);
  }

  @Delete('current/domains/:domainId')
  removeDomain(
    @CurrentPrincipal() principal: Principal,
    @Param('domainId', new ParseUUIDPipe({ version: '4' })) domainId: string,
  ) {
    return this.workspaces.removeDomain(principal, domainId);
  }

  @Get('current/members')
  listMembers(@CurrentPrincipal() principal: Principal) {
    return this.workspaces.listMembers(principal);
  }

  @Patch('current/members/:membershipId')
  updateMemberRole(
    @CurrentPrincipal() principal: Principal,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
    @Body() body: UpdateMemberRoleDto,
  ) {
    return this.workspaces.updateMemberRole(principal, membershipId, body.role);
  }

  @Delete('current/members/:membershipId')
  removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' })) membershipId: string,
  ) {
    return this.workspaces.removeMember(principal, membershipId);
  }

  @Get('current/invitations')
  listInvitations(@CurrentPrincipal() principal: Principal) {
    return this.workspaces.listInvitations(principal);
  }

  @Post('current/invitations')
  inviteMember(
    @CurrentPrincipal() principal: Principal,
    @Body() body: InviteMemberDto,
  ) {
    return this.workspaces.inviteMember(principal, body);
  }

  @Delete('current/invitations/:invitationId')
  revokeInvitation(
    @CurrentPrincipal() principal: Principal,
    @Param('invitationId', new ParseUUIDPipe({ version: '4' })) invitationId: string,
  ) {
    return this.workspaces.revokeInvitation(principal, invitationId);
  }
}
