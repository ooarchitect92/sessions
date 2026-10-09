# Realtime protocol

Realtime messages coordinate transient collaboration. PostgreSQL remains the durable source of truth for anything that must survive reconnects, failover, moderation, export, or audit.

## Transport separation

- **WebRTC/LiveKit:** audio, video, screen share, adaptive subscriptions, and media data.
- **Socket.IO gateway:** authenticated presence and committed collaboration notifications.
- **HTTP commands:** durable agenda, chat, poll, Q&A, session, and artifact commands.
- **PostgreSQL/outbox:** authoritative command result and asynchronous provider-event publication.
- **Current bridge:** committed application events are forwarded through an in-process observable bridge.
- **Scale gate:** a Redis/NATS Socket.IO adapter and leased presence model are mandatory before multiple realtime gateway replicas are enabled.

This separation prevents a socket acknowledgement from being mistaken for a durable write. The service commits business state first and broadcasts afterward.

## Authentication and room authorization

Each socket supplies a bearer token during the `/realtime` namespace handshake. The token must contain verified user, organization, workspace, and role claims. Before the socket joins `session:{sessionId}`, the server reads the session under the principal's tenant database context. Guessing a UUID is insufficient to join another workspace's room.

Host authority is never granted permanently because a user once joined as a host. Every durable host command is authorized again by the application service.

## Implemented client commands

- `session.join { sessionId }`
- `agenda.activate { sessionId, agendaItemId }`
- `whiteboard.cursor { sessionId, x, y, visible }` — ephemeral, authenticated cursor presence for collaborators already joined to the session room. Coordinates are bounded to the whiteboard canvas and visible updates are rate-limited server-side.
- `caption.audio { sessionId, sequence, mimeType, language, audio }` — opt-in per-participant near-real-time transcription chunks. The sender must already be joined, the session must be LIVE with transcription enabled, binary payloads are bounded, and at most one chunk per participant/session is processed concurrently.

Agenda activation is also available through HTTP and uses the same domain service. Chat, poll, and Q&A mutations currently use HTTP commands so validation, audit, idempotency policy, and error envelopes remain consistent; their committed results are then broadcast over Socket.IO.

## Implemented server events

### Presence and agenda

- `participant.joined { sessionId, userId, displayName, occurredAt }`
- `participant.left { sessionId, userId, occurredAt }`
- `agenda.activated { sessionId, agendaItem, activatedAt }`
- `authorization.error { message }`

### Durable chat

- `chat.message.created`

The payload is the committed message projection, including author display information. Non-host reads filter out the host-only channel.

### Polls

- `poll.created`
- `poll.launched`
- `poll.closed`
- `poll.results.updated`

Only one poll can be live in a session. Answers are upserted by `(pollId, respondentKey)`. Host result reads may include open-text values; non-host result reads receive aggregates without individual text disclosure.

### Q&A

- `question.created`
- `question.updated`
- `question.votes.updated`

Webinar attendee questions enter moderation; ordinary meeting questions may be approved immediately. Public list results never expose an anonymous author's display name.

### Whiteboard

- `whiteboard.operation.appended` — emitted after a durable operation commit.
- `whiteboard.cursor.updated { sessionId, userId, displayName, x, y, visible, occurredAt }` — ephemeral collaborator cursor state. Cursor state is intentionally not persisted and is cleared when the sender leaves the canvas or disconnects.

### Co-browse

- `cobrowse.updated` — emitted only after a tenant-scoped start, navigation, control-grant or stop command commits. Clients invalidate and reread the authoritative co-browse state.
- Shared navigation commands remain HTTP mutations so URL validation, host/controller authorization, optimistic version checks, audit evidence and outbox publication complete before realtime broadcast.
- Arbitrary cross-origin click/type forwarding is intentionally not emulated inside the browser iframe; that requires a separately governed remote-browser provider and isolation qualification.

### Live captions

- `caption.final { sessionId, sequence, speakerUserId, speakerName, text, language, provider, occurredAt }` — provider-backed final text for a short participant audio chunk. It is broadcast to the authenticated session room.
- `caption.error { sessionId, sequence, code, message }` — sender-only failure feedback. Provider error details are logged server-side rather than exposed to other participants.

Live captions are ephemeral meeting UX; the durable post-session transcript still comes from the governed recording/STT worker so reconnects or skipped live chunks do not silently become the authoritative transcript.

### Memory

- `memory.updated`

This event invalidates artifact views after a governed retry or future provider callback. Provider workers must commit artifact state before broadcasting readiness.

## Reconnect and ordering direction

The current implementation asks clients to invalidate and reread durable state after a collaboration event. This makes reconnect recovery safe for the initial topology but does not yet provide a global stream position.

Before high-scale release, the protocol will add:

1. a versioned public event envelope;
2. `eventId`, `occurredAt`, `sessionId`, `workspaceId`, and monotonic session stream position;
3. a reconnect cursor and gap-detection response;
4. bounded replay from Redis Streams or a durable event projection;
5. duplicate suppression by event ID;
6. server-side rate and payload limits per event class.

## Presence versus attendance

Socket presence is advisory. A tab crash, mobile suspension, or network partition may delay a leave signal. Production attendance analytics will use leased heartbeats plus durable attendance intervals and media-server evidence rather than equating a socket connection with attendance.

## Planned namespaces and events

- `chat.message.edited`, `chat.message.deleted`, `chat.reaction.changed`
- `whiteboard.snapshot.ready`
- `breakout.created`, `breakout.assignment.changed`, `breakout.broadcast`
- `recording.started`, `recording.stopped`, `caption.partial`
- `timer.started`, `timer.paused`, `timer.expired`
- `participant.media.changed`, `participant.hand.changed`, `participant.role.changed`

Large whiteboard documents will use snapshots plus bounded incremental operations, not unbounded socket-room history. Breakout reassignment will be a durable state transition that produces a new server-generated media grant.
