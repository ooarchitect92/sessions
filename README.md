# Sessions

A clean-room, production-oriented implementation of an all-in-one platform for video meetings, webinars, interactive agendas, scheduling, collaboration, recordings, transcripts, and AI-assisted meeting memory.

This repository intentionally does **not** copy proprietary source code, visual assets, product copy, or undocumented behavior from any existing product. It implements the publicly described product category using an independent architecture and design system.

## What is implemented in this foundation

- npm workspace monorepo with a NestJS/Fastify API, React/Vite application, public website, and shared contracts.
- PostgreSQL data model for organizations, workspaces, memberships, reusable rooms, sessions, agenda items, audit records, idempotency records, and a transactional outbox.
- Workspace-scoped PostgreSQL row-level security for tenant-owned business data.
- Development JWT bootstrap plus a production boundary for future OIDC/SAML identity providers.
- Session lifecycle APIs with idempotent creation, optimistic concurrency, guarded state transitions, audit trails, and outbox events.
- Reusable permanent-room CRUD, interactive agenda APIs, and a real-time Socket.IO gateway for agenda activation and participant presence.
- LiveKit access-token issuance and a web meeting stage using official LiveKit React components.
- Redis-backed durable outbox relay foundation.
- Docker Compose dependencies for PostgreSQL, Redis, MinIO, and LiveKit; production TURN is documented as a separate deployment concern.
- CI, architecture documentation, clean-room rules, security guidance, and an implementation-status matrix.

The complete target is larger than one delivery unit. The status matrix in [`docs/implementation-status.md`](docs/implementation-status.md) distinguishes implemented, scaffolded, and planned capabilities so incomplete work is never represented as finished.

## Repository layout

```text
backend/                 NestJS + Fastify API and workers
frontend/                Authenticated React/Vite product application
website/                 Public marketing and event-entry website
packages/contracts/      Shared request/response schemas and TypeScript types
infra/                   Local media, TURN, database, and deployment foundations
docs/                    Architecture, ADRs, development, security, and delivery status
```

## Local development

### Prerequisites

- Node.js 22
- npm 10+
- Docker with Compose v2

### Start dependencies and applications

```bash
cp .env.example .env
npm install
npm run db:generate

docker compose up -d postgres redis minio livekit
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- Product application: `http://localhost:3000`
- Public website: `http://localhost:3001`
- API and Swagger: `http://localhost:4000/docs`
- LiveKit websocket: `ws://localhost:7880`
- MinIO console: `http://localhost:9001`

The local application obtains a short-lived development token for the deterministic seeded owner account. Development-token issuance is disabled when `NODE_ENV=production` or `AUTH_MODE` is not `development`.

### Run everything with containers

```bash
cp .env.example .env
docker compose up --build
```

### Quality gates

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

## API conventions

- Base path: `/v1`
- Authentication: bearer JWT
- Tenant scope: JWT claims contain `organizationId` and `workspaceId`; request headers cannot override them.
- Mutating create operations accept `Idempotency-Key`.
- Updates use `If-Match` with the current integer resource version.
- Successful responses use `{ data, meta }`; failures use `{ error: { code, message, details?, requestId }, meta }`.
- Swagger is available at `/docs` outside production unless explicitly enabled.

## Security baseline

The platform starts with tenant isolation, least-privilege role claims, forced RLS on tenant tables, signed short-lived media tokens, strict embed boundaries, audit events, secret-by-environment configuration, and recording-consent requirements. See [`SECURITY.md`](SECURITY.md) and [`docs/architecture.md`](docs/architecture.md).

## Delivery order

1. Foundation and tenant-safe session vertical slice.
2. Production identity, invitations, and complete workspace administration.
3. Meeting reliability, recording/egress, chat, polls, and agenda collaboration.
4. Scheduling, booking pages, webinars, registration, and reminders.
5. Memory library, transcription, search, analytics, and opt-in AI workflows.
6. Integrations, custom domains, billing, enterprise controls, and scale qualification.

## License

No license has been selected yet. Until an explicit license is added by the repository owner, all rights are reserved.
