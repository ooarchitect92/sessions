# Data model

## Implemented foundation

- `organizations`
- `workspaces`
- `users`
- `workspace_memberships`
- `rooms`
- `sessions`
- `agenda_items`
- `idempotency_keys`
- `outbox_events`
- `audit_events`

Tenant-owned rows carry both `organization_id` and `workspace_id` where appropriate. API transactions set session-local PostgreSQL variables and forced RLS policies enforce the boundary. The background outbox client is separated so production can use a dedicated database role with controlled `BYPASSRLS` capability. Delivery attempts are bounded and terminal failures are marked with `dead_lettered_at` for controlled replay tooling.

## Planned domain tables

### Meeting collaboration

- `session_participants`, `attendance_intervals`, `participant_devices`
- `chat_channels`, `chat_messages`, `message_reactions`
- `polls`, `poll_options`, `poll_answers`
- `questions`, `question_votes`, `question_answers`
- `whiteboards`, `whiteboard_snapshots`, `whiteboard_operations`
- `breakout_rooms`, `breakout_assignments`
- `content_blocks`, `content_assets`, `embed_connections`, `control_grants`

### Scheduling and events

- `event_pages`, `event_speakers`, `registration_forms`, `registrations`
- `booking_pages`, `availability_rules`, `availability_exceptions`
- `calendar_connections`, `calendar_busy_intervals`, `reservations`
- `notification_templates`, `notification_jobs`, `notification_deliveries`

### Memory and AI

- `recordings`, `recording_tracks`, `artifacts`, `artifact_shares`
- `transcripts`, `transcript_segments`, `transcript_revisions`
- `summaries`, `decisions`, `action_items`, `follow_up_drafts`
- `ai_jobs`, `ai_provider_runs`, `ai_evaluations`, `ai_feedback`
- `search_documents`, `search_chunks`, `retention_jobs`, `deletion_jobs`

### Platform

- `oauth_connections`, `integration_installations`, `integration_sync_cursors`
- `api_keys`, `webhook_endpoints`, `webhook_deliveries`
- `domains`, `domain_verifications`, `branding_themes`
- `plans`, `subscriptions`, `entitlements`, `usage_ledger`, `usage_reservations`
- `feature_flags`, `policy_assignments`, `security_events`

## Data rules

- Human-readable slugs are unique only inside their owning workspace or organization.
- External provider IDs are stored with provider, account, and tenant scope; they are never globally trusted.
- Mutable resources that users edit concurrently carry an integer version.
- Asynchronous artifacts carry explicit states such as `PENDING`, `PROCESSING`, `READY`, `FAILED`, `DELETING`, and `DELETED`.
- Object-storage paths are generated server-side and begin with organization/workspace identifiers.
- Audit and usage ledgers are append-only; corrections are represented by compensating entries.
- Personally identifiable data is classified, retained, exported, and deleted according to workspace policy.
