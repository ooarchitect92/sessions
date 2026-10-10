# Sessions full-architecture delivery map (research-to-repository)

This document tracks the clean-room Sessions-like product requirements against the current `main` implementation. It is an implementation checklist, **not** a claim that open pull requests or external providers are production-qualified. The source brief is `Deep Research & Implementation Plan for Sessions-Like Platform` (25 pages, supplied 2026-10-10). The baseline is `docs/implementation-status.md` and `docs/backlog.md` on `main` at `4213c6fe7f7a4caab271f24e8bc2033442999e92`.

## Architecture contract — preserve the current pipeline

- Retain npm workspace packages `backend`, `frontend`, `website`, `packages/contracts`, and `infra`.
- Retain modular NestJS/Fastify backend, React/Vite clients, PostgreSQL/Prisma with forced tenant RLS, Redis, transactional outbox and independently scalable workers.
- Retain LiveKit SFU and egress plus TURN/media network topology; keep private object storage and presigned object grants.
- Preserve REST `/v1` contracts, Socket.IO event versioning, tenant authorization, optimistic concurrency, durable retries and idempotency.
- Implement clean-room product behavior; do not copy legacy Sessions source, assets or copyrighted UI.

## Delivery matrix

| Feature group in source brief | Main-branch status | Next verifiable acceptance gate |
| --- | --- | --- |
| Identity, organization/workspaces, RBAC and MFA | Foundation | Production IdP qualification, rate limits, end-to-end cross-tenant isolation |
| Session lifecycle, permanent meeting rooms | Implemented | Multi-browser lifecycle and concurrent-state regression |
| Live video, screen share, host controls | Foundation | Device preflight, moderation, SFU/TURN load and recovery tests |
| Time-boxed interactive agenda and templates | Foundation | Host-driven timer/navigation, cross-client synchronization and template workflow tests |
| Sandboxed embeds, co-browsing | Foundation | Explicit remote-control grants and malicious-URL security qualification |
| Chat, polls, Q&A, whiteboard, breakout rooms | Foundation | Larger-room reconciliation, participant transitions, exports and access tests |
| Webinar/event pages and registrations | Foundation | External presenter admission, scaled fan-out and notification-provider qualification |
| Booking pages, Google/Microsoft busy time, ICS and reminders | Foundation | Provider write-back, webhook reconciliation, DST and conflict regression |
| Recording, storage, playback, retention and consent | Foundation | Multi-node egress qualification, recording webhook reconciliation and restore drills |
| STT, diarization, corrections and live captions | Foundation; captions PR #54 open | Merge and qualify captions, production STT accuracy and user-consent behavior |
| AI agendas, summaries, follow-ups and Memory | Foundation | Real provider evaluation, grounded citations, human approval and privacy gate |
| API keys, HMAC webhooks, provider credentials | Not on main; PRs #48/#52 open | Select non-overlapping implementation, validate scopes/SSRF/retries and merge |
| Branding, custom domains and email templates | Not on main; stacked PRs #49/#50 open | Land dependencies, TLS automation, template inheritance and delivery checks |
| Workspace analytics and exports | Partial session/event metrics | Build aggregated authorized dashboards and audited exports |
| Plans, subscriptions, entitlements and quotas | Planned on main | Verified payment provider events, seat and usage enforcement, billing reconciliation |
| Enterprise OIDC/SAML, SCIM, retention/privacy | Planned on main; PR #43 open | Rebase/deconflict, verify external IdP and enterprise control paths |
| Localization and accessibility | Planned | Translation infrastructure, keyboard/screen-reader checks and supported-locale regression |
| Production launch operations | Partial Docker/CI deployment baseline | Secret scanning, dependency/container checks, deploy gates, telemetry, backups, DR and live media soak tests |

## Order of implementation

1. **Stabilize the baseline.** Keep application files untouched during CI fixes; run lockfile, typecheck, unit tests, AI evaluations, builds and database migration smoke. Track pre-existing formatting debt separately rather than silently rewriting source in CI.
2. **Land parallel work safely.** Review PR #54 (live captions) and mutually overlapping platform PRs #43/#48/#52. Merge one canonical control plane, then rebase stacked branding (#49) and email templates (#50) only after their dependencies are resolved. Do not cherry-pick overlapping schemas blindly.
3. **Finish end-to-end media/realtime workflows.** Prove browser device handling, permissioned host actions, media recovery, recording consent and transcription/caption behavior with multiple browsers.
4. **Finish customer-facing scheduling, webinar, email and branding flows.** Verify provider auth, full booking lifecycle, public form abuse handling, custom-domain TLS and production email templating.
5. **Finish platform governance.** Enterprise identity, quota/billing reconciliation, observability, analytics, privacy and regional/compliance controls.
6. **Production qualification.** Verify real providers, security tests, tenant isolation, scale, rollback, backup/restore, disaster recovery and operational ownership before claiming a market-ready release.

## Release rule

No feature is marked production-ready merely because a migration, UI or endpoint exists. A release requires authorization, validation, negative-path tests, provider failure handling, auditability, operational telemetry and a repeatable CI/deployment gate. Feature scope and sequencing come from the research brief; implementation evidence comes from repository code and green checks.
