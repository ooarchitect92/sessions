# Development guide

## First boot

```bash
cp .env.example .env
npm install
npm run db:generate
docker compose up -d postgres redis minio livekit
npm run db:migrate
npm run db:seed
npm run dev
```

## Local identities

The seed script creates one organization, one workspace, and one owner user using the deterministic UUIDs in `.env.example`. The frontend requests `/v1/auth/dev-token` only when `VITE_AUTH_MODE=development`. The API refuses that endpoint in production.

## Database changes

1. Update `backend/prisma/schema.prisma`.
2. Generate and review a named migration locally.
3. Add tenant columns and RLS policies for every tenant-owned table.
4. Verify both allowed and denied cross-workspace access.
5. Document data backfill and rollback/recovery behavior.

## API changes

Use DTO validation at the boundary, shared contracts where clients consume the shape, tenant context in every service call, audit events for sensitive changes, and outbox events for asynchronous side effects.

## Media testing

Use at least two browsers and verify device switching, permissions, reconnect, screen sharing, mute state, host removal, packet loss, and TURN fallback. Never treat a token response alone as proof that conferencing works.
