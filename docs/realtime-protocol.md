# Realtime protocol

Realtime messages coordinate transient collaboration. PostgreSQL remains the durable source of truth for resources that must survive reconnects.

## Transport separation

- **WebRTC/LiveKit:** audio, video, screen share, adaptive subscriptions, media data.
- **Socket.IO gateway:** presence, agenda commands, chat, polls, Q&A, timers, whiteboard coordination, breakout orchestration.
- **Current bridge:** committed agenda events are broadcast through an in-process event bridge so HTTP and socket commands behave consistently on one API replica.
- **Redis scale gate:** horizontal gateway fan-out and leased presence/state must be enabled before multiple gateway replicas are deployed.
- **PostgreSQL/outbox:** durable command result and asynchronous event publication.

## Implemented events

Client to server:

- `session.join { sessionId }`
- `agenda.activate { sessionId, agendaItemId }`

Server to client:

- `participant.joined { sessionId, userId, displayName, occurredAt }`
- `participant.left { sessionId, userId, occurredAt }`
- `agenda.activated { sessionId, agendaItem, activatedAt }`
- `authorization.error { message }`

Every socket authenticates with a bearer token during the handshake. Before joining a socket room, the API verifies that the session is visible under the principal's database tenant context.

## Planned protocol rules

1. Commands include `commandId`, `sessionId`, and the expected durable resource version when relevant.
2. Durable commands are accepted through the application service and committed before broadcast.
3. Server events include an increasing stream position so a reconnecting client can detect a gap.
4. Large whiteboard documents use snapshot plus incremental operations, not unbounded room history.
5. Presence uses leases and heartbeats; disconnect is advisory rather than authoritative attendance evidence.
6. Chat, Q&A, poll answers, and moderation decisions are persisted before acknowledgement.
7. A host command is authorized again on every message; joining as host once does not grant a permanent capability.
8. Breakout reassignment is represented as a state transition with a server-generated media-room grant.

## Planned event namespaces

- `chat.message.created`, `chat.message.deleted`
- `poll.launched`, `poll.answer.recorded`, `poll.closed`
- `question.created`, `question.upvoted`, `question.moderated`, `question.answered`
- `whiteboard.operation`, `whiteboard.snapshot.ready`
- `breakout.created`, `breakout.assignment.changed`, `breakout.broadcast`
- `recording.started`, `recording.stopped`, `caption.partial`, `caption.final`
- `timer.started`, `timer.paused`, `timer.expired`

The public event schema will be versioned independently from internal domain events.
