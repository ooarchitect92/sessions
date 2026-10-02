import { PrismaClient, WorkspaceRole } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
});

function required(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

async function main(): Promise<void> {
  const organizationId = required('DEV_ORGANIZATION_ID', '11111111-1111-4111-8111-111111111111');
  const workspaceId = required('DEV_WORKSPACE_ID', '22222222-2222-4222-8222-222222222222');
  const userId = required('DEV_USER_ID', '33333333-3333-4333-8333-333333333333');
  const email = required('DEV_USER_EMAIL', 'owner@sessions.local');

  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: 'Sessions Local', slug: 'sessions-local' },
    create: { id: organizationId, name: 'Sessions Local', slug: 'sessions-local' },
  });

  await prisma.user.upsert({
    where: { id: userId },
    update: { email, displayName: 'Local Owner' },
    create: { id: userId, email, displayName: 'Local Owner' },
  });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;

    await tx.workspace.upsert({
      where: { id: workspaceId },
      update: { name: 'Product Team', slug: 'product-team', timezone: 'Asia/Kolkata' },
      create: {
        id: workspaceId,
        organizationId,
        name: 'Product Team',
        slug: 'product-team',
        timezone: 'Asia/Kolkata',
        settings: { recordingConsentRequired: true },
      },
    });

    await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      update: { role: WorkspaceRole.OWNER },
      create: { organizationId, workspaceId, userId, role: WorkspaceRole.OWNER },
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
