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
| `PUT`   | `/v1/sessions/{id}/agenda-items/order`             | atomically reorder all items                            |
| `POST`  | `/v1/sessions/{id}/agenda-items/{itemId}/activate` | make item current and emit event                        |
| `POST`  | `/v1/sessions/{id}/agenda-items/save-template`      | save the current ordered agenda as a workspace template |
| `POST`  | `/v1/sessions/{id}/agenda-items/apply-template/{templateId}` | append or replace agenda items from a template |
| `POST`  | `/v1/sessions/{id}/transcription/chunks`            | submit a bounded live microphone audio chunk for STT and realtime captions |
| `POST`  | `/v1/sessions/{id}/media-token`                    | short-lived LiveKit room token                          |

### Agenda templates

| Method   | Path                                | Purpose |
| -------- | ----------------------------------- | ------- |
| `GET`    | `/v1/agenda-templates`              | list workspace templates and ordered items |
| `GET`    | `/v1/agenda-templates/{templateId}` | read one reusable agenda template |
| `POST`   | `/v1/agenda-templates`              | create a reusable workspace template |
| `PATCH`  | `/v1/agenda-templates/{templateId}` | update a versioned template with `If-Match` |
| `DELETE` | `/v1/agenda-templates/{templateId}` | delete a workspace template |

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
| `PATCH` | `/v1/bookings/{id}/reservations/{reservationId}/reschedule`                  | move a confirmed reservation to an available slot and sync its session |
| `POST`  | `/v1/bookings/{id}/reservations/{reservationId}/cancel`                      | cancel a confirmed reservation and eligible linked session           |
| `GET`   | `/v1/bookings/{id}/reservations/{reservationId}/calendar`                    | generate an RFC 5545-compatible ICS payload                           |
| `GET`   | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}`              | public page metadata                                                 |
| `GET`   | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/slots`        | generate available slots for a bounded date range                    |
| `POST`  | `/v1/public/{orgSlug}/{workspaceSlug}/bookings/{bookingSlug}/reservations` | lock a slot and atomically create reservation plus scheduled session |

### In-session collaboration

| Method  | Path                                            | Purpose                                             |
| ------- | ----------------------------------------------- | --------------------------------------------------- |
| `GET`   | `/v1/sessions/{id}/chat-messages`               | list authorized durable messages                    |
| `POST`  | `/v1/sessions/{id}/chat-messages`               | persist and broadcast a message                     |
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
| `GET`  | `/v1/memory`                   | paginated memory library with optional title/transcript query        |
| `GET`  | `/v1/memory/{sessionId}`       | agenda, artifacts, transcript segments, chat, polls, Q&A and summary |
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
- `memory.updated`
- `transcript.live.segment`

The current single-replica event bridge is in-process. A Redis/NATS adapter is a mandatory gate before horizontally scaling realtime API replicas.

## Planned endpoint families

The following families define the remaining contract direction; they are not claimed as implemented:

- `/v1/availability/connections`, `/calendar-connections`, `/reschedules`, `/cancellations`
- `/v1/artifacts/{id}/playback`, `/shares`, `/retention`, `/exports`, `/deletions`
- `/v1/whiteboards`, `/breakout-rooms`, `/attendance`, `/engagement-events`
- `/v1/integrations`, `/oauth/connections`, `/webhooks`, `/api-keys`
- `/v1/analytics`, `/usage`, `/exports`
- `/v1/ai/jobs`, `/agenda-drafts`, `/follow-ups`, `/evaluations`
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
