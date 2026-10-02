# API design

## Conventions

- Base path: `/v1`
- Content type: JSON unless an endpoint explicitly negotiates media or upload content.
- Authentication: bearer access token with immutable user, organization, workspace, and role claims.
- Create commands: `Idempotency-Key` is mandatory when a duplicate would be harmful.
- Optimistic updates: `If-Match: <integer version>` is mandatory for versioned resources.
- Success envelope: `{ "data": ..., "meta": { "requestId", "timestamp" } }`.
- Pagination: page/page-size is implemented first; cursor pagination will replace it for large append-only collections.
- Dates: RFC 3339 UTC timestamps. User-facing timezone is stored separately as an IANA timezone.
- External identifiers never grant access by themselves; authorization is evaluated for every request.

## Implemented endpoints

### Health and identity

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health/live` | process liveness |
| `GET` | `/v1/health/ready` | PostgreSQL and Redis readiness |
| `POST` | `/v1/auth/dev-token` | deterministic local-only token bootstrap |
| `GET` | `/v1/auth/me` | current principal |

### Rooms

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/rooms` | create permanent room; idempotent |
| `GET` | `/v1/rooms` | list workspace rooms |
| `GET` | `/v1/rooms/{id}` | read one room |
| `PATCH` | `/v1/rooms/{id}` | update with `If-Match` |
| `DELETE` | `/v1/rooms/{id}` | delete unused room with `If-Match` |

### Sessions and agenda

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/sessions` | create a draft session; idempotent |
| `GET` | `/v1/sessions` | paginated session list |
| `GET` | `/v1/sessions/{id}` | session and ordered agenda |
| `PATCH` | `/v1/sessions/{id}` | update a session with `If-Match` |
| `POST` | `/v1/sessions/{id}/publish` | move draft to scheduled |
| `POST` | `/v1/sessions/{id}/start` | start draft or scheduled session |
| `POST` | `/v1/sessions/{id}/end` | end a live session |
| `POST` | `/v1/sessions/{id}/cancel` | cancel draft or scheduled session |
| `GET` | `/v1/sessions/{id}/agenda-items` | ordered agenda list |
| `POST` | `/v1/sessions/{id}/agenda-items` | append an agenda item |
| `PUT` | `/v1/sessions/{id}/agenda-items/order` | atomically reorder all items |
| `POST` | `/v1/sessions/{id}/agenda-items/{itemId}/activate` | make item current and emit event |
| `POST` | `/v1/sessions/{id}/media-token` | short-lived LiveKit room token |

## Planned endpoint families

The following families define the contract direction; they are not claimed as implemented:

- `/v1/events`, `/v1/events/{id}/publish`, `/registrations`, `/attendance`
- `/v1/booking-pages`, `/availability`, `/slots`, `/reservations`
- `/v1/recordings`, `/artifacts`, `/transcripts`, `/memory`, `/shares`
- `/v1/polls`, `/answers`, `/questions`, `/chat-messages`, `/breakout-rooms`
- `/v1/integrations`, `/oauth/connections`, `/webhooks`, `/api-keys`
- `/v1/analytics`, `/usage`, `/exports`
- `/v1/ai/jobs`, `/summaries`, `/actions`, `/follow-ups`
- `/v1/workspaces`, `/memberships`, `/invitations`, `/branding`, `/domains`
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
