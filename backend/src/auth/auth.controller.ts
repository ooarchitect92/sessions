import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Body,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { Public } from '../common/auth/public.decorator';
import { CreateDevTokenDto } from './dto/create-dev-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('dev-token')
  async createDevelopmentToken(
    @Body() body: CreateDevTokenDto,
  ): Promise<{ accessToken: string; expiresIn: number }> {
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

    const expiresIn = 60 * 60;
    const accessToken = await this.jwt.signAsync(
      {
        organizationId: body.organizationId,
        workspaceId: body.workspaceId,
        email: body.email,
        displayName: body.displayName,
        roles: body.roles,
      },
      { subject: body.userId, expiresIn },
    );

    return { accessToken, expiresIn };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }
}
