import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventPresenterRole, WorkspaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../common/auth/principal';
import { EventsService } from './events.service';

const member: Principal = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000003',
  email: 'member@example.com',
  displayName: 'Member',
  roles: [WorkspaceRole.MEMBER],
};

const host: Principal = {
  ...member,
  roles: [WorkspaceRole.HOST],
};

function service(): EventsService {
  return new EventsService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

describe('event presenter authorization', () => {
  it('prevents ordinary members from changing presenter teams', async () => {
    await expect(
      service().createPresenter(
        member,
        '10000000-0000-4000-8000-000000000004',
        {
          role: EventPresenterRole.SPEAKER,
          name: 'Speaker',
          email: 'speaker@example.com',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reserves the organizer role for the event creator', async () => {
    await expect(
      service().createPresenter(
        host,
        '10000000-0000-4000-8000-000000000004',
        {
          role: EventPresenterRole.ORGANIZER,
          name: 'Another organizer',
          email: 'organizer@example.com',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
