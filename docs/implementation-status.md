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
| Interactive agenda                | Foundation  | create/reorder/activate API, inline editor, realtime broadcast, validated HTTPS website/presentation/video content, shared text notes, sandboxed meeting-stage embeds and workspace-scoped reusable agenda templates now exist; timers, native file viewers, provider OAuth embeds, drag/drop and consented co-browsing remain |
| WebRTC meeting stage              | Foundation  | LiveKit token endpoint, React meeting component and recording-consent gate; device preflight, moderation, TURN/SFU scale qualification and multi-region media operations remain |
| Reusable permanent rooms          | Implemented | tenant-scoped create/list/read/update/delete API plus product UI; branding, public join pages and advanced access rules remain |
| Presence and durable chat         | Foundation  | authenticated session rooms, participant events, persisted public/host/private chat, user-targeted realtime delivery for restricted channels, live emoji reactions and raise/lower-hand signals now exist; durable attendance intervals, richer presence state and moderation policy controls remain |
| Polls and moderated Q&A           | Foundation  | persisted polls/options/answers, launch/close/results, questions/votes/moderation and meeting UI; richer poll types, exports and webinar qualification remain |
| Whiteboard and breakouts          | Foundation  | breakout rooms have tenant-scoped persistence/RLS, assignments, lifecycle, broadcasts and LiveKit subroom tokens; whiteboard now has tenant-scoped documents/operations, pen/shape/text/sticky/image tools, realtime operation refresh, meeting-stage agenda rendering, host snapshots and compaction; live cursors, undo/redo, durable breakout attendance, forced migration and scale qualification remain |
| Recording and playback            | Foundation  | participant consent ledger and enforced join gate, LiveKit room-composite egress worker, S3-compatible finalization, short-lived signed playback/download grants, retention expiry, governed deletion and provider-aware retry exist; multi-node egress/load qualification, provider webhook reconciliation, observability and disaster recovery remain |
| Transcription and captions        | Foundation  | transcript/segment models, post-session request/retry path, private recording download, provider-abstracted HTTP STT worker, normalized timestamp/speaker segments, live browser microphone chunk capture, tenant-authorized live transcription ingestion, realtime caption broadcast, transcript-ready events, versioned segment correction UI, audit-backed revision history and PostgreSQL full-text search exist; provider-native streaming STT, audio extraction optimization, advanced diarization and provider qualification remain |
| AI agendas, summaries and actions | Foundation  | provider-abstracted AI gateway, review-first agenda drafting/apply flow, summary/decision/action/citation model, opt-in post-session summary worker, grounded segment citations, versioned human summary editing/approval, structured action-item editing, review-first AI follow-up drafting/approval, explicitly approved outbound email queue, durable AI/notification events and review-oriented UI exist; CRM execution controls, provider qualification and evaluation remain |
| Booking pages and scheduling      | Foundation  | booking page CRUD, typed custom intake-form builder and renderer, server-side answer validation, IANA timezone rules, lead time, buffers, slot generation, advisory locking, atomic reservation/session creation, host-side reservation reschedule/cancel with optimistic versions, linked-session synchronization, ICS generation, Google/Microsoft OAuth connections, encrypted provider tokens, refresh-token rotation, external free/busy filtering, durable provider event create/update/cancel reconciliation with retries, transactional confirmation/reschedule/cancellation emails and 24h/1h reminders, and secure invitee self-service view/reschedule/cancel with hashed expiring management tokens now exist; provider webhook reconciliation remains |
| Webinars and event registration   | Foundation  | event CRUD, publish-to-webinar transition, public event page, typed custom registration-form builder and renderer, server-side answer validation, registration, capacity/waitlist, registration administration, registration/waitlist confirmations and 24h/1h reminder scheduling now exist; speaker builder, presenter roles and deeper attendance analytics remain |
| Memory library and search         | Foundation  | artifact graph, workspace list, title search, indexed PostgreSQL transcript full-text search, detail page, chat/poll/Q&A context, transcript correction history, authorized recording playback/download, retention visibility and failed-job retry; semantic/vector retrieval, shares and export packages remain |
| Public event and booking journeys | Foundation  | original public web UI backed by unauthenticated, narrowly scoped API routes plus typed dynamic booking/event forms, confirmation/reminder delivery scheduling and token-protected invitee booking view/reschedule/cancel; custom domains and abuse controls remain |
| Webhooks and integrations         | Foundation  | workspace-scoped API keys with hashed secrets/read-write scopes, transactional outbox, Redis stream relay, webhook endpoint management, encrypted signing secrets, HMAC-SHA256 delivery signatures, bounded retries, manual replay, delivery history, provider-neutral outbound email worker, and Google/Microsoft Calendar OAuth connector foundations exist; Drive/CRM connectors and production reconciliation qualification remain |
| Analytics                         | Foundation  | tenant-scoped workspace/session aggregation API and responsive dashboard now cover session volume, meeting hours, registrations, bookings, collaboration engagement and artifact readiness; durable attendance intervals, page-view conversion events, privacy review and governed exports remain |
| Branding, custom domains and i18n | Planned     | domain verification, TLS, theme tokens, email rendering and localization pipeline |
| Billing and quotas                | Planned     | plan catalog, usage ledger, reservations, verified provider webhooks and reconciliation |
| Enterprise SSO, SCIM and admin    | Planned     | OIDC/SAML redirects and callbacks, claims mapping, SCIM provisioning, step-up policy, IdP logout, audit exports and provider qualification |
| Mobile and desktop applications   | Planned     | deferred until responsive web and media reliability are proven |

No provider-dependent workflow is marked production-ready until credentials, failure handling, reconciliation, observability, load testing and operational recovery have been exercised outside the local development stack.


### Workspace public branding increment
- owner/admin workspace settings now include a public-brand identity editor with live preview
- validated brand name, HTTPS logo, primary/accent colors, allow-listed fonts and waiting-room hero image
- optional removal of Sessions attribution on public booking/event pages
- booking and event public APIs now expose normalized workspace branding
- event-level branding safely layers over workspace defaults
- public booking/event pages consume theme variables without changing scheduling or registration behavior
- unsafe URL/color/font values are rejected server-side, with focused unit coverage
- custom-domain DNS/TLS provisioning and email-template branding remain separate infrastructure increments


### Workspace email-template increment
- owner/admin settings now include a dedicated lifecycle email-template editor
- booking confirmation, reschedule, cancellation and 24h/1h reminder templates
- event confirmation, waitlist and 24h/1h reminder templates
- global workspace email signature with safe placeholder interpolation
- server-side validation for known purposes, bounded subject/body sizes and allow-listed placeholders
- scheduler resolves templates transactionally when EmailDelivery rows are created
- queued messages keep their rendered subject/body even if templates are later changed
- brand name from workspace branding is available as a template variable
- defaults remain in place for every message type when no custom override is configured
- focused validation/rendering unit tests added


### Webinar presenter-role increment
- tenant-scoped EventPresenter model with forced PostgreSQL RLS
- explicit ORGANIZER, HOST, CO_HOST and SPEAKER roles
- event creator automatically becomes the protected organizer
- host-side presenter create/update/delete/list APIs with audit and outbox events
- presenter identity links to an existing workspace member when the email matches
- host UI for managing webinar presenter teams and role changes
- public event pages now show presenter/speaker profiles without exposing private email/user identifiers
- LiveKit webinar grants now distinguish moderator roles, speaker publishing rights and attendee subscribe-only behavior
- organizer/host/co-host receive room-admin rights; speakers can publish without moderation rights
- guest registration-to-authenticated attendee admission and large-audience broadcast qualification remain separate follow-on work
