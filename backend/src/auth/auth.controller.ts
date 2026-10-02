import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { Public } from '../common/auth/public.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteMfaDto } from './dto/complete-mfa.dto';
import { ConfirmMfaDto } from './dto/confirm-mfa.dto';
import { CreateDevTokenDto } from './dto/create-dev-token.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RequestEmailVerificationDto } from './dto/request-email-verification.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthService, type AuthRequestMetadata } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  signUp(@Body() body: SignUpDto, @Req() request: FastifyRequest) {
    return this.auth.signUp(body, this.metadata(request));
  }

  @Public()
  @Post('login')
  login(@Body() body: LoginDto, @Req() request: FastifyRequest) {
    return this.auth.login(body, this.metadata(request));
  }

  @Public()
  @Post('mfa/complete')
  completeMfa(@Body() body: CompleteMfaDto, @Req() request: FastifyRequest) {
    return this.auth.completeMfa(body, this.metadata(request));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: RefreshSessionDto, @Req() request: FastifyRequest) {
    return this.auth.refresh(body, this.metadata(request));
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto, @Req() request: FastifyRequest) {
    return this.auth.verifyEmail(body, this.metadata(request));
  }

  @Public()
  @Post('verify-email/request')
  requestEmailVerification(@Body() body: RequestEmailVerificationDto) {
    return this.auth.requestEmailVerification(body);
  }

  @Public()
  @Post('password-reset/request')
  requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(body);
  }

  @Public()
  @Post('password-reset/complete')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body);
  }

  @Public()
  @Post('invitations/accept')
  acceptInvitation(@Body() body: AcceptInvitationDto, @Req() request: FastifyRequest) {
    return this.auth.acceptInvitation(body, this.metadata(request));
  }

  @Public()
  @Post('dev-token')
  async createDevelopmentToken(
    @Body() body: CreateDevTokenDto,
    @Req() request: FastifyRequest,
  ) {
    if (
      this.config.get<string>('NODE_ENV') === 'production' ||
      this.config.get<string>('AUTH_MODE') !== 'development'
    ) {
      throw new NotFoundException();
    }

    const expected = {
      organizationId: this.config.getOrThrow<string>('DEV_ORGANIZATION_ID'),
      workspaceId: this.config.getOrThrow<string>('DEV_WORKSPACE_ID'),
      userId: this.config.getOrThrow<string>('DEV_USER_ID'),
      email: this.config.getOrThrow<string>('DEV_USER_EMAIL'),
    };

    if (
      body.organizationId !== expected.organizationId ||
      body.workspaceId !== expected.workspaceId ||
      body.userId !== expected.userId ||
      body.email.toLowerCase() !== expected.email.toLowerCase()
    ) {
      throw new ForbiddenException('The requested development identity is not configured');
    }

    return this.auth.createDevelopmentSession(body, this.metadata(request));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return this.auth.me(principal);
  }

  @ApiBearerAuth()
  @Post('workspace/switch')
  switchWorkspace(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SwitchWorkspaceDto,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.switchWorkspace(principal, body, this.metadata(request));
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentPrincipal() principal: Principal, @Body() body: LogoutDto) {
    return this.auth.logout(principal, body.refreshToken);
  }

  @ApiBearerAuth()
  @Get('sessions')
  listSessions(@CurrentPrincipal() principal: Principal) {
    return this.auth.listSessions(principal);
  }

  @ApiBearerAuth()
  @Delete('sessions/:sessionId')
  revokeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.auth.revokeSession(principal, sessionId);
  }

  @ApiBearerAuth()
  @Patch('password')
  changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(principal, body);
  }

  @ApiBearerAuth()
  @Post('mfa/setup')
  setupMfa(@CurrentPrincipal() principal: Principal) {
    return this.auth.setupMfa(principal);
  }

  @ApiBearerAuth()
  @Post('mfa/confirm')
  confirmMfa(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ConfirmMfaDto,
  ) {
    return this.auth.confirmMfa(principal, body.code);
  }

  @ApiBearerAuth()
  @Delete('mfa')
  disableMfa(
    @CurrentPrincipal() principal: Principal,
    @Body() body: DisableMfaDto,
  ) {
    return this.auth.disableMfa(principal, body);
  }

  private metadata(request: FastifyRequest): AuthRequestMetadata {
    const userAgent = request.headers['user-agent'];
    return {
      ...(typeof userAgent === 'string' ? { userAgent } : {}),
      ip: request.ip,
    };
  }
}
