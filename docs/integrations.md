# Integrations control plane

Phase 5 begins with a tenant-scoped control plane for API keys and outbound webhook subscriptions.

## API keys

- Owner/admin only administration.
- A generated key is returned exactly once at creation time.
- Only a SHA-256 digest and short non-secret prefix are persisted.
- Keys carry explicit scopes, optional expiration, last-used metadata and durable revocation state.
- Issued scopes are validated against a fixed catalog instead of accepting arbitrary privilege strings.
- Bearer credentials using the `sess_<prefix>_<secret>` format are authenticated before JWT parsing.
- API keys resolve through the creator's current active workspace membership so removed access or disabled users invalidate the machine credential.
- Machine access is default-deny: an API-key request can reach only endpoints explicitly decorated for API-key scopes.
- Creation/revocation emits audit and transactional-outbox evidence.

### Supported machine scopes

- `sessions:read`, `sessions:write`
- `rooms:read`, `rooms:write`
- `bookings:read`, `bookings:write`
- `events:read`, `events:write`
- `memory:read`, `memory:write`

Read endpoints inherit their domain `:read` scope; mutating endpoints explicitly require the corresponding `:write` scope. Integration-management, identity, workspace administration and all other endpoints remain unavailable to API keys unless a later reviewed change explicitly opts them in.

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


## Governed provider connections

Workspace owners/admins can configure one governed connection per supported provider kind:

- `EMAIL_HTTP`
- `CRM_HTTP`

Provider credentials are encrypted with the shared AES-256-GCM sensitive-value boundary and are never returned by list/update APIs. Rotation increments a credential version and re-encrypts the replacement secret under a version-specific purpose. Provider config is stored separately from credentials, and config keys that look like secrets/tokens/passwords/API keys are rejected to prevent plaintext secret sprawl.

Provider endpoints must resolve to public HTTPS addresses before create, update, or re-enable. Runtime email/CRM calls use the DNS-pinned bounded HTTPS transport already used by webhook delivery, so tenant-configured endpoints inherit the same application-level SSRF boundary. Provider execution records last-used/success/failure timestamps and bounded error state.

The existing environment-configured email/CRM adapters remain as backward-compatible fallback when a workspace has no governed provider connection. Google/Microsoft Calendar continue to use their existing OAuth-specific connection/token lifecycle. Consolidating OAuth providers behind the generic connection framework and completing real-provider qualification remain later release gates.


## Branding and custom domains

Each workspace can persist a tenant-isolated brand profile with display name, HTTPS logo/favicon/support URLs, six-digit primary/accent colors, email sender name and a white-label presentation flag. Owner/admin mutations emit audit and transactional-outbox evidence.

Custom-domain onboarding follows a proof-before-routing lifecycle:

1. normalize and globally reserve the requested hostname;
2. generate a unique `_sessions-verification.<hostname>` TXT challenge;
3. return exact TXT and platform CNAME instructions;
4. verify ownership through authoritative DNS TXT lookup;
5. persist verification/check/error evidence;
6. enqueue `branding.domain.tls.requested` after first successful verification;
7. keep the domain unavailable for public brand resolution until TLS is explicitly marked `ACTIVE` by the infrastructure provisioning path.

The application therefore does not confuse DNS ownership with certificate readiness. Automated certificate issuance/renewal and edge-router reconciliation remain infrastructure qualification work; the domain model and outbox handoff are ready for that provider.


## Workspace analytics exports

A background rollup worker recomputes a configurable recent UTC-day window from source-of-truth sessions, attendance intervals, engagement events, events, registrations and booking reservations. Attendance intervals are clipped to each day and merged per participant/session so reconnects do not double-count overlapping ranges. Rollups run on application startup and every five minutes, processing workspaces in bounded batches.

Workspace analytics are available to host/analyst roles. API keys require `analytics:read`; CSV export requires the separate `analytics:export` scope. Exports contain aggregate daily metrics only—no attendee names or email addresses—and each export writes an audit event with date range, row count and format.
