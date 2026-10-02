import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AccessTokenClaims, Principal } from './principal';

const claimsSchema = z.object({
  sub: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(160),
  roles: z.array(z.enum(['OWNER', 'ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST'])).min(1),
});

type RequestWithPrincipal = FastifyRequest & { principal?: Principal };

@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A bearer access token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
      const parsed = claimsSchema.parse(claims);
      request.principal = {
        userId: parsed.sub,
        organizationId: parsed.organizationId,
        workspaceId: parsed.workspaceId,
        email: parsed.email,
        displayName: parsed.displayName,
        roles: parsed.roles,
      };
      return true;
    } catch {
      throw new UnauthorizedException('The access token is invalid or expired');
    }
  }
}
