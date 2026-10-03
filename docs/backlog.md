# Delivery backlog

## Phase 1 — secure meeting foundation

- [x] Monorepo, local runtime and CI foundation
- [x] organizations/workspaces/users/memberships schema
- [x] JWT tenant context, separate database roles and forced PostgreSQL RLS
- [x] permanent-room CRUD with optimistic versioning
- [x] session create, schedule, update, start, end and cancel
- [x] interactive agenda create, reorder and activate API
- [x] agenda editor and realtime activation
- [x] LiveKit token issuance and browser meeting stage
- [x] audit events, idempotency records and transactional outbox
- [x] local email/password identity, email verification tokens and password recovery
- [x] rotating refresh sessions, reuse detection, session inventory and revocation
- [x] workspace invitations, owner-preserving role management and multi-workspace switching
- [x] TOTP MFA with encrypted secrets and single-use recovery codes
- [ ] production OIDC/SAML, IdP logout, SCIM and identity-provider qualification
- [x] Redis-backed distributed API rate limiting with stricter auth-write, public, user and API-key buckets
- [ ] device preflight, host moderation, reconnect and media qualification

## Phase 2 — collaboration and reliable capture

- [x] persistent public and host chat
- [x] poll creation, launch, answer, results and close lifecycle
- [x] moderated Q&A with voting and answers
- [ ] reactions and private direct-message channels
- [ ] whiteboard integration, snapshots and operation compaction
- [ ] breakout assignment, media-room transition and host broadcast
- [x] URL-backed agenda content blocks, HTTPS/private-network policy and sandboxed embed rendering
- [ ] OAuth/native app embeds, co-browsing permissions and remote-control consent
- [ ] upload quarantine, malware scan and signed downloads
- [x] recording, transcript and summary artifact state models
- [x] post-session artifact requests, audit evidence and retry controls
- [x] LiveKit egress orchestration and recording finalization worker
- [x] recording consent ledger, playback authorization, retention and deletion

## Phase 3 — scheduling and audience workflows

- [x] IANA timezone availability engine
- [x] lead time, buffers, overlap filtering and advisory-lock conflict control
- [x] booking-page CRUD, public slot selection and atomic reservation/session creation
- [x] secure booking reschedule, cancellation and ICS generation
- [ ] reminder delivery and booking-management email links
- [ ] Google and Microsoft calendar OAuth and busy-time synchronization
- [x] webinar/event draft, publish and cancellation lifecycle
- [x] public event page, registration, capacity and waitlist handling
- [x] typed booking intake form builder, public renderer and answer validation
- [ ] dynamic event registration form builder and renderer
- [ ] webinar stage roles, speaker profiles and landing-page builder
- [ ] notification templates, reminder jobs and delivery reconciliation
- [ ] durable attendance intervals and engagement event model

## Phase 4 — memory and AI

- [x] session artifact graph for recording, transcript, summary, chat, polls and Q&A
- [x] workspace memory list, detail page and database text search
- [x] transcript segment model with speaker/timestamp fields
- [x] reviewed summary, decision, action-item and citation model
- [x] recording-backed STT provider abstraction, worker, segment persistence and durable ready event
- [ ] streaming captions, diarization qualification and recordless transcription path
- [x] host transcript correction with immutable revision snapshots, audit/outbox events and review UI
- [ ] transcript language policy and revision restore/diff workflow
- [x] object-storage access, signed playback and secure download paths
- [ ] PostgreSQL full-text index and optional vector retrieval with workspace filters
- [x] provider-abstracted AI summary execution worker with decisions, actions and transcript citations
- [x] review-first AI agenda generator with host objective, bounded suggestions and explicit approval before persistence
- [x] reviewed summary/action editor with immutable revisions, reviewer metadata, audit/outbox events and explicit save
- [ ] follow-up approval and CRM write controls
- [ ] groundedness, privacy, prompt-injection, cost and latency evaluation suite

## Phase 5 — platform and enterprise

- [x] tenant-scoped API keys with one-time secret reveal, hashed storage, expiry/revocation, read/write scopes, RBAC inheritance and settings UI
- [x] webhook subscriptions, HMAC signatures, delivery retries, replay, SSRF-safe egress and transactional-outbox fanout
- [ ] provider integration framework, credential governance and SSRF-safe egress
- [ ] branding, email templates, custom domains and automated TLS
- [ ] analytics aggregation and governed exports
- [ ] plans, subscriptions, entitlements, seats, quota ledger and reconciliation
- [ ] SAML/OIDC enterprise SSO, SCIM, audit exports and retention policies
- [ ] localization, accessibility certification, regional cells and disaster-recovery qualification

A checkbox is marked complete only when a meaningful user path, persistence, authorization, validation and failure behavior exist. Provider qualification, scale evidence and operational recovery remain separate release gates even when the internal domain workflow is implemented.
