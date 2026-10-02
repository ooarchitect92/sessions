# Sessions

A clean-room, production-oriented implementation of an all-in-one platform for video meetings, webinars, interactive agendas, booking pages, collaboration, recordings, transcripts, and AI-assisted meeting memory.

This repository intentionally does **not** copy proprietary source code, visual assets, product copy, or undocumented behavior from another product. It implements the publicly described product category with an independent architecture, source tree, interaction design, and delivery plan.

## Current implementation

The repository now contains runnable vertical slices rather than placeholder-only modules:

- **Tenant-safe platform core:** organizations, workspaces, memberships, roles, deterministic development identity, separate database roles, forced PostgreSQL row-level security, audit records, idempotency records, optimistic concurrency, and a transactional outbox.
- **Meetings and rooms:** reusable permanent rooms, session creation/scheduling, guarded lifecycle transitions, interactive agenda items, realtime agenda activation, LiveKit room tokens, and a browser meeting stage.
- **Durable collaboration:** authenticated presence, persisted public/host chat, polls with launch/answer/results/close lifecycle, moderated Q&A, voting, and realtime committed-event broadcasts.
- **Webinars and events:** event drafts, publish/cancel lifecycle, atomic webinar-session creation, public event pages, registration, capacity handling, waitlisting, and registration administration.
- **Booking pages:** workspace page management, IANA-timezone availability, minimum notice, buffers, bounded slot generation, conflict filtering, advisory locking, and atomic reservation plus scheduled-session creation.
- **Meeting memory foundation:** recording, transcript, transcript-segment, and reviewed-summary state models; post-session work requests; a searchable memory library; a memory detail page; and controlled retry of failed jobs.
- **Public journeys:** original public event-registration and booking interfaces in the website application.
- **Operations:** Docker Compose for PostgreSQL, Redis, MinIO, and LiveKit; database migrations; deterministic seed data; CI migration smoke tests; quality gates; architecture, API, testing, security, and delivery-status documentation.

Provider-dependent work is deliberately not represented as complete. LiveKit egress, speech-to-text execution, LLM execution, calendar OAuth, reminder delivery, signed artifact playback, production identity, custom domains, analytics, billing, and enterprise controls remain explicit delivery gates. See [`docs/implementation-status.md`](docs/implementation-status.md) and [`docs/backlog.md`](docs/backlog.md).

## Architecture at a glance

```mermaid
flowchart LR
  Product[Authenticated product app] -->|HTTPS / Socket.IO| API[NestJS + Fastify]
  Public[Public event and booking UI] -->|Narrow public APIs| API
  Product <-->|WebRTC| LiveKit[LiveKit SFU]
  API --> PG[(PostgreSQL + forced RLS)]
  API --> Redis[(Redis)]
  API --> Outbox[Transactional outbox]
  Outbox --> Workers[Bounded workers]
  Workers --> S3[(Private object storage)]
  Workers --> Providers[Calendar / email / STT / LLM / CRM]
  LiveKit --> Egress[Recording egress]
  Egress --> S3
```

The first delivery topology is a modular monolith plus separately scalable workers and media infrastructure. Domain boundaries and durable events allow services to be extracted only when independent scaling, security, runtime, or release requirements justify the operational cost.

## Repository layout

```text
backend/                 NestJS + Fastify API, domain modules, Prisma and workers
frontend/                Authenticated React/Vite product application
website/                 Marketing site plus public event and booking journeys
packages/contracts/      Shared request/response schemas and TypeScript types
infra/                   Local media, TURN, database and deployment foundations
docs/                    Architecture, API, data model, ADRs, testing and status
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

docker compose up -d postgres redis minio minio-create-bucket livekit
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

The seed creates the deterministic local organization `sessions-local`, workspace `product-team`, and owner identity described in `.env.example`. The frontend requests a short-lived development token only when `VITE_AUTH_MODE=development`; the API refuses development token issuance in production.

### Run the complete local stack in containers

```bash
cp .env.example .env
docker compose up --build
```

### Quality gates

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

The CI workflow also deploys all migrations against a fresh PostgreSQL service.

## Useful local workflows

### Create and run a meeting

1. Open the product application.
2. Create a scheduled or instant session.
3. Add agenda items.
4. Start the session and open the LiveKit media stage.
5. Use the Chat, Polls, and Q&A tabs.
6. End a session with recording or transcription enabled to create durable artifact-processing requests.
7. Open Memory to inspect processing state and the complete session context.

### Publish an event

1. Open Events and create a draft.
2. Publish it; the backend atomically creates a scheduled webinar session.
3. Open the public route `/events/sessions-local/product-team/<event-slug>` on the website.
4. Submit a registration. Capacity overflow enters the waitlist.

### Publish a booking page

1. Open Bookings and create a page.
2. Open `/book/sessions-local/product-team/<booking-slug>` on the website.
3. Choose a generated slot and submit attendee details.
4. The backend locks the page, revalidates availability, and atomically creates the reservation and scheduled meeting.

## API conventions

- Base path: `/v1`
- Authenticated operations: bearer JWT with immutable organization/workspace/user/role claims
- Public routes: resolve a published resource from organization/workspace/resource slugs and never accept arbitrary tenant IDs
- Create commands: `Idempotency-Key` where duplicate execution would be harmful
- Versioned updates: `If-Match` with the current integer resource version
- Success envelope: `{ data, meta }`
- Failure envelope: `{ error: { code, message, details?, requestId }, meta }`
- Swagger: `/docs` outside production unless explicitly enabled

See [`docs/api.md`](docs/api.md) for the implemented endpoint inventory.

## Security baseline

The platform uses verified tenant claims, application authorization, separate API/worker/migration database roles, forced RLS on tenant-owned tables, signed short-lived media grants, private object-storage intent, audit evidence, environment validation, recording-consent requirements, bounded public endpoints, and explicit failure states. See [`SECURITY.md`](SECURITY.md), [`docs/architecture.md`](docs/architecture.md), and [`docs/testing.md`](docs/testing.md).

## Delivery order from here

1. Production identity, invitations, MFA, session revocation, and workspace administration.
2. LiveKit egress, consent ledger, signed playback, retention, deletion, and artifact workers.
3. STT provider abstraction, live captions, diarization, transcript correction, and indexed search.
4. Calendar OAuth/busy-time sync, booking reschedule/cancel, ICS, notifications, and reminder reconciliation.
5. Whiteboards, breakouts, rich content blocks, safe embeds, file quarantine, and malware scanning.
6. Provider-abstracted AI generation, human review, grounded citations, evaluation, and approved follow-up actions.
7. Webhook/API-key administration, integrations, analytics, branding/domains, billing, enterprise controls, scale, and disaster recovery.

## License

No license has been selected. Until an explicit license is added by the repository owner, all rights are reserved.
