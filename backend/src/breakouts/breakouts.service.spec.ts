import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../common/auth/principal';
import { BreakoutsService } from './breakouts.service';

const member: Principal = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000003',
  email: 'member@example.com',
  displayName: 'Member',
  roles: [WorkspaceRole.MEMBER],
};

function service(): BreakoutsService {
  return new BreakoutsService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

describe('BreakoutsService authorization', () => {
  it('prevents non-hosts from creating breakout rooms', async () => {
    await expect(
      service().createRoom(
        member,
        '10000000-0000-4000-8000-000000000004',
        { name: 'Room A' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents non-hosts from opening breakout rooms', async () => {
    await expect(
      service().open(member, '10000000-0000-4000-8000-000000000004'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents non-hosts from broadcasting to breakout rooms', async () => {
    await expect(
      service().broadcast(
        member,
        '10000000-0000-4000-8000-000000000004',
        { body: 'Return in two minutes.' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
