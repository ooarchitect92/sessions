# Implementation status

Status meanings:

- **Implemented:** code, persistence, authorization boundary, and a runnable path exist in this repository.
- **Foundation:** contracts, schema, authorization, and a meaningful user path exist, but provider integration or production qualification is not finished.
- **Planned:** documented target with no claim of implementation.

| Capability                        | Status      | Current evidence / next completion gate |
| --------------------------------- | ----------- | --------------------------------------- |
| Monorepo, local runtime, CI       | Implemented | npm workspaces, Docker Compose, migration smoke test, quality workflow, docs |
| Organization/workspace tenancy    | Foundation  | organization/workspace CRUD, membership directory, invitations, owner-preservation rules, role changes, workspace switching, separate database roles and forced RLS; org deletion, quotas and enterprise policy remain |
| Local identity and account security | Foundation | email/password signup/login, optional email verification, lockout, password reset/change, short-lived JWTs, rotating refresh-token families, session revocation, TOTP MFA, encrypted secrets and recovery codes; rate limiting, email provider qualification and external IdP remain |
| Session CRUD and lifecycle        | Implemented | idempotent create, list/get/update, schedule/start/end/cancel, audit and outbox |
| Interactive agenda                | Foundation  | create/reorder/activate API, inline editor and realtime broadcast; templates, timers, rich content and drag/drop remain |
| WebRTC meeting stage              | Foundation  | LiveKit token endpoint, React meeting component and recording-consent gate; device preflight, moderation, TURN/SFU scale qualification and multi-region media operations remain |
| Reusable permanent rooms          | Implemented | tenant-scoped create/list/read/update/delete API plus product UI; branding, public join pages and advanced access rules remain |
| Presence and durable chat         | Foundation  | authenticated session rooms, participant events, persisted public/host chat and realtime invalidation; attendance intervals and reactions remain |
| Polls and moderated Q&A           | Foundation  | persisted polls/options/answers, launch/close/results, questions/votes/moderation and meeting UI; richer poll types, exports and webinar qualification remain |
| Whiteboard and breakouts          | Planned     | collaborative canvas, snapshots, assignments, host broadcast and media-room transitions |
| Recording and playback            | Foundation  | participant consent ledger and enforced join gate, LiveKit room-composite egress worker, S3-compatible finalization, short-lived signed playback/download grants, retention expiry, governed deletion and provider-aware retry exist; multi-node egress/load qualification, provider webhook reconciliation, observability and disaster recovery remain |
| Transcription and captions        | Foundation  | transcript/segment models, post-session request/retry path, private recording download, provider-abstracted HTTP STT worker, normalized timestamp/speaker segments, transcript-ready events, versioned segment correction UI, audit-backed revision history and PostgreSQL full-text search exist; audio extraction optimization, streaming captions and diarization/provider qualification remain |
| AI agendas, summaries and actions | Foundation  | provider-abstracted AI gateway, review-first agenda drafting/apply flow, summary/decision/action/citation model, opt-in post-session summary worker, grounded segment citations, durable AI events and review-oriented UI exist; agenda provider qualification, summary editing/approval, follow-up execution controls and evaluation remain |
| Booking pages and scheduling      | Foundation  | booking page CRUD, IANA timezone rules, lead time, buffers, slot generation, advisory locking, atomic reservation/session creation and public booking UI; calendar OAuth, busy-time sync, reschedule/cancel and ICS remain |
| Webinars and event registration   | Foundation  | event CRUD, publish-to-webinar transition, public event page, registration, capacity/waitlist and registration administration; speaker builder, reminders, roles and attendance analytics remain |
| Memory library and search         | Foundation  | artifact graph, workspace list, title search, indexed PostgreSQL transcript full-text search, detail page, chat/poll/Q&A context, transcript correction history, authorized recording playback/download, retention visibility and failed-job retry; semantic/vector retrieval, shares and export packages remain |
| Public event and booking journeys | Foundation  | original public web UI backed by unauthenticated, narrowly scoped API routes; custom domains, dynamic form renderer, reminder delivery and abuse controls remain |
| Webhooks and integrations         | Foundation  | transactional outbox, Redis stream relay, bounded retries and dead-letter state; endpoint management, signatures, replay and OAuth connectors remain |
| Analytics                         | Planned     | attendance event model, privacy review, aggregation jobs, dashboards and governed exports |
| Branding, custom domains and i18n | Planned     | domain verification, TLS, theme tokens, email rendering and localization pipeline |
| Billing and quotas                | Planned     | plan catalog, usage ledger, reservations, verified provider webhooks and reconciliation |
| Enterprise SSO, SCIM and admin    | Planned     | OIDC/SAML redirects and callbacks, claims mapping, SCIM provisioning, step-up policy, IdP logout, audit exports and provider qualification |
| Mobile and desktop applications   | Planned     | deferred until responsive web and media reliability are proven |

No provider-dependent workflow is marked production-ready until credentials, failure handling, reconciliation, observability, load testing and operational recovery have been exercised outside the local development stack.
