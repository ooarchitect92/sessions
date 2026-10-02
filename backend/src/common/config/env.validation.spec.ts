import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sessions_api:test@localhost:5432/sessions',
  WORKER_DATABASE_URL: 'postgresql://sessions_worker:test@localhost:5432/sessions',
  REDIS_URL: 'redis://localhost:6379',
  AUTH_MODE: 'local',
  AUTH_IP_HASH_PEPPER: 'unit-test-pepper-that-is-at-least-32-characters',
  AUTH_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  JWT_SECRET: 'unit-test-jwt-secret-that-is-at-least-thirty-two-characters',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret-that-is-long-enough',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'sessions-test',
  S3_ACCESS_KEY: 'test-access',
  S3_SECRET_KEY: 'test-secret',
};

describe('environment validation', () => {
  it('accepts a complete local test configuration', () => {
    const environment = validateEnvironment(base);

    expect(environment.AUTH_MODE).toBe('local');
    expect(environment.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(environment.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('rejects deterministic development authentication in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_MODE: 'development',
        PUBLIC_API_URL: 'https://api.example.com',
        LIVEKIT_URL: 'wss://media.example.com',
      }),
    ).toThrow('AUTH_MODE=development');
  });

  it('requires email verification for local production authentication', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_MODE: 'local',
        AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
        PUBLIC_API_URL: 'https://api.example.com',
        LIVEKIT_URL: 'wss://media.example.com',
      }),
    ).toThrow('requires email verification');
  });

  it('rejects the example auth encryption key in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
        AUTH_ENCRYPTION_KEY:
          '0000000000000000000000000000000000000000000000000000000000000000',
        PUBLIC_API_URL: 'https://api.example.com',
        LIVEKIT_URL: 'wss://media.example.com',
      }),
    ).toThrow('example auth encryption key');
  });
});
