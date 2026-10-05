import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Principal } from '../auth/principal';
import { RedisService } from '../../infrastructure/redis.service';

export interface RateLimitProfile {
  name: 'public' | 'auth_write' | 'user' | 'api_key';
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult extends RateLimitProfile {
  current: number;
  remaining: number;
  resetSeconds: number;
}

export function selectRateLimitProfile(
  method: string,
  url: string,
  principal: Principal | undefined,
  config: {
    windowSeconds: number;
    publicMax: number;
    authWriteMax: number;
    authenticatedMax: number;
    apiKeyMax: number;
  },
): RateLimitProfile {
  const normalizedMethod = method.toUpperCase();
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
  const isAuthWrite = isWrite && /\/auth(?:\/|\?|$)/.test(url);

  if (isAuthWrite) {
    return {
      name: 'auth_write',
      limit: config.authWriteMax,
      windowSeconds: config.windowSeconds,
    };
  }

  if (principal?.authType === 'api_key') {
    return {
      name: 'api_key',
      limit: config.apiKeyMax,
      windowSeconds: config.windowSeconds,
    };
  }

  if (principal) {
    return {
      name: 'user',
      limit: config.authenticatedMax,
      windowSeconds: config.windowSeconds,
    };
  }

  return {
    name: 'public',
    limit: config.publicMax,
    windowSeconds: config.windowSeconds,
  };
}

@Injectable()
export class RateLimitService {
  private static readonly SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  profile(
    method: string,
    url: string,
    principal?: Principal,
  ): RateLimitProfile {
    return selectRateLimitProfile(method, url, principal, {
      windowSeconds: this.config.get<number>('RATE_LIMIT_WINDOW_SECONDS', 60),
      publicMax: this.config.get<number>('RATE_LIMIT_PUBLIC_MAX', 120),
      authWriteMax: this.config.get<number>('RATE_LIMIT_AUTH_WRITE_MAX', 20),
      authenticatedMax: this.config.get<number>('RATE_LIMIT_AUTHENTICATED_MAX', 240),
      apiKeyMax: this.config.get<number>('RATE_LIMIT_API_KEY_MAX', 600),
    });
  }

  async consume(
    profile: RateLimitProfile,
    identity: string,
  ): Promise<RateLimitResult> {
    const key = `ratelimit:v1:${profile.name}:${this.hashIdentity(identity)}`;
    const raw = await this.redis.eval(
      RateLimitService.SCRIPT,
      1,
      key,
      String(profile.windowSeconds),
    );
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new Error('Redis returned an invalid rate-limit response');
    }
    const current = Number(raw[0]);
    const ttl = Math.max(0, Number(raw[1]));

    return {
      ...profile,
      current,
      remaining: Math.max(0, profile.limit - current),
      resetSeconds: ttl,
    };
  }

  identity(
    principal: Principal | undefined,
    ip: string,
  ): string {
    if (principal?.authType === 'api_key' && principal.apiKeyId) {
      return `api-key:${principal.workspaceId}:${principal.apiKeyId}`;
    }
    if (principal) {
      return `user:${principal.workspaceId}:${principal.userId}`;
    }
    return `ip:${ip}`;
  }

  private hashIdentity(value: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('AUTH_IP_HASH_PEPPER'),
    )
      .update(value)
      .digest('hex');
  }
}
