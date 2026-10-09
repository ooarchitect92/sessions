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


## Durable delivery and replay

Published transactional-outbox events are materialized into one durable delivery per matching enabled webhook subscription. Delivery rows retain the immutable event envelope, attempt count, retry schedule, response status/body snippet, terminal error, replay count and delivery timestamp.

The worker follows the repository's existing reliable-delivery pattern:

1. recover stale `SENDING` claims;
2. materialize missing deliveries idempotently;
3. claim due `PENDING` / `FAILED` rows;
4. sign `<unixTimestamp>.<rawBody>` with HMAC-SHA256;
5. deliver over pinned HTTPS;
6. retry with exponential backoff;
7. move terminal failures to `DEAD_LETTER`;
8. allow owner/admin replay without creating duplicate event rows.

Webhook deletion is implemented as disablement so delivery history is preserved for audit and reconciliation.

### SSRF-safe egress boundary

Webhook transport resolves the destination host before connecting, rejects loopback, RFC1918, carrier-grade NAT, link-local, multicast/reserved IPv4 ranges, IPv6 loopback/ULA/link-local/multicast addresses and local-name suffixes. The validated address is pinned into the TLS socket lookup so a second DNS resolution cannot redirect the connection to an internal target. Redirects are not followed because delivery uses a direct HTTPS request. Response bodies are bounded and request timeouts are enforced.

This is an application-level egress boundary; production infrastructure should still enforce network egress policy at the VPC/firewall/proxy layer.
