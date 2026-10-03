# Research-to-implementation roadmap

This roadmap translates the supplied Sessions-like platform research into the existing clean-room repository architecture. It does not copy proprietary code, assets, or undocumented behavior.

## Product capability map

The target product combines meetings, interactive agendas, content embedding/co-browsing, polls, whiteboards, breakout rooms, reusable rooms, webinars/events, bookings, workspaces/RBAC, cloud recording, transcription, AI summaries, branding/domains, integrations/API/webhooks, analytics, and a searchable meeting memory.

## Architecture baseline

The implementation remains a modular monolith for the transactional application boundary, with independently scalable workers and media infrastructure:

- React/Vite authenticated product application and public website
- NestJS/Fastify API
- PostgreSQL with tenant scoping and forced RLS
- Redis for realtime/state coordination and the outbox event stream
- LiveKit SFU plus egress for media
- S3-compatible private object storage
- asynchronous provider workers for transcription, AI, calendar, notifications, and connectors

The service boundaries intentionally mirror the research architecture: auth/workspaces, meeting/session manager, agendas, bookings, events, recording, transcription, AI memory, analytics, notifications, integrations, realtime synchronization, and media.

## Delivery sequence

### Phase A — complete capture and memory
1. Recording-backed STT provider abstraction and worker.
2. Transcript segment persistence and failure/retry behavior.
3. Live-caption transport boundary and diarization qualification.
4. Transcript correction/revision history.
5. AI provider abstraction for summaries, decisions, actions, and agenda generation.
6. Search indexing and optional vector retrieval, always workspace-filtered.

### Phase B — complete collaboration
1. Device preflight and host moderation.
2. Reactions and private messaging.
3. Sandboxed rich content/embed resolver.
4. Upload quarantine and signed file access.
5. Collaborative whiteboard snapshots.
6. Breakout assignment and media-room transitions.

### Phase C — complete scheduling and webinars
1. Google/Microsoft calendar OAuth and busy-time sync.
2. Booking reschedule/cancel and ICS.
3. Reminder jobs and delivery reconciliation.
4. Dynamic registration/intake forms.
5. Webinar roles, speaker profiles, and landing-page builder.
6. Durable attendance and engagement events.

### Phase D — SaaS and enterprise
1. API keys and HMAC-signed webhook subscriptions/replay.
2. Connector credential governance and SSRF-safe egress.
3. Branding, themes, custom domains, TLS, and email templates.
4. Analytics aggregation and exports.
5. Billing, plans, seats, quotas, and entitlement enforcement.
6. OIDC/SAML, SCIM, enterprise policy, audit exports, localization, accessibility, load qualification, backup and disaster recovery.

## First implementation slice

The first new slice is the recording-backed transcription worker. It claims pending transcript artifacts only after a recording is READY, downloads the private recording through the object-store abstraction, invokes a configurable OpenAI-compatible STT boundary, persists timestamped transcript segments, marks the transcript READY or FAILED, and emits a durable `transcript.ready` event. The worker is disabled by default until credentials are configured.
