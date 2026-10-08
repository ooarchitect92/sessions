# API design

## Conventions

- Base path: `/v1`
- Content type: JSON unless an endpoint explicitly negotiates media or upload content.
- Authentication: bearer access token with immutable user, organization, workspace and role claims.
- Public registration and booking routes are unauthenticated but resolve a published tenant resource by organization/workspace slug and never accept caller-supplied tenant IDs.
- Create commands: `Idempotency-Key` is mandatory when a duplicate would be harmful.
- Optimistic updates: `If-Match: <integer version>` is mandatory for versioned resources.
- Success envelope: `{ "data": ..., "meta": { "requestId", "timestamp" } }`.
- Pagination: page/page-size is implemented first; cursor pagination will replace it for large append-only collections.
- Dates: RFC 3339 UTC timestamps. User-facing timezone is stored separately as an IANA timezone.
- External identifiers never grant access by themselves; authorization is evaluated for every request.

## Implemented endpoints

### Health and identity

| Method   | Path                                      | Purpose |
| -------- | ----------------------------------------- | ------- |
| `GET`    | `/v1/health/live`                         | process liveness |
| `GET`    | `/v1/health/ready`                        | PostgreSQL and Redis readiness |
| `POST`   | `/v1/auth/dev-token`                      | non-production seeded login session bootstrap |
| `POST`   | `/v1/auth/signup`                         | create organization, first workspace and owner account |
| `POST`   | `/v1/auth/login`                          | password login or create an MFA challenge |
| `POST`   | `/v1/auth/mfa/complete`                   | complete login using TOTP or recovery code |
| `POST`   | `/v1/auth/refresh`                        | rotate a refresh token and issue a new token pair |
| `POST`   | `/v1/auth/verify-email/request`           | queue a privacy-preserving verification request |
| `POST`   | `/v1/auth/verify-email`                   | consume an email-verification token and sign in |
| `POST`   | `/v1/auth/password-reset/request`         | queue a privacy-preserving password-reset request |
| `POST`   | `/v1/auth/password-reset/complete`        | consume a reset token, replace password and revoke sessions |
| `POST`   | `/v1/auth/invitations/accept`             | accept an invitation, create or link the account, and enforce MFA |
| `GET`    | `/v1/auth/me`                             | profile, active principal and accessible workspaces |
| `POST`   | `/v1/auth/workspace/switch`               | rotate the current login session into another allowed workspace |
| `POST`   | `/v1/auth/logout`                         | revoke the current refresh session |
| `GET`    | `/v1/auth/sessions`                       | list active refresh sessions for the account |
| `DELETE` | `/v1/auth/sessions/{sessionId}`           | revoke one login session |
| `PATCH`  | `/v1/auth/password`                       | change password and revoke other sessions |
| `POST`   | `/v1/auth/mfa/setup`                      | create encrypted pending TOTP factor and recovery codes |
| `POST`   | `/v1/auth/mfa/confirm`                    | verify and enable the pending factor |
| `DELETE` | `/v1/auth/mfa`                            | disable MFA using TOTP or a recovery code |

Access tokens are short-lived JWTs. Managed browser sessions use opaque, hashed refresh tokens that rotate on every refresh or workspace switch. Reuse of a revoked refresh token revokes the remaining token family. The authorization guard revalidates the login session and current membership, so password resets, member removal, role changes and explicit revocation take effect without waiting for the access token to expire.

### Workspace control plane

| Method   | Path                                                  | Purpose |
| -------- | ----------------------------------------------------- | ------- |
| `GET`    | `/v1/workspaces`                                      | list every workspace accessible to the account |
| `POST`   | `/v1/workspaces`                                      | create another workspace in the current organization; idempotent |
| `GET`    | `/v1/workspaces/current`                              | current workspace, organization and resource counts |
| `PATCH`  | `/v1/workspaces/current`                              | update current workspace profile/policy with `If-Match` |
| `GET`    | `/v1/workspaces/current/members`                      | list members and security posture |
| `PATCH`  | `/v1/workspaces/current/members/{membershipId}`       | change a member role while preserving an owner |
| `DELETE` | `/v1/workspaces/current/members/{membershipId}`       | remove access and revoke workspace login sessions |
| `GET`    | `/v1/workspaces/current/invitations`                  | list pending and historical invitations |
| `POST`   | `/v1/workspaces/current/invitations`                  | create or reissue an expiring role-scoped invitation |
| `DELETE` | `/v1/workspaces/current/invitations/{invitationId}`   | revoke a pending invitation |

### Rooms

| Method   | Path             | Purpose                            |
| -------- | ---------------- | ---------------------------------- |
| `POST`   | `/v1/rooms`      | create permanent room; idempotent  |
| `GET`    | `/v1/rooms`      | list workspace rooms               |
| `GET`    | `/v1/rooms/{id}` | read one room                      |
| `PATCH`  | `/v1/rooms/{id}` | update with `If-Match`             |
| `DELETE` | `/v1/rooms/{id}` | delete unused room with `If-Match` |

### Sessions and agenda

| Method  | Path                                               | Purpose                                                 |
| ------- | -------------------------------------------------- | ------------------------------------------------------- |
| `POST`  | `/v1/sessions`                                     | create a draft session; idempotent                      |
| `GET`   | `/v1/sessions`                                     | paginated session list                                  |
| `GET`   | `/v1/sessions/{id}`                                | session and ordered agenda                              |
| `PATCH` | `/v1/sessions/{id}`                                | update a session with `If-Match`                        |
| `POST`  | `/v1/sessions/{id}/publish`                        | move draft to scheduled                                 |
| `POST`  | `/v1/sessions/{id}/start`                          | start draft or scheduled session                        |
| `POST`  | `/v1/sessions/{id}/end`                            | end a live session and enqueue enabled memory artifacts |
| `POST`  | `/v1/sessions/{id}/cancel`                         | cancel draft or scheduled session                       |
| `GET`   | `/v1/sessions/{id}/agenda-items`                   | ordered agenda list                                     |
| `POST`  | `/v1/sessions/{id}/agenda-items`                   | append an agenda item                                   |
| `POST`  | `/v1/sessions/{id}/agenda-items/generate-draft`    | generate a provider-backed AI agenda draft for review   |
| `POST`  | `/v1/sessions/{id}/agenda-items/apply-draft`       | explicitly append or replace with a reviewed AI draft   |
| `PUT`   | `/v1/sessions/{id}/agenda-items/order`             | atomically reorder all items                            |
| `POST`  | `/v1/sessions/{id}/agenda-items/{itemId}/activate` | make item current and emit event                        |
| `POST`  | `/v1/sessions/{id}/media-token`                    | short-lived main or assignment-authorized breakout LiveKit token |
| `POST`  | `/v1/content/resolve-embed`                         | validate HTTPS content and return a sandboxed embed contract |

### Events and registrations

| Method  | Path                                                                    | Purpose                                                 |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST`  | `/v1/events`                                                            | create event draft; idempotent                          |
| `GET`   | `/v1/events`                                                            | list workspace events and registration counts           |
| `GET`   | `/v1/events/{id}`                                                       | event, linked webinar session and registration count    |
| `PATCH` | `/v1/events/{id}`                                                       | edit a draft with `If-Match`                            |
| `POST`  | `/v1/events/{id}/publish`                                               | publish and atomically create scheduled webinar session |
| `POST`  | `/v1/events/{id}/cancel`                                                | cancel event and cancel an eligible linked session      |
| `GET`   | `/v1/events/{id}/registrations`                                         | list registrations                                      |
| `GET`   | `/v1/events/{id}/presenters`                                            | host-visible organizer/host/co-host/speaker team        |
| `POST`  | `/v1/events/{id}/presenters`                                            | add a host, co-host or speaker                          |
| `PATCH` | `/v1/events/{eventId}/presenters/{presenterId}`                         | edit presenter role/profile/public visibility           |
| `POST`  | `/v1/events/{eventId}/presenters/{presenterId}/remove`                  | remove a non-organizer presenter                        |
| `PATCH` | `/v1/events/{eventId}/registrations/{registrationId}`                   | update attendance/registration status                   |
| `GET`   | `/v1/public/{orgSlug}/{workspaceSlug}/events/{eventSlug}`               | public published event metadata                         |
| `POST`  | `/v1/public/{orgSlug}/{workspaceSlug}/events/{eventSlug}/registrations` | register or waitlist an attendee                        |

### Booking pages and reservations

| Method  | Path                                                                       | Purpose                                                              |
| ------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `POST`  | `/v1/bookings`                                                             | create booking page; idempotent                                      |
| `GET`   | `/v1/bookings`                                                             | list pages and reservation counts                                    |
| `GET`   | `/v1/bookings/{id}`                                                        | page details                                                         |
| `PATCH` | `/v1/bookings/{id}`                                                        | update rules or active state with `If-Match`                         |
| `GET`   | `/v1/bookings/{id}/reservations`                                           | list reservations and linked sessions                                |
| `GET`   | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}`              | public page metadata                                                 |
| `GET`   | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/slots`        | generate available slots for a bounded date range                    |
| `POST`  | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/reservations` | lock a slot and atomically create reservation plus scheduled session |
| `POST`  | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/reservations/{reservationId}/reschedule` | token-authorized attendee reschedule with linked session update |
| `POST`  | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/reservations/{reservationId}/cancel` | token-authorized attendee cancellation |
| `POST`  | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/reservations/{reservationId}/calendar` | generate an RFC 5545 calendar invite for the reservation |

### Dynamic public forms

Event `registrationFields` and booking-page `intakeFields` use one typed field contract with stable keys and these supported controls: `TEXT`, `TEXTAREA`, `SELECT`, `MULTI_SELECT`, `CHECKBOX`, `NUMBER`, and `CONSENT`. Host create/update commands validate unique keys and select-option definitions. Public registration/reservation commands reject unknown answer keys, missing required values, invalid options, oversized text, non-numeric number values, and unaccepted consent before normalized answers are persisted.

### Secure file uploads

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/v1/uploads` | create a tenant-scoped quarantine asset and short-lived presigned PUT URL |
| `POST` | `/v1/uploads/{id}/complete` | verify uploaded object metadata and enqueue malware scanning |
| `GET` | `/v1/uploads/{id}` | read scan state and safe asset metadata |
| `GET` | `/v1/uploads/{id}/download` | issue a short-lived download grant only after a clean scan |

Upload object keys are namespaced by organization/workspace and start in a quarantine prefix. Browsers never receive storage credentials. Completion requires the declared byte size to match the object metadata. A bounded worker downloads the object, computes SHA-256, optionally verifies a client checksum, and scans the bytes before the asset can enter `READY`. Rejected objects are deleted. Production configuration forbids the local mock scanner and requires the ClamAV provider.

### In-session collaboration

| Method  | Path                                            | Purpose                                             |
| ------- | ----------------------------------------------- | --------------------------------------------------- |
| `GET`   | `/v1/sessions/{id}/chat-messages`               | list authorized durable messages                    |
| `POST`  | `/v1/sessions/{id}/chat-messages`               | persist public, host-only or direct message          |
| `POST`  | `/v1/sessions/{id}/chat-messages/{messageId}/reactions` | toggle an allowed emoji reaction              |
| `GET`   | `/v1/sessions/{id}/whiteboard`                           | load compacted snapshot plus recent operations |
| `POST`  | `/v1/sessions/{id}/whiteboard/operations`                | append an idempotent whiteboard operation       |
| `GET`   | `/v1/sessions/{id}/breakouts`                             | breakout rooms, current assignment and announcements |
| `POST`  | `/v1/sessions/{id}/breakouts/rooms`                       | host creates a breakout room                    |
| `POST`  | `/v1/sessions/{id}/breakouts/assign`                      | host assigns one workspace member               |
| `POST`  | `/v1/sessions/{id}/breakouts/randomize`                   | deterministically distribute selected members   |
| `POST`  | `/v1/sessions/{id}/breakouts/open`                        | open rooms during a live session                |
| `POST`  | `/v1/sessions/{id}/breakouts/close`                       | close open rooms and return participants         |
| `POST`  | `/v1/sessions/{id}/breakouts/broadcast`                   | persist and broadcast a host announcement        |
| `GET`   | `/v1/sessions/{id}/polls`                       | list polls, options and response counts             |
| `POST`  | `/v1/sessions/{id}/polls`                       | create poll                                         |
| `POST`  | `/v1/sessions/{id}/polls/{pollId}/launch`       | launch the only active poll                         |
| `POST`  | `/v1/sessions/{id}/polls/{pollId}/close`        | close a live poll                                   |
| `POST`  | `/v1/sessions/{id}/polls/{pollId}/answers`      | idempotently record the current user's answer       |
| `GET`   | `/v1/sessions/{id}/polls/{pollId}/results`      | aggregate results with host-only text disclosure    |
| `GET`   | `/v1/sessions/{id}/questions`                   | list questions visible to the principal             |
| `POST`  | `/v1/sessions/{id}/questions`                   | submit question; webinar attendees enter moderation |
| `POST`  | `/v1/sessions/{id}/questions/{questionId}/vote` | toggle one vote per user                            |
| `PATCH` | `/v1/sessions/{id}/questions/{questionId}`      | host moderation and answer                          |

### Memory and artifacts

| Method | Path                           | Purpose                                                              |
| ------ | ------------------------------ | -------------------------------------------------------------------- |
| `GET`  | `/v1/memory`                   | paginated Memory library; `searchMode=lexical|semantic` selects GIN keyword ranking or optional pgvector transcript retrieval with workspace filtering and lexical fallback |
| `GET`  | `/v1/memory/{sessionId}`       | agenda, artifacts, transcript segments, chat, polls, Q&A and summary |
| `PATCH` | `/v1/memory/{sessionId}/summary` | human review/edit of a ready summary with `If-Match`                 |
| `POST` | `/v1/memory/{sessionId}/retry` | requeue failed recording, transcript and summary artifacts           |
| `GET`  | `/v1/recordings/{sessionId}`   | recording metadata and processing state                              |
| `GET`  | `/v1/transcripts/{sessionId}`  | transcript metadata, text and ordered segments                       |

## Realtime events

Authenticated clients join `session:{sessionId}` through the `/realtime` Socket.IO namespace. Implemented server events include:

- `participant.joined`, `participant.left`
- `agenda.activated`
- `chat.message.created`
- `poll.created`, `poll.launched`, `poll.closed`, `poll.results.updated`
- `question.created`, `question.updated`, `question.votes.updated`
- `whiteboard.operation.appended`
- `breakouts.updated`, `breakouts.announcement`
- `memory.updated`

The current single-replica event bridge is in-process. A Redis/NATS adapter is a mandatory gate before horizontally scaling realtime API replicas.

## Planned endpoint families

The following families define the remaining contract direction; they are not claimed as implemented:

- `/v1/availability/connections`, `/calendar-connections`, `/reschedules`, `/cancellations`
- `/v1/artifacts/{id}/playback`, `/shares`, `/retention`, `/exports`, `/deletions`
- `/v1/attendance`, `/engagement-events`
- `/v1/integrations`, `/oauth/connections`, `/webhooks`, `/api-keys`
- `/v1/analytics`, `/usage`, `/exports`
- `/v1/ai/jobs`, `/follow-ups`, `/evaluations`
- `/v1/branding`, `/domains`, organization lifecycle and enterprise policy endpoints
- `/v1/plans`, `/subscriptions`, `/entitlements`, `/usage-reservations`

## Error contract

HTTP failures are normalized to:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "The session changed. Refresh and try again.",
    "details": { "currentVersion": 4 },
    "requestId": "..."
  }
}
```

Validation details must never leak secrets or cross-tenant resource existence. Provider failures map to stable internal codes and retain raw details only in restricted logs.


## Recording consent and governed playback

- `GET /v1/sessions/:sessionId/recording-consent` returns the current participant decision, policy/notice versions and aggregate decision counts.
- `POST /v1/sessions/:sessionId/recording-consent` records `GRANTED`, `DECLINED` or `REVOKED` with an audit event. A room-scoped media token is not issued for a recording-enabled session until the current user has granted consent.
- `GET /v1/recordings/:sessionId/playback?disposition=inline|attachment` returns a short-lived SigV4 URL only for a ready, retained recording.
- `PATCH /v1/recordings/:sessionId/retention` changes the retention deadline; a past deadline schedules deletion.
- `DELETE /v1/recordings/:sessionId` schedules permanent object deletion and is restricted to host roles.

LiveKit egress lifecycle changes are performed by the bounded recording worker. Provider job IDs and object keys remain server-side; the browser receives only expiring access grants.


### Booking reminder operations

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/v1/notifications/bookings/{reservationId}` | host-visible reminder delivery history for a booking reservation |
| `POST` | `/v1/notifications/{deliveryId}/retry` | manually requeue a failed/dead-letter reminder |

The booking reminder worker materializes 24-hour and 1-hour reminders for confirmed reservations, retries failures with exponential backoff, cancels stale reminders after cancellation/rescheduling, and records provider delivery identifiers for reconciliation.


### Calendar integrations

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/v1/calendar/connections` | list the current user's Google/Microsoft calendar connections |
| `POST` | `/v1/calendar/oauth/{provider}/start` | create a short-lived OAuth state and return the provider authorization URL |
| `GET` | `/v1/calendar/oauth/{provider}/callback` | public OAuth callback; consumes the one-time state and stores encrypted provider tokens |
| `PATCH` | `/v1/calendar/connections/{id}` | enable/disable availability sync or select a calendar identifier |
| `POST` | `/v1/calendar/connections/{id}/disconnect` | revoke local use of the connection and remove refresh credentials |

Connected Google and Microsoft calendars contribute provider free/busy intervals to booking availability. OAuth state is one-time and time-limited; provider access/refresh tokens are encrypted with AES-256-GCM before persistence. Booking creation and rescheduling re-check connected-calendar busy time in addition to booking-page rules, buffers, lead time, and existing reservations.


### Webinar stage roles

Each event has one protected `ORGANIZER` created with the event. Hosts may add `HOST`, `CO_HOST`, and `SPEAKER` presenters. For event-backed webinar sessions, LiveKit grants are derived from the event presenter role: organizer/host/co-host receive room-admin + publish permission, speakers receive publish permission without room-admin, and non-presenters are subscribe/data-only. Public event payloads expose only presenters marked public and omit presenter email/user identifiers.


### Webinar landing-page composition

Event `branding` is a validated, non-HTML visual configuration used by the public event site and the organizer preview. Hosts can configure scoped primary/accent colors, hero copy, an HTTPS hero image, about copy, registration CTA text, presenter/details visibility, and the order of the About / Presenters / Details sections. The public renderer treats all copy as text (no raw HTML injection) and applies colors through page-scoped CSS variables.


### Event reminder templates and delivery reconciliation

Published events use two tenant-scoped reminder templates: `EVENT_REMINDER_24H` and `EVENT_REMINDER_1H`. Hosts can edit subject/body text, enable or disable either reminder, and use only the allow-listed variables `{{event_title}}`, `{{attendee_name}}`, `{{event_time}}`, and `{{event_timezone}}`.

- `GET /v1/notifications/events/{eventId}/templates` lists the two event templates.
- `PATCH /v1/notifications/events/{eventId}/templates/{kind}` updates a template using `If-Match` optimistic versioning.
- `GET /v1/notifications/events/{eventId}/deliveries` returns the durable attendee delivery ledger.
- `POST /v1/notifications/events/deliveries/{deliveryId}/retry` requeues a failed/dead-letter delivery.

The reminder worker materializes deliveries only for registered attendees whose registration existed before the reminder instant, snapshots rendered subject/body text, recovers stale claims, cancels stale deliveries after event/registration/template changes, refreshes pending snapshots when templates change, retries provider failures with exponential backoff, and records delivered/dead-letter outbox events.


### Attendance and engagement analytics

Authenticated realtime joins now create durable attendance intervals keyed by the session and socket connection. Disconnects close those intervals. For webinars, a join is matched to an event registration by attendee email when possible; the registration is marked `ATTENDED` and `checkedInAt` is set on first join.

Persisted engagement events are recorded for chat messages, chat reactions, poll responses, submitted questions, and question votes. These events are tenant-scoped and designed for downstream aggregation.

- `GET /v1/analytics/sessions/{sessionId}` returns host/analyst-visible session attendance and engagement counts.
- `GET /v1/analytics/events/{eventId}` returns registrations by status, webinar attendance, participant durations, current active attendees, and engagement counts.

Attendance duration aggregation merges overlapping intervals per user so multiple tabs or reconnect overlap are not double-counted.


### Transcript review, correction, and revision history

Hosts can review completed transcripts without mutating provider output invisibly. Every correction uses optimistic concurrency and snapshots the previous transcript before changes are applied.

- `GET /v1/memory/{sessionId}/transcript/revisions` lists prior transcript snapshots, newest first.
- `PATCH /v1/memory/{sessionId}/transcript` corrects language, speaker labels, timestamps, or text. The request requires `If-Match` with the current transcript version.
- `POST /v1/memory/{sessionId}/transcript/revisions/{revisionId}/restore` restores a prior revision while first preserving the current transcript as a new revision.

Language tags are validated using a BCP-47-style policy. Transcript edits are host-restricted, tenant-scoped, audited, emitted through the outbox, and invalidate AI summary source-version state. Summary workers pin the transcript version they read and refuse stale writes if the transcript changes while generation is in progress.


### Memory full-text search

`GET /v1/memory?query=...` uses PostgreSQL `websearch_to_tsquery` with the language-neutral `simple` text-search configuration. GIN expression indexes cover session title/description and transcript full text. Search execution runs inside the normal tenant transaction, repeats organization/workspace predicates as defense in depth, preserves the existing artifact-eligibility boundary, ranks session metadata above transcript-only matches, and returns a short plain-text excerpt for matching cards. Vector retrieval remains a separate optional phase and is not required for this lexical path.


### Optional semantic Memory retrieval

When `EMBEDDING_PROVIDER` is enabled, a background worker chunks ready transcript segments, embeds them, and writes tenant-scoped vectors to PostgreSQL pgvector. Index rows pin `source_transcript_version`; transcript corrections automatically become stale and are re-indexed before semantic results are considered current.

- `GET /v1/memory?query=...&searchMode=semantic` embeds the query and ranks ready transcript chunks by cosine distance. If semantic indexing is unavailable or has no matching indexed sessions yet, the API falls back to the existing lexical search path.
- `POST /v1/memory/{sessionId}/semantic-index/retry` is host-restricted and requeues a failed semantic index for a ready transcript.

Local development uses a deterministic mock embedding provider. Production forbids that provider; an external embedding provider must be configured or the optional semantic tier can remain disabled. API queries still execute inside tenant RLS transactions and repeat organization/workspace predicates in vector search.
