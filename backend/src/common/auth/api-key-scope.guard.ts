import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import {
  API_KEY_SCOPES_KEY,
  type ApiKeyScope,
} from '../../integrations/api-key-scopes';
import type { Principal } from './principal';

type RequestWithPrincipal = FastifyRequest & { principal?: Principal };

@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (!principal || principal.authType !== 'api_key') return true;

    const required = this.reflector.getAllAndOverride<ApiKeyScope[]>(
      API_KEY_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      throw new ForbiddenException(
        'API keys are not allowed for this endpoint',
      );
    }

    const granted = new Set(principal.apiKeyScopes ?? []);
    if (!required.every((scope) => granted.has(scope))) {
      throw new ForbiddenException('The API key does not have the required scope');
    }

    return true;
  }
}
