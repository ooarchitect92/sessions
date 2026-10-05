import { describe, expect, it } from 'vitest';
import type { Principal } from '../auth/principal';
import { selectRateLimitProfile } from './rate-limit.service';

const limits = {
  windowSeconds: 60,
  publicMax: 120,
  authWriteMax: 20,
  authenticatedMax: 240,
  apiKeyMax: 600,
};

const principal: Principal = {
  userId: '33333333-3333-4333-8333-333333333333',
  organizationId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  email: 'owner@sessions.local',
  displayName: 'Owner',
  roles: ['OWNER'],
};

describe('selectRateLimitProfile', () => {
  it('uses a strict shared bucket for authentication writes', () => {
    expect(
      selectRateLimitProfile('POST', '/v1/auth/login', undefined, limits),
    ).toEqual({
      name: 'auth_write',
      limit: 20,
      windowSeconds: 60,
    });
  });

  it('gives authenticated humans the user allowance', () => {
    expect(
      selectRateLimitProfile('GET', '/v1/sessions', principal, limits),
    ).toEqual({
      name: 'user',
      limit: 240,
      windowSeconds: 60,
    });
  });

  it('uses the separately governed API-key allowance', () => {
    expect(
      selectRateLimitProfile(
        'POST',
        '/v1/sessions',
        { ...principal, authType: 'api_key', apiKeyId: 'key-1' },
        limits,
      ),
    ).toEqual({
      name: 'api_key',
      limit: 600,
      windowSeconds: 60,
    });
  });

  it('limits anonymous public reads by IP identity', () => {
    expect(
      selectRateLimitProfile('GET', '/v1/public/events/demo', undefined, limits),
    ).toEqual({
      name: 'public',
      limit: 120,
      windowSeconds: 60,
    });
  });
});
