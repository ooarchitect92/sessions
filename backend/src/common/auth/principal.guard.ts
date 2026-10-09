import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../../auth/auth.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AccessTokenClaims, Principal } from './principal';

const claimsSchema = z.object({
  sub: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(160),
  roles: z.array(z.enum(['OWNER', 'ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST'])).min(1),
  sid: z.string().uuid().optional(),
});

type RequestWithPrincipal = FastifyRequest & { principal?: Principal };

@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly integrations: IntegrationsService,
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

    if (token.startsWith('sk_sessions_')) {
      request.principal = await this.integrations.authenticateApiKey(token);
      this.assertApiKeyScope(request, request.principal);
      return true;
    }

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
      const parsed = claimsSchema.parse(claims) as AccessTokenClaims;
      request.principal = await this.auth.resolvePrincipalFromClaims(parsed);
      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('The access token is invalid or expired');
    }
  }

  private assertApiKeyScope(request: FastifyRequest, principal: Principal): void {
    const path = (request.url.split('?')[0] ?? '').replace(/^\/v1\//, '');
    const resource = path.split('/')[0] ?? '';
    const method = request.method.toUpperCase();
    const access = method === 'GET' || method === 'HEAD' ? 'read' : 'write';
    const resourceMap: Record<string, string> = {
      sessions: 'sessions',
      rooms: 'rooms',
      events: 'events',
      bookings: 'bookings',
      memory: 'memory',
      recordings: 'memory',
      transcripts: 'memory',
      analytics: 'analytics',
    };
    const scopeResource = resourceMap[resource];
    if (!scopeResource) {
      throw new ForbiddenException('API keys cannot access this endpoint');
    }

    const requiredScope = scopeResource + ':' + access;
    if (!principal.apiScopes?.includes(requiredScope)) {
      throw new ForbiddenException('The API key does not include the required scope');
    }
  }
}
