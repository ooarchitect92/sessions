# Product scope and parity map

This repository is an independent, clean-room implementation of the product category described in the research plan. It does not reuse proprietary code, assets, copy, or private behavior. Every capability below has an explicit delivery state; architectural intent is not counted as implementation.

## Product pillars

1. **Live meeting workspace** — WebRTC audio/video, screen sharing, participant controls, secure rooms, and webinar stage roles.
2. **Interactive run of show** — time-boxed agenda items that can activate content, polls, whiteboards, Q&A, breakouts, and demonstrations for everyone.
3. **Scheduling and acquisition** — calendar-connected booking pages, public event pages, custom registration forms, reminders, and attendance handling.
4. **Meeting memory** — recordings, transcripts, chat, poll results, agenda markers, summaries, decisions, actions, search, and governed sharing.
5. **Workspace platform** — multi-tenant organizations, reusable rooms, branding, domains, teams, roles, API keys, webhooks, integrations, analytics, quotas, and billing.

## Delivery matrix

| Domain | Target capability | Current state | Completion gate |
|---|---|---|---|
| Identity | Email/password, MFA, OIDC, SAML, session management | Development JWT boundary | Production identity provider, recovery, step-up authentication, session revocation |
| Tenancy | Organizations, workspaces, memberships, RBAC, RLS | Foundation implemented | Invitations, role management UI, policy tests, cross-tenant penetration tests |
| Meetings | Create, schedule, start, end, cancel, recurring sessions | Core lifecycle implemented | Recurrence, invite delivery, cancellation policy, calendar reconciliation |
| Rooms | Permanent URLs and reusable defaults | CRUD implemented | Branding, intro media, host assignment, access rules, public join page |
| Agenda | Create, order, activate time-boxed items | Core editor and realtime activation implemented | drag/drop, templates, rich content editor, timers, presenter controls |
| Media | Camera, microphone, screenshare, layouts, reactions | LiveKit stage foundation | device preflight, moderation, reconnection qualification, regional scale tests |
| Collaboration | chat, polls, Q&A, whiteboard, reactions, breakouts | Planned | durable models, authorization, realtime protocol, moderation, E2E tests |
| Content | files, embeds, slides, video, websites, co-browsing | Planned | resolver, allow-list, CSP, malware scan, OAuth, explicit remote-control consent |
| Events | webinar roles, event pages, registration and reminders | Planned | public renderer, registration schema, capacity, reminders, attendance import |
| Bookings | availability, booking links, intake forms, buffers | Planned | timezone engine, calendar OAuth, conflict locking, reschedule/cancel workflow |
| Recording | composite/track recording, HLS/MP4, retention | Planned | egress worker, artifact state machine, encryption, consent, playback and deletion |
| Transcript | live captions, post-call STT, diarization | Planned | provider abstraction, streaming gateway, correction UI, language policy |
| AI | agenda drafts, summaries, decisions, actions, follow-up | Planned | opt-in jobs, provider policy, citations, human review, evaluation suite |
| Memory | searchable session library and governed shares | Planned | artifact graph, full-text/vector search, expiry, exports, retention |
| Analytics | attendance, engagement, usage and conversion | Planned | event taxonomy, privacy review, aggregation jobs, dashboards |
| Integrations | Google/Microsoft, Slack, CRM, Drive, Notion, Miro, Figma | Planned | credential vault, OAuth lifecycle, provider adapters, egress policy |
| API/webhooks | REST API, API keys, signed event delivery | Outbox foundation | scoped keys, webhook subscriptions, HMAC, retry/DLQ/replay, docs |
| Branding | logos, themes, emails, custom domains, locales | Planned | verified domains, automated TLS, safe token system, localization pipeline |
| Commercial | plans, seats, usage, quotas, billing | Planned | ledger, reservations, verified billing webhooks, reconciliation |
| Enterprise | SCIM, audit export, retention policies, data residency | Planned | control plane, policy engine, regional topology, compliance evidence |

## Roles

- **Organization owner:** commercial account, organization policy, workspace creation, billing, security configuration.
- **Workspace admin:** team, branding, integrations, domains, templates, retention, API access.
- **Host:** creates and facilitates meetings, controls media, agenda, recording, polls, breakouts, and sharing.
- **Member:** collaborates, creates permitted resources, joins sessions, accesses authorized memory.
- **Analyst:** read-only access to authorized analytics and artifacts.
- **Guest/attendee:** narrowly scoped access to a specific session or public event registration.

## Non-negotiable product rules

- Recording and transcription require visible disclosure and policy-driven consent.
- AI outputs are suggestions, are visibly labeled, and remain editable before external use.
- A participant never gains remote-control or co-browsing authority without explicit, revocable permission.
- Tenant identity comes from verified authentication claims, never from caller-controlled tenant headers.
- Every destructive or externally visible workflow has audit evidence, idempotency, and recovery behavior.
