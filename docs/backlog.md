# Delivery backlog

## Phase 1 — secure meeting foundation

- [x] Monorepo, local runtime, CI foundation
- [x] organizations/workspaces/users/memberships schema
- [x] JWT tenant context and forced PostgreSQL RLS
- [x] permanent-room CRUD with versioning
- [x] session create, schedule, update, start, end, cancel
- [x] interactive agenda create/reorder/activate API
- [x] agenda editor and realtime activation
- [x] LiveKit token issuance and browser meeting stage
- [x] audit events, idempotency records, transactional outbox
- [ ] production OIDC, invitations, role management, token revocation
- [ ] device preflight, host moderation, reconnect and media qualification

## Phase 2 — collaboration and reliable capture

- [ ] persistent chat and reactions
- [ ] polls, moderated Q&A, whiteboard integration
- [ ] breakout assignment and host broadcast
- [ ] content blocks and sandboxed embed resolver
- [ ] upload quarantine, malware scan, signed downloads
- [ ] LiveKit egress orchestration and recording state machine
- [ ] recording consent ledger, playback, retention and deletion

## Phase 3 — scheduling and audience workflows

- [ ] Google and Microsoft calendar OAuth
- [ ] availability engine, buffers, lead time, conflict locking
- [ ] booking pages, intake forms, reschedule and cancellation
- [ ] webinar roles and public event page builder
- [ ] custom registration forms, capacity/waitlist, reminders
- [ ] attendance and engagement event model

## Phase 4 — memory and AI

- [ ] streaming/post-call transcription abstraction and diarization
- [ ] transcript correction, language policy and captions
- [ ] memory artifact graph and full-text search
- [ ] optional vector retrieval with workspace filters
- [ ] agenda generator, summary, decisions, actions and follow-up draft
- [ ] human review, citations, provider policy, evaluation and cost controls

## Phase 5 — platform and enterprise

- [ ] API keys, webhook subscriptions, HMAC, retries, DLQ and replay
- [ ] provider integration framework and credential governance
- [ ] branding, email templates, custom domains and automated TLS
- [ ] analytics aggregation and governed exports
- [ ] plans, subscriptions, entitlements, seats, quota ledger and reconciliation
- [ ] SAML/OIDC enterprise SSO, SCIM, audit exports and retention policies
- [ ] localization, accessibility certification, regional cells and DR qualification

A checkbox is marked complete only when the user path, persistence, authorization, failure behavior, tests, and operational evidence exist. A model or UI placeholder alone does not satisfy completion.
