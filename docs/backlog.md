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
- [x] reactions and private direct-message channels with targeted realtime delivery
- [x] collaborative whiteboard with persisted operations, snapshots and automatic compaction
- [x] breakout assignment, assignment-aware media-room transition and host broadcast
- [x] HTTPS agenda content blocks, provider normalization and sandboxed embed resolver
- [x] upload quarantine, malware scan and signed downloads
- [x] recording, transcript and summary artifact state models
- [x] post-session artifact requests, audit evidence and retry controls
- [x] LiveKit egress orchestration and recording finalization worker
- [x] recording consent ledger, playback authorization, retention and deletion

## Phase 3 — scheduling and audience workflows

- [x] IANA timezone availability engine
- [x] lead time, buffers, overlap filtering and advisory-lock conflict control
- [x] booking-page CRUD, public slot selection and atomic reservation/session creation
- [x] booking self-service reschedule, cancellation and ICS calendar invites
- [x] booking reminder delivery and reconciliation
- [x] Google and Microsoft calendar OAuth and busy-time synchronization
- [x] webinar/event draft, publish and cancellation lifecycle
- [x] public event page, registration, capacity and waitlist handling
- [x] dynamic registration and intake form renderer
- [x] webinar stage roles and speaker profiles
- [x] visual webinar landing-page builder
- [x] notification templates, reminder jobs and delivery reconciliation
- [x] durable attendance intervals and engagement event model

## Phase 4 — memory and AI

- [x] session artifact graph for recording, transcript, summary, chat, polls and Q&A
- [x] workspace memory list, detail page and database text search
- [x] transcript segment model with speaker/timestamp fields
- [x] reviewed summary, decision, action-item and citation model
- [ ] streaming captions
- [x] ffmpeg media normalization, diarization-capable STT adapter, persisted quality metadata and optional diarization enforcement
- [ ] production diarization provider qualification evidence
- [x] transcript correction, revision history and language policy
- [x] object-storage access, signed playback and secure download paths
- [x] provider-abstracted post-session STT worker with bounded media ingestion and durable transcript segments
- [x] PostgreSQL full-text indexed Memory search with workspace filters and ranked transcript excerpts
- [x] optional pgvector transcript retrieval with workspace filters, async indexing, stale-version protection and lexical fallback
- [x] provider-abstracted agenda generator with explicit human review/apply
- [x] provider-abstracted post-session AI summary execution gateway
- [x] audited optimistic summary/action review editor
- [x] AI follow-up email and CRM-note drafts with explicit review, approval, stale-summary protection, idempotent execution and retry/cancel controls
- [x] versioned groundedness, action extraction, speaker attribution, privacy, prompt-injection, cost and latency evaluation suite with CI baseline and provider qualification runner

## Phase 5 — platform and enterprise

- [x] tenant-scoped API-key and webhook-subscription administration with encrypted signing secrets, audit evidence and outbox events
- [x] default-deny API-key bearer authentication with current-membership validation, supported scope catalog and read/write endpoint enforcement
- [x] HMAC webhook delivery worker with durable retries, dead-letter state, replay and reconciliation history
- [x] SSRF-safe pinned HTTPS webhook egress boundary with redirect blocking, timeout and bounded responses
- [x] tenant-scoped email/CRM provider connection vault with encrypted rotation, lifecycle, health evidence and SSRF-safe runtime egress
- [ ] OAuth connector consolidation and real-provider qualification
- [x] tenant-scoped branding profile, white-label settings and DNS-verified custom-domain control plane
- [x] TLS provisioning request handoff with explicit pending/active/error state
- [ ] automated TLS issuance/renewal and edge-router reconciliation
- [x] scheduled daily workspace analytics rollups with reconnect-safe attendance aggregation
- [x] role/scoped aggregate analytics API and audited CSV exports
- [x] plan catalog, workspace subscriptions, transactional seat enforcement, immutable usage ledger, quota reservations and reconciliation
- [x] webhook and AI external-action quota reservation/commit/release metering
- [ ] signature-verified billing-provider checkout/webhooks and recording/transcription/storage metering
- [ ] SAML/OIDC enterprise SSO, SCIM, audit exports and retention policies
- [ ] localization, accessibility certification, regional cells and disaster-recovery qualification

A checkbox is marked complete only when a meaningful user path, persistence, authorization, validation and failure behavior exist. Provider qualification, scale evidence and operational recovery remain separate release gates even when the internal domain workflow is implemented.
