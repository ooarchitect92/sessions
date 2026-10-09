import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyScopeGuard } from './api-key-scope.guard';
import type { Principal } from './principal';

function contextFor(principal: Principal): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ principal }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyScopeGuard', () => {
  it('does not change JWT/user-session authorization', () => {
    const reflector = {
      getAllAndOverride: vi.fn(),
    } as unknown as Reflector;
    const guard = new ApiKeyScopeGuard(reflector);

    expect(
      guard.canActivate(
        contextFor({
          userId: '33333333-3333-4333-8333-333333333333',
          organizationId: '11111111-1111-4111-8111-111111111111',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          email: 'owner@sessions.local',
          displayName: 'Owner',
          roles: ['OWNER'],
        }),
      ),
    ).toBe(true);
  });

  it('denies API keys on endpoints that did not explicitly opt in', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new ApiKeyScopeGuard(reflector);
    const principal: Principal = {
      userId: '33333333-3333-4333-8333-333333333333',
      organizationId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      email: 'owner@sessions.local',
      displayName: 'Owner',
      roles: ['OWNER'],
      authType: 'api_key',
      apiKeyId: '44444444-4444-4444-8444-444444444444',
      apiKeyScopes: ['sessions:read'],
    };

    expect(() => guard.canActivate(contextFor(principal))).toThrow(
      ForbiddenException,
    );
  });

  it('requires every declared API-key scope', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['sessions:write']),
    } as unknown as Reflector;
    const guard = new ApiKeyScopeGuard(reflector);
    const principal: Principal = {
      userId: '33333333-3333-4333-8333-333333333333',
      organizationId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      email: 'owner@sessions.local',
      displayName: 'Owner',
      roles: ['OWNER'],
      authType: 'api_key',
      apiKeyId: '44444444-4444-4444-8444-444444444444',
      apiKeyScopes: ['sessions:read'],
    };

    expect(() => guard.canActivate(contextFor(principal))).toThrow(
      ForbiddenException,
    );

    principal.apiKeyScopes = ['sessions:write'];
    expect(guard.canActivate(contextFor(principal))).toBe(true);
  });
});
