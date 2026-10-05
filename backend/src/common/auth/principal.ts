import type { WorkspaceRole } from '@prisma/client';

export interface Principal {
  userId: string;
  organizationId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  roles: WorkspaceRole[];
  sessionId?: string;
  authType?: 'SESSION' | 'API_KEY';
  apiKeyId?: string;
  apiKeyScopes?: string[];
}

export interface AccessTokenClaims {
  sub: string;
  organizationId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  roles: WorkspaceRole[];
  sid?: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

export const HOST_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'HOST'];
export const ADMIN_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN'];

export function hasAnyRole(principal: Principal, roles: readonly WorkspaceRole[]): boolean {
  return principal.roles.some((role) => roles.includes(role));
}
