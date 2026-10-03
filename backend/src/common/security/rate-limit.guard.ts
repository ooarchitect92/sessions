import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal } from '../auth/principal';
import { RateLimitService } from './rate-limit.service';

type RequestWithPrincipal = FastifyRequest & { principal?: Principal };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly rateLimits: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    if (!this.config.get<boolean>('RATE_LIMIT_ENABLED', true)) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    if (request.method === 'OPTIONS') return true;

    const profile = this.rateLimits.profile(
      request.method,
      request.url,
      request.principal,
    );

    try {
      const result = await this.rateLimits.consume(
        profile,
        this.rateLimits.identity(request.principal, request.ip),
      );

      response.header('x-ratelimit-limit', String(result.limit));
      response.header('x-ratelimit-remaining', String(result.remaining));
      response.header('x-ratelimit-reset', String(result.resetSeconds));

      if (result.current > result.limit) {
        response.header('retry-after', String(Math.max(1, result.resetSeconds)));
        throw new HttpException(
          {
            message: 'Too many requests. Please retry later.',
            retryAfterSeconds: Math.max(1, result.resetSeconds),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      const failOpen = this.config.get<boolean>('RATE_LIMIT_FAIL_OPEN', true);
      this.logger.error(
        `Rate limiter unavailable for ${request.method} ${request.url}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      if (failOpen) return true;

      throw new HttpException(
        'Request protection is temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
