import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatChannel, PollType, WorkspaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../common/auth/principal';
import { CollaborationService } from './collaboration.service';

const host: Principal = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000003',
  email: 'host@example.com',
  displayName: 'Host',
  roles: [WorkspaceRole.HOST],
};

const member: Principal = {
  ...host,
  userId: '10000000-0000-4000-8000-000000000004',
  email: 'member@example.com',
  displayName: 'Member',
  roles: [WorkspaceRole.MEMBER],
};

function createService(): CollaborationService {
  return new CollaborationService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

describe('collaboration command validation', () => {
  it('requires at least two options for a choice poll', async () => {
    await expect(
      createService().createPoll(host, '10000000-0000-4000-8000-000000000005', {
        question: 'Continue?',
        type: PollType.SINGLE_CHOICE,
        anonymous: false,
        options: ['Yes'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects predefined options for open-text polls', async () => {
    await expect(
      createService().createPoll(host, '10000000-0000-4000-8000-000000000005', {
        question: 'What should change?',
        type: PollType.OPEN_TEXT,
        anonymous: false,
        options: ['Nothing'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a recipient for direct messages', async () => {
    await expect(
      createService().createChat(member, '10000000-0000-4000-8000-000000000005', {
        channel: ChatChannel.DIRECT,
        body: 'Private note',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents direct messages to the sender', async () => {
    await expect(
      createService().createChat(member, '10000000-0000-4000-8000-000000000005', {
        channel: ChatChannel.DIRECT,
        recipientUserId: member.userId,
        body: 'Private note',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents members from writing to the host-only chat channel', async () => {
    await expect(
      createService().createChat(member, '10000000-0000-4000-8000-000000000005', {
        channel: ChatChannel.HOSTS,
        body: 'Internal host note',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
