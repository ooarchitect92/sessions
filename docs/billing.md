# Billing, entitlements and quota governance

## Plan catalog

The application ships a typed FREE / PRO / BUSINESS / ENTERPRISE catalog. Each plan defines:

- a seat limit;
- boolean feature entitlements;
- per-period quota limits for webhook deliveries, AI external actions, recording minutes, transcription seconds and storage bytes;
- `null` quota values for unlimited enterprise metrics.

A workspace owns exactly one subscription record. New workspaces start on the internal FREE definition until a verified billing provider synchronizes a different subscription.

## Seats

Seat capacity is checked under a PostgreSQL advisory lock.

- Current memberships consume seats.
- Active, unexpired invitations reserve seats before acceptance.
- New invitations cannot exceed the workspace seat limit.
- Invitation acceptance re-checks capacity transactionally before membership creation.
- A reconciliation worker updates persisted `seatsUsed` from source-of-truth memberships.

This avoids a race where multiple concurrent invitations could all pass an optimistic seat check.

## Usage ledger

`usage_ledger_entries` is append-only at the service boundary and idempotent per workspace/key. Entries store metric, signed quantity, source type/id and occurrence time.

The currently wired production paths are:

- successful outbound webhook deliveries;
- successful approved AI follow-up/CRM actions.

Recording, transcription and storage metrics have catalog/ledger support but still require workflow-specific metering hooks.

## Quota reservations

Concurrency-sensitive jobs reserve quota before external execution. Reservations are:

- idempotent by workspace reservation key;
- checked against current-period usage plus all active reservations;
- time bounded;
- committed atomically into the usage ledger after successful execution;
- released after failure;
- expired by reconciliation when abandoned.

This prevents concurrent workers from individually observing remaining quota and collectively overspending it.

## Reconciliation

A startup + five-minute worker:

- ensures every workspace has a subscription;
- advances internal-plan monthly periods;
- expires abandoned reservations;
- recalculates seat usage.

Provider-backed periods are not rewritten by internal reconciliation.

## Provider boundary

`BillingService.syncProviderSubscription` is the internal reconciliation boundary for a future billing provider adapter. Customer-facing plan mutation is deliberately not exposed until checkout, signature-verified provider webhooks, replay protection and provider reconciliation are qualified. The Settings UI is therefore read-only for subscription state.
