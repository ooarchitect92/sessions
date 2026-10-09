import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../common/auth/principal';
import { WhiteboardsService } from './whiteboards.service';

const principal: Principal = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000003',
  email: 'host@example.com',
  displayName: 'Host',
  roles: [],
};

function service() {
  return new WhiteboardsService(
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

describe('WhiteboardsService validation', () => {
  it('rejects an add operation without an object payload', async () => {
    await expect(
      service().appendOperation(
        principal,
        '10000000-0000-4000-8000-000000000004',
        {
          clientOperationId: '10000000-0000-4000-8000-000000000005',
          kind: 'STROKE_ADD',
          payload: {},
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an operation whose object type does not match the command', async () => {
    await expect(
      service().appendOperation(
        principal,
        '10000000-0000-4000-8000-000000000004',
        {
          clientOperationId: '10000000-0000-4000-8000-000000000005',
          kind: 'NOTE_ADD',
          payload: {
            object: {
              id: 'note-1',
              type: 'stroke',
              points: [],
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an image object without a governed upload id', async () => {
    await expect(
      service().appendOperation(
        principal,
        '10000000-0000-4000-8000-000000000004',
        {
          clientOperationId: '10000000-0000-4000-8000-000000000005',
          kind: 'IMAGE_ADD',
          payload: {
            object: {
              id: 'image-1',
              type: 'image',
              x: 20,
              y: 20,
              width: 320,
              height: 200,
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an image object whose dimensions exceed the canvas', async () => {
    await expect(
      service().appendOperation(
        principal,
        '10000000-0000-4000-8000-000000000004',
        {
          clientOperationId: '10000000-0000-4000-8000-000000000005',
          kind: 'IMAGE_ADD',
          payload: {
            object: {
              id: 'image-1',
              type: 'image',
              uploadId: '10000000-0000-4000-8000-000000000006',
              x: 20,
              y: 20,
              width: 2000,
              height: 200,
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized whiteboard operations before database access', async () => {
    await expect(
      service().appendOperation(
        principal,
        '10000000-0000-4000-8000-000000000004',
        {
          clientOperationId: '10000000-0000-4000-8000-000000000005',
          kind: 'TEXT_ADD',
          payload: {
            object: {
              id: 'text-1',
              type: 'text',
              text: 'x'.repeat(70 * 1024),
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
