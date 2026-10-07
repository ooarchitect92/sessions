import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadPurpose } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../common/auth/principal';
import { UploadsService } from './uploads.service';

const principal: Principal = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000003',
  email: 'owner@example.com',
  displayName: 'Owner',
  roles: [],
};

function service(maxBytes = 1024) {
  const config = {
    get: <T>(key: string, fallback: T) =>
      (key === 'UPLOAD_MAX_BYTES' ? maxBytes : fallback) as T,
  } as ConfigService;
  return new UploadsService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    config,
  );
}

describe('UploadsService validation', () => {
  it('rejects files larger than the configured upload limit before storage access', async () => {
    await expect(
      service(100).create(principal, {
        filename: 'large.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 101,
        purpose: UploadPurpose.AGENDA_RESOURCE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects executable MIME types before storage access', async () => {
    await expect(
      service().create(principal, {
        filename: 'payload.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 100,
        purpose: UploadPurpose.AGENDA_RESOURCE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
