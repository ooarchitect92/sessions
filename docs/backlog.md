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
- [ ] production OIDC/SAML, IdP logout, SCIM, rate limiting and identity-provider qualification
- [ ] device preflight, host moderation, reconnect and media qualification

## Phase 2 — collaboration and reliable capture

- [x] persistent public and host chat
- [x] poll creation, launch, answer, results and close lifecycle
- [x] moderated Q&A with voting and answers
- [ ] reactions and private direct-message channels
- [ ] whiteboard integration, snapshots and operation compaction
- [ ] breakout assignment, media-room transition and host broadcast
- [ ] content blocks and sandboxed embed resolver
- [ ] upload quarantine, malware scan and signed downloads
- [x] recording, transcript and summary artifact state models
- [x] post-session artifact requests, audit evidence and retry controls
- [ ] LiveKit egress orchestration and recording finalization worker
- [ ] recording consent ledger, playback authorization, retention and deletion

## Phase 3 — scheduling and audience workflows

- [x] IANA timezone availability engine
- [x] lead time, buffers, overlap filtering and advisory-lock conflict control
- [x] booking-page CRUD, public slot selection and atomic reservation/session creation
- [ ] booking reschedule, cancellation, ICS and reminder delivery
- [ ] Google and Microsoft calendar OAuth and busy-time synchronization
- [x] webinar/event draft, publish and cancellation lifecycle
- [x] public event page, registration, capacity and waitlist handling
- [ ] dynamic registration and intake form renderer
- [ ] webinar stage roles, speaker profiles and landing-page builder
- [ ] notification templates, reminder jobs and delivery reconciliation
- [ ] durable attendance intervals and engagement event model

## Phase 4 — memory and AI

- [x] session artifact graph for recording, transcript, summary, chat, polls and Q&A
- [x] workspace memory list, detail page and database text search
- [x] transcript segment model with speaker/timestamp fields
- [x] reviewed summary, decision, action-item and citation model
- [ ] recording/STT workers, streaming captions and diarization qualification
- [ ] transcript correction, revision history and language policy
- [ ] object-storage access, signed playback and secure download paths
- [ ] PostgreSQL full-text index and optional vector retrieval with workspace filters
- [ ] agenda generator and provider-abstracted AI execution gateway
- [ ] summary/action editor, follow-up approval and CRM write controls
- [ ] groundedness, privacy, prompt-injection, cost and latency evaluation suite

## Phase 5 — platform and enterprise

- [ ] API keys, webhook subscriptions, HMAC signatures, replay and reconciliation
- [ ] provider integration framework, credential governance and SSRF-safe egress
- [ ] branding, email templates, custom domains and automated TLS
- [ ] analytics aggregation and governed exports
- [ ] plans, subscriptions, entitlements, seats, quota ledger and reconciliation
- [ ] SAML/OIDC enterprise SSO, SCIM, audit exports and retention policies
- [ ] localization, accessibility certification, regional cells and disaster-recovery qualification

A checkbox is marked complete only when a meaningful user path, persistence, authorization, validation and failure behavior exist. Provider qualification, scale evidence and operational recovery remain separate release gates even when the internal domain workflow is implemented.
