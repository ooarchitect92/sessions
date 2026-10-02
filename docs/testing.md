# Testing and qualification strategy

## Test layers

- **Unit:** state machines, availability calculations, quota reservations, authorization decisions, prompt output parsers.
- **Contract:** request/response schemas, provider adapters, webhook signatures, realtime event versions.
- **Integration:** PostgreSQL RLS, migrations, outbox claiming, Redis fan-out, object storage, LiveKit token grants.
- **End-to-end:** create and schedule session, join media, activate agenda, record, process transcript, review memory, share or delete.
- **Media:** multiple simulated publishers/subscribers, packet loss, bandwidth changes, reconnects, device changes, screenshare, browser backgrounding.
- **Load:** API commands, WebSocket connections, webinar fan-out, recording workers, notification bursts, search and analytics queries.
- **Security:** cross-tenant access, broken object authorization, XSS/CSP, file upload, OAuth state, SSRF/egress, webhook replay, secret scanning.
- **Accessibility:** keyboard path, focus management, captions, contrast, screen-reader labels, reduced motion.
- **Compatibility:** current Chrome, Edge, Firefox, Safari, responsive web, and supported mobile browsers.

## Required CI gates

1. Formatting, lint, typecheck, unit and contract tests.
2. Prisma client generation and migration smoke test against PostgreSQL.
3. Production builds for backend, product application, public website, and shared contracts.
4. Dependency and container vulnerability checks.
5. Secret detection and software-bill-of-materials generation.
6. Preview environment E2E before protected production promotion.

## Tenant isolation suite

Every tenant-owned model must pass reusable tests proving:

- no read, update, delete, relation traversal, count, aggregate, or raw-query leakage;
- inserts cannot forge another organization/workspace;
- background workers use a separately controlled role;
- object keys, caches, realtime rooms, analytics, and search indexes include tenant scope;
- error messages do not reveal whether a resource exists in another tenant.

## AI quality suite

AI features ship only with versioned datasets and measurable checks for groundedness, action-item extraction, speaker attribution, refusal behavior, PII policy, prompt injection, and cost/latency. User edits and rejected suggestions become evaluation signals, not automatic training consent.
