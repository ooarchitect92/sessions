import { PrismaClient, WorkspaceRole } from '@prisma/client';
import { randomBytes, scrypt } from 'node:crypto';

const prisma = new PrismaClient({
  datasourceUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
});

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const PASSWORD_KEY_BYTES = 64;

function required(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      PASSWORD_KEY_BYTES,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, value) => {
        if (error) reject(error);
        else resolve(value);
      },
    );
  });
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

async function main(): Promise<void> {
  const organizationId = required(
    'DEV_ORGANIZATION_ID',
    '11111111-1111-4111-8111-111111111111',
  );
  const workspaceId = required(
    'DEV_WORKSPACE_ID',
    '22222222-2222-4222-8222-222222222222',
  );
  const userId = required(
    'DEV_USER_ID',
    '33333333-3333-4333-8333-333333333333',
  );
  const email = required('DEV_USER_EMAIL', 'owner@sessions.local');
  const password = required('DEV_USER_PASSWORD', 'LocalOwner#2026');
  const passwordHash = await hashPassword(password);

  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: 'Sessions Local', slug: 'sessions-local' },
    create: {
      id: organizationId,
      name: 'Sessions Local',
      slug: 'sessions-local',
    },
  });

  await prisma.user.upsert({
    where: { id: userId },
    update: {
      email,
      displayName: 'Local Owner',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    create: {
      id: userId,
      email,
      displayName: 'Local Owner',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;

    await tx.workspace.upsert({
      where: { id: workspaceId },
      update: {
        name: 'Product Team',
        slug: 'product-team',
        timezone: 'Asia/Kolkata',
      },
      create: {
        id: workspaceId,
        organizationId,
        name: 'Product Team',
        slug: 'product-team',
        timezone: 'Asia/Kolkata',
        settings: {
          recordingConsentRequired: true,
          authPolicy: { mfaRecommended: true },
        },
      },
    });

    await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      update: { role: WorkspaceRole.OWNER },
      create: {
        organizationId,
        workspaceId,
        userId,
        role: WorkspaceRole.OWNER,
      },
    });

    await tx.room.upsert({
      where: { workspaceId_slug: { workspaceId, slug: 'team-room' } },
      update: { title: 'Team Room' },
      create: {
        organizationId,
        workspaceId,
        slug: 'team-room',
        title: 'Team Room',
        settings: { waitingRoom: true, recordingDefault: false },
      },
    });
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
