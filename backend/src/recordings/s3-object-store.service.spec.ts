import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { S3ObjectStoreService } from './s3-object-store.service';

function service() {
  return new S3ObjectStoreService(
    new ConfigService({
      S3_ENDPOINT: 'http://localhost:9000',
      S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'sessions-local',
      S3_ACCESS_KEY: 'minio',
      S3_SECRET_KEY: 'minio123',
      S3_FORCE_PATH_STYLE: true,
    }),
  );
}

describe('S3ObjectStoreService', () => {
  it('creates a bounded path-style signed playback URL without exposing the secret', () => {
    const url = service().createDownloadUrl(
      'organizations/o/workspaces/w/session.mp4',
      'Quarterly review.mp4',
      300,
      new Date('2026-10-03T12:00:00.000Z'),
    );

    expect(url).toContain(
      'http://localhost:9000/sessions-local/organizations/o/workspaces/w/session.mp4',
    );
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Expires=300');
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('Quarterly-review.mp4');
    expect(url).not.toContain('minio123');
  });

  it('generates deterministic signatures for a fixed clock', () => {
    const clock = new Date('2026-10-03T12:00:00.000Z');
    const first = service().createPresignedUrl('DELETE', 'a/b.mp4', 60, {}, clock);
    const second = service().createPresignedUrl('DELETE', 'a/b.mp4', 60, {}, clock);
    expect(first).toBe(second);
  });
});
