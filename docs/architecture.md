# Architecture

## System context

```mermaid
flowchart LR
  Product[Authenticated product app] -->|HTTPS / Socket.IO| API[NestJS + Fastify API]
  Public[Public event and booking app] -->|Narrow public HTTP| API
  Product <-->|WebRTC| SFU[LiveKit SFU]
  SFU --> TURN[Embedded / regional TURN]
  API --> PG[(PostgreSQL + forced RLS)]
  API --> Redis[(Redis)]
  API --> Outbox[Transactional outbox]
  Outbox --> Workers[Bounded workload workers]
  SFU --> Egress[Recording / egress workers]
  Egress --> S3[(Private object storage)]
  Workers --> S3
  Workers --> PG
  Workers --> Providers[Email / calendar / STT / LLM / CRM]
```

## Architectural choice

The product starts as a modular NestJS application with separate media infrastructure and extraction-ready workers. Premature microservices would multiply deployment, tracing, consistency, and incident complexity before the domain boundaries and traffic profiles are measured. Modules communicate through explicit services and durable outbox events so recording, transcription, notifications, integrations, analytics, and AI can become independently deployed services when scaling or security needs justify it.

## Runtime boundaries

- **HTTP API:** tenant-scoped CRUD, session commands, scheduling, registrations, artifact retrieval, administration, and provider callbacks.
- **Public API boundary:** reduced projections for published events and active booking pages. Tenant scope is derived from verified slugs, never caller-provided IDs.
- **Socket.IO gateway:** authenticated presence and broadcast of already committed agenda/chat/poll/Q&A/memory events.
- **LiveKit media plane:** audio, video, screen share, adaptive subscriptions, and room-scoped media authorization.
- **Outbox relay:** claims committed events, publishes to Redis Streams, retries with exponential backoff, and dead-letters terminal failures.
- **Workers:** recording finalization, transcription, summaries, reminders, webhooks, retention, export, and deletion. Only the dispatch foundation and work requests are currently implemented for provider-dependent jobs.
- **Object storage:** private recording objects, HLS/MP4 derivatives, transcripts, exports, thumbnails, and quarantined uploads.

## Domain flow

```mermaid
flowchart TD
  Room[Reusable room] --> Session[Meeting / webinar session]
  EventDraft[Event draft] -->|publish transaction| Event[Published event]
  Event --> Webinar[Scheduled webinar session]
  Event --> Registration[Registration / waitlist]
  BookingPage[Booking page] --> Slot[Generated available slot]
  Slot -->|locked transaction| Reservation[Reservation]
  Reservation --> Meeting[Scheduled meeting session]
  Session --> Agenda[Interactive agenda]
  Session --> Collaboration[Chat / polls / Q&A]
  Session -->|end| ArtifactRequests[Recording / transcript / summary requests]
  ArtifactRequests --> Memory[Meeting memory]
```

## Identity and workspace control plane

The first implemented identity boundary supports local email/password accounts, optional email verification, lockout, password reset, rotating opaque refresh tokens, token-family reuse detection, login-session inventory and revocation, TOTP MFA, recovery codes, expiring workspace invitations, role changes and multi-workspace switching. Access JWTs include `sid`; HTTP and Socket.IO authorization revalidate that session plus the current membership before constructing the principal. This prevents a stale token from retaining access after member removal, role change, password reset or explicit session revocation.

Authentication-secret tables are not granted to the normal tenant API role. A separately governed control-plane connection handles identity flows and must scope every operation by verified token, user or invitation context. Public recovery and verification requests use indistinguishable responses to reduce account enumeration. External OIDC/SAML remains a separate provider adapter and operational qualification gate rather than being simulated by local authentication.

## Tenant model and isolation

```mermaid
erDiagram
  ORGANIZATION ||--o{ WORKSPACE : contains
  USER ||--o{ WORKSPACE_MEMBERSHIP : has
  WORKSPACE ||--o{ WORKSPACE_MEMBERSHIP : grants
  WORKSPACE ||--o{ ROOM : owns
  WORKSPACE ||--o{ SESSION : owns
  WORKSPACE ||--o{ EVENT : owns
  WORKSPACE ||--o{ BOOKING_PAGE : owns
  SESSION ||--o{ AGENDA_ITEM : contains
  SESSION ||--o{ CHAT_MESSAGE : contains
  SESSION ||--o{ POLL : contains
  SESSION ||--o{ QUESTION : contains
  SESSION ||--o| RECORDING : has
  SESSION ||--o| TRANSCRIPT : has
  SESSION ||--o| MEMORY_SUMMARY : has
```

The bearer token supplies immutable `organizationId`, `workspaceId`, `userId`, and role claims. Every authenticated tenant transaction sets PostgreSQL `app.organization_id` and `app.workspace_id`. Forced RLS rejects cross-workspace reads and writes even when an application query omits a filter. Object keys, caches, realtime rooms, search documents, and analytics events must use the same scope.

Public endpoints are intentionally narrow. They resolve an organization/workspace/resource by slug, require the resource to be published or active, return a reduced projection, and perform mutations using a trusted server-side database boundary. Production should give this boundary a purpose-built database role and abuse controls rather than reusing a broad worker role.

## State machines

### Session

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SCHEDULED: publish
  DRAFT --> LIVE: instant start
  SCHEDULED --> LIVE: host starts
  DRAFT --> CANCELLED: cancel
  SCHEDULED --> CANCELLED: cancel
  LIVE --> ENDED: host ends
  ENDED --> PROCESSING: artifact workers begin
  PROCESSING --> READY: required artifacts complete
  PROCESSING --> FAILED: terminal processing failure
  FAILED --> PROCESSING: approved retry
  READY --> [*]
  CANCELLED --> [*]
```

### Event

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> PUBLISHED: publish + create webinar session
  PUBLISHED --> LIVE: event starts
  LIVE --> ENDED: event ends
  DRAFT --> CANCELLED
  PUBLISHED --> CANCELLED
  LIVE --> CANCELLED
```

### Artifacts

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> PROCESSING
  PROCESSING --> READY
  PROCESSING --> FAILED
  FAILED --> PENDING: governed retry
  READY --> DELETING
  FAILED --> DELETING
  DELETING --> DELETED
```

Transitions are validated server-side. Commands that have asynchronous consequences write the state change, audit evidence, and outbox event atomically.

## Scheduling consistency

Slot generation uses the booking page's IANA timezone and applies minimum notice, duration, and before/after buffers. Public reservation creation obtains a page-scoped PostgreSQL advisory transaction lock, recomputes availability, creates the reservation, and creates the scheduled session in one transaction. A database uniqueness constraint is the final duplicate defense. External calendar busy intervals will be added as another conflict source rather than replacing these controls.

## Collaboration consistency

Chat, poll, Q&A, and agenda commands are durable database commands. The API broadcasts their committed projection only after the transaction completes. Clients use realtime notifications to invalidate and reread state. A Redis/NATS fanout adapter, stream positions, reconnect cursors, and leased presence are required before horizontally scaling gateway replicas.

## Recording and AI pipeline direction

Ending a session with capture enabled creates explicit `PENDING` artifacts and outbox requests. Future workers will:

1. start/finalize LiveKit egress under verified consent;
2. write encrypted private objects and metadata;
3. submit audio to a configured STT provider;
4. persist speaker/timestamp transcript segments;
5. index workspace-filtered search documents;
6. run opt-in summary/action extraction;
7. return labeled, cited, editable output for human review;
8. trigger external updates only after explicit approval.

A model row or pending request is not evidence that provider processing succeeded.

## Reliability patterns

- `Idempotency-Key` protects externally retried create commands.
- Integer versions and `If-Match` prevent lost updates.
- Advisory transaction locks serialize booking/event capacity decisions where necessary.
- Database uniqueness constraints provide a final concurrency defense.
- Transactional outbox avoids dual-write loss.
- Bounded attempts, exponential backoff, lock expiry, dead-letter state, and future governed replay protect asynchronous delivery.
- Redis loss may affect transient presence or event notification but cannot corrupt durable state.
- Artifact readiness is eventually consistent and represented explicitly.

## Security boundaries

- LiveKit API secrets never leave the backend; browsers receive short-lived room-scoped grants.
- Local identity uses short-lived JWTs bound to rotating, revocable database sessions; passwords use scrypt, MFA secrets use authenticated encryption, and role changes are re-read on every request. Deterministic bootstrap is disabled in production. Enterprise identity still requires qualified OIDC/SAML, IdP logout and SCIM.
- Recording/transcription require visible disclosure, policy-driven consent, active indicators, audited access, retention, and deletion.
- External content requires allow-listed origins, CSP, sandboxed iframes, upload quarantine, malware scanning, and explicit remote-control grants.
- OAuth credentials and provider secrets belong in a managed vault with rotation and tenant ownership.
- AI is provider-abstracted, opt-in, asynchronous, reviewable, and prohibited from autonomous external actions.
- Exports and deletion cover rows, objects, search indexes, analytics copies, and backups according to policy.

## Initial production topology

- CDN/WAF for public/static traffic.
- Load balancer for API and WebSocket traffic.
- Stateless API replicas and separately bounded worker pools.
- Managed PostgreSQL with PITR and separate migrator/API/worker roles.
- Managed Redis configured for availability, not used as the source of truth.
- S3-compatible private object storage, lifecycle rules, quarantine, encryption, CDN, and signed access.
- Regional LiveKit and TURN capacity plus isolated egress workers.
- Central logs, metrics, traces, error tracking, alerting, and synthetic meeting checks.

## Scale path

1. Scale API, realtime gateway, workers, SFU, TURN, and egress independently.
2. Partition worker queues by latency and resource class so AI cannot starve reminders or webhooks.
3. Route media sessions to a home region and keep tenant data residency policy explicit.
4. Introduce regional cells for blast-radius and residency control.
5. Extract a domain only when measured scaling, runtime, security, ownership, or release constraints justify it.
6. Qualify backup restoration, regional recovery, load, packet loss, reconnect, and chaos behavior before enterprise release.


## Governed recording pipeline

```mermaid
sequenceDiagram
  participant U as Participant
  participant API as NestJS API
  participant DB as PostgreSQL/RLS
  participant W as Recording Worker
  participant LK as LiveKit Egress
  participant S3 as Private Object Storage

  U->>API: Grant/decline recording consent
  API->>DB: Upsert consent + audit/outbox
  U->>API: Request media token
  API->>DB: Verify GRANTED decision
  API->>DB: Create pending recording with consent snapshot
  API-->>U: Room-scoped media token
  W->>DB: Claim pending recording for LIVE session
  W->>LK: Start room-composite MP4 egress
  LK->>S3: Upload private recording
  W->>LK: Stop after session ends
  W->>DB: Reconcile COMPLETE/FAILED status
  U->>API: Request playback
  API-->>U: Short-lived S3 SigV4 URL
  W->>S3: Delete after retention expiry/request
  W->>DB: Mark recording DELETED
```

Consent is a durable per-user decision rather than a UI-only checkbox. Recording access never exposes long-lived storage credentials or raw object keys. Retention is enforced asynchronously and deletion remains idempotent.


## Meeting Memory retrieval

The first production retrieval tier is PostgreSQL full-text search rather than an external search service. Session title/description and transcript text have GIN expression indexes using the `simple` configuration so multilingual text is not forced through English stemming. Search is executed inside `TenantDatabaseService.run`, so forced RLS applies, while the query also includes explicit organization/workspace predicates as defense in depth. Results are relevance-ranked and paginated, then hydrated through Prisma for the existing artifact graph. An optional vector retrieval tier can later be added behind the same workspace boundary without replacing the lexical path.


## Optional semantic Memory tier

The Memory retrieval stack now has two independently useful tiers. PostgreSQL full-text search remains the deterministic baseline. An optional pgvector tier asynchronously embeds transcript chunks and supports cosine-ranked retrieval. The embedding index is version-pinned to the transcript so corrections cannot silently serve stale vectors. A worker role performs cross-tenant indexing, while user queries run through the tenant database transaction with forced RLS and explicit organization/workspace predicates. Local development uses deterministic mock embeddings only to exercise the end-to-end pipeline; production must configure a qualified provider or leave semantic retrieval disabled. The current semantic scope is transcript content; agenda/document ingestion remains a later RAG expansion.


## Human approval boundary for external AI actions

AI-generated follow-up emails and CRM notes are represented as durable `ai_external_actions`, not direct provider calls. Draft generation is user-triggered and pinned to a reviewed Memory-summary version. Hosts can edit drafts, then an explicit approval transition records the approver and timestamp. Only APPROVED actions are visible to the trusted background worker. Before any email delivery or CRM write, the worker checks that the source summary is still READY and at the exact version used to create the draft. A changed summary cancels the action as stale. Successful and failed executions are durable, provider calls use deterministic idempotency keys, and audit/outbox evidence is emitted. This boundary allows future Salesforce/HubSpot adapters without giving the LLM autonomous write authority.
