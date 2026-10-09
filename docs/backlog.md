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
- [ ] streaming captions, media normalization and diarization qualification
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

- [x] workspace API key management, bearer authentication, scopes, rate limiting, webhook subscriptions, HMAC signatures, durable delivery history, retries and dead-letter handling
- [x] webhook replay/reconciliation controls
- [ ] production webhook delivery qualification and pinned-egress hardening
- [ ] provider integration framework, credential governance and pinned/egress-proxy SSRF-safe delivery
- [x] workspace branding editor with persisted logo/colors/font/waiting-room identity, server validation, propagation to public event/booking surfaces, and live meeting/waiting-room theming
- [x] custom-domain control plane with tenant-scoped persistence, CNAME/TXT ownership verification and TLS-pending lifecycle
- [x] workspace email-template editor with versioned event/booking reminder defaults, variable validation, signature support, and worker rendering
- [x] branded HTML email rendering with workspace logo/colors and escaped text fallback
- [ ] provider-backed automated TLS issuance/routing
- [x] workspace analytics aggregation with attendance, engagement, event-registration and booking metrics plus audited CSV exports
- [x] plan catalog, workspace subscriptions, server-side entitlements, seat/resource quota enforcement and idempotent usage ledger
- [ ] payment-provider checkout/webhooks, invoice lifecycle and subscription reconciliation
- [x] enterprise identity control plane with encrypted OIDC configuration, allowed-domain policy, SCIM 2.0 bearer tokens and workspace provisioning/deprovisioning
- [x] governed workspace audit CSV export and retention-policy administration with legal-hold-aware recording defaults
- [x] generic OIDC authorization-code login with state, nonce, PKCE, RS256/JWKS validation, allowed-domain policy, JIT workspace membership and SSO-only local-login enforcement
- [x] OIDC claim/group-to-workspace-role mapping with safe defaults, OWNER exclusion, session provider tracking and provider-aware IdP logout redirects
- [ ] SAML assertion login, real-provider OIDC qualification and lifecycle-worker enforcement for transcript/audit retention
- [ ] localization, accessibility certification, regional cells and disaster-recovery qualification

A checkbox is marked complete only when a meaningful user path, persistence, authorization, validation and failure behavior exist. Provider qualification, scale evidence and operational recovery remain separate release gates even when the internal domain workflow is implemented.
