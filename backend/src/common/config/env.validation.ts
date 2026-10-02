import { z } from 'zod';

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    DATABASE_URL: z.string().min(1),
    WORKER_DATABASE_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1),
    AUTH_MODE: z.enum(['development', 'local', 'oidc']).default('development'),
    AUTH_REQUIRE_EMAIL_VERIFICATION: optionalBoolean.default(false),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    AUTH_IP_HASH_PEPPER: z.string().min(32),
    AUTH_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
    MFA_ISSUER: z.string().min(1).max(100).default('Sessions'),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().min(1).default('sessions-local'),
    JWT_AUDIENCE: z.string().min(1).default('sessions-web'),
    ENABLE_SWAGGER: optionalBoolean,
    DEV_ORGANIZATION_ID: z.string().uuid().default('11111111-1111-4111-8111-111111111111'),
    DEV_WORKSPACE_ID: z.string().uuid().default('22222222-2222-4222-8222-222222222222'),
    DEV_USER_ID: z.string().uuid().default('33333333-3333-4333-8333-333333333333'),
    DEV_USER_EMAIL: z.string().email().default('owner@sessions.local'),
    DEV_USER_PASSWORD: z.string().min(12).default('LocalOwner#2026'),
    LIVEKIT_URL: z.string().min(1).default('ws://localhost:7880'),
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(16),
    LIVEKIT_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(21600),
    OUTBOX_POLL_MS: z.coerce.number().int().min(250).max(60000).default(1000),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;

    const productionIssue = (path: keyof typeof value, message: string) => {
      context.addIssue({ code: 'custom', path: [path], message });
    };

    if (value.AUTH_MODE === 'development') {
      productionIssue('AUTH_MODE', 'AUTH_MODE=development is forbidden in production');
    }
    if (
      value.AUTH_MODE === 'local' &&
      value.AUTH_REQUIRE_EMAIL_VERIFICATION !== true
    ) {
      productionIssue(
        'AUTH_REQUIRE_EMAIL_VERIFICATION',
        'Local production authentication requires email verification',
      );
    }
    if (!value.WORKER_DATABASE_URL) {
      productionIssue(
        'WORKER_DATABASE_URL',
        'A dedicated worker database URL is required in production',
      );
    }
    if (value.JWT_SECRET.startsWith('replace-with')) {
      productionIssue('JWT_SECRET', 'The example JWT secret cannot be used in production');
    }
    if (value.AUTH_IP_HASH_PEPPER.startsWith('replace-with')) {
      productionIssue(
        'AUTH_IP_HASH_PEPPER',
        'The example IP hashing pepper cannot be used in production',
      );
    }
    if (
      value.AUTH_ENCRYPTION_KEY ===
      '0000000000000000000000000000000000000000000000000000000000000000'
    ) {
      productionIssue(
        'AUTH_ENCRYPTION_KEY',
        'The example auth encryption key cannot be used in production',
      );
    }
    if (
      value.LIVEKIT_API_KEY === 'devkey' ||
      value.LIVEKIT_API_SECRET.startsWith('devsecret')
    ) {
      productionIssue(
        'LIVEKIT_API_SECRET',
        'Development LiveKit credentials cannot be used in production',
      );
    }
    if (!value.PUBLIC_API_URL.startsWith('https://')) {
      productionIssue('PUBLIC_API_URL', 'PUBLIC_API_URL must use HTTPS in production');
    }
    if (!value.LIVEKIT_URL.startsWith('wss://')) {
      productionIssue('LIVEKIT_URL', 'LIVEKIT_URL must use WSS in production');
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
