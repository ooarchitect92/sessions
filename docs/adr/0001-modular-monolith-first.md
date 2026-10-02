# ADR 0001: Modular monolith first, extraction-ready boundaries

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The target platform contains identity, meetings, agendas, media authorization, scheduling, webinars, recordings, transcription, AI, analytics, notifications, and integrations. Beginning with independently deployed microservices would multiply operational failure modes before domain behavior and traffic boundaries are validated.

## Decision

Start with a modular NestJS application and separate worker processes sharing a transactional PostgreSQL source of truth. Domain modules communicate through explicit service interfaces and durable outbox events. Media remains a separate LiveKit SFU subsystem. Redis is used for ephemeral presence, locks, and streams, not as the source of truth.

Extract a module only when at least one condition is demonstrated: independent scaling, separate data lifecycle, security boundary, materially different runtime, or release cadence that cannot be handled safely in the modular application.

## Consequences

- Faster delivery and simpler transactions for the initial vertical slices.
- Tenant isolation and audit behavior stay consistent.
- The outbox and contract packages provide an extraction path.
- Teams must prevent cross-module direct table access from becoming permanent coupling.
