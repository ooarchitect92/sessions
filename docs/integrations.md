# Integrations control plane

Phase 5 begins with a tenant-scoped control plane for API keys and outbound webhook subscriptions.

## API keys

- Owner/admin only administration.
- A generated key is returned exactly once at creation time.
- Only a SHA-256 digest and short non-secret prefix are persisted.
- Keys can carry explicit scopes, optional expiration, last-used metadata and durable revocation state.
- Creation/revocation emits audit and transactional-outbox evidence.

## Webhook subscriptions

- Owner/admin only administration.
- HTTPS endpoint is mandatory and URL-embedded credentials are rejected.
- Each subscription carries an explicit event allow-list.
- A 256-bit signing secret is generated once and encrypted at rest with the existing AES-256-GCM sensitive-value boundary.
- Raw signing secrets are returned only at creation time and never included in list responses.
- Creation/deletion emits audit and transactional-outbox evidence.

The included HMAC helper defines the delivery signature as SHA-256 HMAC over `<unixTimestamp>.<rawBody>`. The durable delivery worker, SSRF-safe DNS/IP egress checks, retry/replay history and endpoint reconciliation are the next Phase 5 slice; this control-plane increment does not claim those delivery concerns are production complete.
