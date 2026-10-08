# Testing and qualification strategy

## Test layers

- **Unit:** state machines, availability calculations, password hashing, opaque-token digests, TOTP vectors, recovery-code handling, quota reservations, authorization decisions, and prompt output parsers.
- **Contract:** request/response schemas, provider adapters, webhook signatures, realtime event versions.
- **Integration:** PostgreSQL RLS, migrations, signup/login, refresh rotation and reuse detection, MFA challenge limits, invitation races, owner-preservation rules, outbox claiming, Redis fan-out, object storage, and LiveKit token grants.
- **End-to-end:** create and schedule session, join media, activate agenda, record, process transcript, review memory, share or delete.
- **Media:** multiple simulated publishers/subscribers, packet loss, bandwidth changes, reconnects, device changes, screenshare, browser backgrounding.
- **Load:** API commands, WebSocket connections, webinar fan-out, recording workers, notification bursts, search and analytics queries.
- **Security:** cross-tenant access, broken object authorization, account enumeration, password lockout, refresh replay, MFA recovery-code reuse, invitation replay, XSS/CSP, file upload, OAuth state, SSRF/egress, webhook replay, and secret scanning.
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

The repository includes a deterministic versioned baseline dataset under `backend/src/ai/evaluation`. `npm run ai:eval` is a required CI gate and fails when any baseline case violates its quality or safety expectations. The suite checks required/forbidden factual claims, expected action-item recall, action-owner attribution, prompt-injection canaries, forbidden sensitive values, per-case latency budgets, and estimated cost budgets.

Real-provider qualification is separate from the deterministic CI gate. Configure a non-mock AI provider plus `AI_EVAL_INPUT_USD_PER_MILLION` and `AI_EVAL_OUTPUT_USD_PER_MILLION`, then run `npm run ai:eval:provider`. That command evaluates the same versioned dataset against the configured provider, measures wall-clock latency, estimates spend, emits a JSON report, and exits non-zero if thresholds fail. A mock provider is intentionally rejected by the provider-qualification command so local deterministic behavior cannot be mistaken for production evidence.
