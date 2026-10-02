# Contributing

## Development rules

1. Keep every change tenant-scoped. A business query without explicit organization/workspace context is a security defect.
2. Preserve clean-room implementation: do not copy proprietary code, assets, copy, screenshots, or private behavior.
3. Add migrations for schema changes. Do not rely on `prisma db push` outside disposable development databases.
4. Use idempotency for externally retried commands and optimistic concurrency for updates.
5. Write an outbox event in the same database transaction as state changes that must be observed asynchronously.
6. Add audit events for administrative, security-sensitive, recording, export, and deletion operations.
7. Never mark a feature complete until persistence, authorization, validation, failure handling, tests, and observability are present.

## Commit messages

Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `build:`, or `chore:`.

## Pull and release gates

- Formatting, linting, type checking, tests, and builds must pass.
- Database migrations must support forward deployment and documented rollback/recovery.
- Security-sensitive changes require threat-model review.
- Media changes require Chrome, Edge, Firefox, Safari, packet-loss, reconnect, and multi-party checks before production release.
