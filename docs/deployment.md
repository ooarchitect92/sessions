# Deployment profiles

The codebase supports incremental operations: a developer can run the services directly, run only dependencies in Docker, or run the complete local stack with Compose. Production does not require Kubernetes on day one.

## Profile A — direct development

Run PostgreSQL, Redis, LiveKit, and MinIO from installed services or managed development instances. Then run the Node applications directly:

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Profile B — hybrid development

Run dependencies in containers and applications with hot reload:

```bash
docker compose up -d postgres redis minio minio-create-bucket livekit
npm run db:migrate
npm run db:seed
npm run dev
```

## Profile C — complete local Compose

```bash
cp .env.example .env
docker compose up --build
```

Compose builds the API image, applies migrations, seeds the deterministic local workspace, then starts the API, product application, and public website.

## Initial production topology

- CDN/WAF in front of public website and application assets.
- Load balancer routing API and WebSocket traffic to stateless API replicas.
- Separate worker service for outbox, notifications, recording finalization, transcription, AI, retention, and webhook delivery.
- Managed PostgreSQL with point-in-time recovery, separate API and worker roles, forced RLS, and migration credentials kept separate.
- Managed Redis configured for availability rather than as a system of record.
- S3-compatible object storage with encryption, lifecycle rules, malware quarantine, and signed downloads.
- LiveKit SFU nodes plus embedded or regional TURN; recording/egress workers isolated from API capacity.
- Central logs, metrics, traces, alerting, error tracking, and synthetic meeting checks.

## Scale path

1. Scale stateless API/worker replicas independently.
2. Separate WebSocket gateway from HTTP API when connection volume requires it.
3. Partition media capacity by region and route sessions to a home region.
4. Introduce queues per workload class so transcription or AI cannot starve reminders or webhooks.
5. Move high-volume domains into services only after measured coupling or scaling pressure justifies the operational cost.
6. Add regional data cells for residency and blast-radius control while keeping a narrow global control plane.

## Release and recovery requirements

- Expand/migrate/contract database changes; no destructive schema change in the same release that stops old code.
- Immutable images, signed provenance, vulnerability scanning, and environment-specific promotion.
- Automated rollback for application code; forward-fix or reversible migration plan for data changes.
- Daily restore verification, quarterly regional recovery exercises, and documented RPO/RTO.
- Feature flags for risky media, AI, and provider workflows; kill switches are audited.
