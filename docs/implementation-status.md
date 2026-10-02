# Implementation status

Status meanings:

- **Implemented:** code, persistence, authorization boundary, and a runnable path exist in this repository.
- **Foundation:** contracts/schema/module boundary exist, but the complete user workflow or production qualification is not finished.
- **Planned:** documented target with no claim of implementation.

| Capability | Status | Current evidence / next completion gate |
|---|---|---|
| Monorepo, local runtime, CI | Implemented | npm workspaces, Docker Compose, CI workflow, docs |
| Organization/workspace tenancy | Implemented foundation | schema, JWT tenant claims, forced RLS; invitations/admin UI remain |
| Session CRUD and lifecycle | Implemented | idempotent create, list/get/update, start/end, audit/outbox |
| Interactive agenda | Implemented foundation | create/reorder/activate API, inline editor, and real-time broadcast; templates, timers, rich content, and drag/drop remain |
| WebRTC meeting stage | Implemented foundation | LiveKit token endpoint and React meeting component; egress and scale qualification remain |
| Reusable permanent rooms | Implemented | tenant-scoped create/list/read/update/delete API plus product UI; branding, public join pages, and access rules remain |
| Real-time presence | Foundation | authenticated gateway and session rooms; durable chat/polls/Q&A next |
| Recording and playback | Planned | LiveKit egress worker, object metadata, consent, retention, playback |
| Transcription/captions | Planned | provider abstraction, streaming/post-call STT, diarization, correction UI |
| AI agendas/summaries/actions | Planned | opt-in provider gateway, asynchronous workflows, review/edit UI |
| Booking pages/calendar sync | Planned | availability engine, OAuth connectors, conflict handling, ICS |
| Webinars/event registration | Planned | public pages, roles, forms, reminders, attendance analytics |
| Memory library/search | Planned | recording/transcript artifacts, indexed search, share controls |
| Polls, whiteboard, Q&A, breakouts | Planned | persistent models, authorization, real-time state, UX |
| Webhooks/integrations | Foundation | durable outbox exists; endpoint management/signing/retries next |
| Analytics | Planned | event model, aggregation, dashboards, privacy controls |
| Branding/custom domains/i18n | Planned | domain verification, TLS, theme tokens, localization pipeline |
| Billing and quotas | Planned | plan catalog, usage ledger, reservations, verified provider webhooks |
| Enterprise SSO/SCIM/admin | Planned | OIDC/SAML, provisioning, policy controls, step-up, audit exports |
| Mobile/desktop applications | Planned | deferred until responsive web and media reliability are proven |
