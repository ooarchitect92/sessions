# Security Policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private tenant data, or personally identifiable information. Contact the repository owner privately and include the affected commit, reproduction steps, impact, and a safe proof of concept.

## Baseline controls

- Tenant-owned tables use PostgreSQL row-level security and application-side scope checks.
- Production authentication must use a verified OIDC/SAML provider; development identities are disabled in production.
- Secrets belong in a managed secret store, never source control or client bundles.
- Recordings and transcripts require explicit consent, private object storage, short-lived signed access, retention policies, and audited access.
- External embeds must use an allow-list, CSP, sandboxed iframes, and explicit remote-control consent.
- Webhooks require HMAC signatures, timestamps, replay protection, idempotent consumers, retry limits, and dead-letter handling.
- Uploaded files require MIME verification, malware scanning, size limits, quarantine, and authorized download paths.
- Privileged actions require MFA/step-up authentication in production.

## Supported versions

Security fixes are applied to the current `main` line until formal release branches are introduced.
