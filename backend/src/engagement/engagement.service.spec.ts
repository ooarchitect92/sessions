import { describe, expect, it, vi } from 'vitest';
import { ENGAGEMENT_EVENT, EngagementService } from './engagement.service';

describe('EngagementService', () => {
  it('persists tenant and actor context with the event payload', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'event-1' });
    const transaction = {
      engagementEvent: { create },
    } as never;
    const service = new EngagementService();

    await service.record(
      transaction,
      {
        organizationId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
      },
      {
        sessionId: '44444444-4444-4444-8444-444444444444',
        eventType: ENGAGEMENT_EVENT.CHAT_MESSAGE_SENT,
        sourceType: 'chat_message',
        sourceId: '55555555-5555-4555-8555-555555555555',
        properties: { channel: 'EVERYONE' },
      },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        sessionId: '44444444-4444-4444-8444-444444444444',
        actorUserId: '33333333-3333-4333-8333-333333333333',
        eventType: 'chat.message.sent',
        sourceType: 'chat_message',
        sourceId: '55555555-5555-4555-8555-555555555555',
        properties: { channel: 'EVERYONE' },
      }),
    });
  });

  it('allows an explicitly anonymous actor', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'event-2' });
    const transaction = {
      engagementEvent: { create },
    } as never;
    const service = new EngagementService();

    await service.record(
      transaction,
      {
        organizationId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
      },
      {
        sessionId: '44444444-4444-4444-8444-444444444444',
        eventType: ENGAGEMENT_EVENT.PARTICIPANT_JOINED,
        actorUserId: null,
      },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: null }),
    });
  });
});
