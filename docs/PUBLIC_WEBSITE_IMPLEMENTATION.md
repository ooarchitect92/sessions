# Public SaaS website implementation

## Scope boundary

This delivery is intentionally limited to the public customer-facing website and public self-service journeys. The authenticated `frontend/` workspace/dashboard is not redesigned or modified by this work. The public surface remains in `website/`, and it calls the existing NestJS business API in `backend/`.

The implementation is based on the supplied Sessions-like product research and Website Master Blueprint. It uses a clean-room product and visual language: functionality is described from the research, but proprietary code, private assets, and undocumented wording are not copied.

## Architecture

```text
Public browser
  |
  | HTTPS
  v
website/ (React + TypeScript + generated route HTML + nginx)
  |
  | REST / JSON
  v
backend/ (NestJS modular monolith)
  |
  +--> PostgreSQL / Prisma  -- durable business state
  +--> Redis               -- realtime support / rate limits / event stream
  +--> LiveKit + TURN      -- WebRTC media
  +--> S3-compatible store -- recordings and uploads
  +--> background workers  -- recordings, transcription, AI, reminders, outbox
```

The existing product modules remain authoritative for sessions, rooms, agendas, events, bookings, collaboration, whiteboards, breakouts, recordings, transcription, memory, notifications, calendars, analytics, audit, uploads, authentication, and workspace isolation.

## Public route map

| Route | Purpose | Index policy |
| --- | --- | --- |
| `/` | Primary SaaS homepage | index |
| `/product` | Full capability map and platform architecture | index |
| `/meetings` | Meetings, rooms, agendas, realtime collaboration | index |
| `/webinars` | Webinar/event lifecycle and registration | index |
| `/scheduling` | Booking lifecycle and reservation management | index |
| `/memory` | Recording, transcription, memory, AI | index |
| `/integrations` | Provider adapters, calendars, API, webhooks | index |
| `/security` | Tenant, consent, data, reliability, AI boundaries | index |
| `/pricing` | Capability packaging without invented prices | index |
| `/demo` | Focused campaign/demo conversion journey backed by the durable lead API | index |
| `/contact` | Backend-persisted demo/contact enquiry | index |
| `/about` | Trust, clean-room approach, architecture principles | index |
| `/resources` | Public resource library | index |
| `/resources/agenda-led-meetings` | Agenda-led meeting guide | index |
| `/resources/webinar-lifecycle` | Webinar lifecycle guide | index |
| `/resources/scheduling-workflow` | Scheduling guide | index |
| `/search` | Accessible local public-site search | noindex |
| `/terms` | Terms-route implementation boundary pending verified production legal terms | index |
| `/privacy` | Current implementation privacy/data boundaries | index |
| `/accessibility` | Accessibility implementation and reporting route | index |
| `/consent` | Optional measurement preference controls | noindex |
| `/offline` | Explicit offline/retry state | noindex |
| `/error` | Explicit temporary-failure/retry state | noindex |
| `/thank-you` | Form-confirmation state | noindex |
| unknown route | Real production 404 + client not-found experience | noindex |
| `/events/:organization/:workspace/:event` | Dynamic published event and registration | dynamic |
| `/book/:organization/:workspace/:booking` | Dynamic slot/reservation/calendar/manage journey | dynamic |

## Product coverage represented by the public site

The public product story covers the repository-backed Sessions-like scope: HD/WebRTC meetings, reusable rooms, interactive/time-boxed agendas, embedded content patterns, co-browsing concepts, chat, reactions, polls, Q&A, whiteboards, breakout rooms, webinars and presenter roles, public registration, booking pages, calendar synchronization, recording, transcription, meeting memory, reviewable AI, multi-workspace/RBAC, branding, integrations, webhooks/API, and attendance/engagement analytics.

The marketing website does not pretend that a public marketing page itself performs authenticated workspace operations. Product CTAs enter the existing application, while public events and bookings remain direct public workflows.

## Lead acceptance contract

`POST /v1/public/marketing/leads` is the durable public enquiry endpoint.

1. Browser creates a UUID submission key and retains it for retries.
2. Client sends only approved form fields, source pathname, intent, and approved UTM keys.
3. Server validates type, length, email, consent, and honeypot state.
4. Server applies hashed email/IP rate limiting without persisting raw IP addresses.
5. One PostgreSQL transaction stores the lead and one `marketing.lead.received` outbox event.
6. The outbox dispatcher claims pending events with `SKIP LOCKED`, publishes them to the internal Redis event stream, and retries failures with exponential backoff/dead-letter handling.
7. A same-key/same-payload retry returns the same accepted business outcome without creating a second lead or outbox event.
8. A same-key/different-payload retry is rejected as a conflict.
9. The UI never displays success after a failed API request.

This specifically protects double-click, timeout, user retry, and dispatcher restart scenarios from creating duplicate accepted leads or duplicate accepted outbox events. An external CRM/email destination is intentionally not fabricated; the durable internal event is ready for a configured downstream consumer.

## Public event flow

```text
GET published event
  -> display branding, presenters, time, capacity and custom fields
  -> POST registration
  -> server validates + persists
  -> REGISTERED or WAITLISTED result
  -> reminder pipeline / attendance / analytics continue in backend
```

## Public booking flow

```text
GET booking page + slots
  -> choose server-provided slot
  -> submit invitee + intake answers
  -> POST reservation
  -> durable CONFIRMED reservation + management token
  -> generate ICS / reschedule / cancel using public management actions
  -> calendar/reminder/session workflow continues in backend
```

## Search, metadata, and crawl behavior

`site-manifest.json` is the public route registry. The website build generates route-specific HTML copies, canonical URLs, index/noindex metadata, `sitemap.xml`, `robots.txt`, and `404.html`. Runtime metadata also updates after client hydration, including dynamic event and booking titles.

Production nginx serves generated marketing routes directly. Unknown marketing URLs return an actual 404 instead of silently falling back to the homepage. Dynamic `/events/` and `/book/` routes intentionally retain the React fallback because their slug content comes from the API.

## Accessibility and responsive behavior

The site includes semantic navigation and landmarks, a skip link, persistent form labels, browser autocomplete hints, visible focus treatment, accessible error/success announcements, keyboard-usable disclosure controls, responsive layouts, reduced-motion handling, and content that remains understandable without animation.

The accessibility page describes the implementation target without claiming formal WCAG conformance that has not been independently verified.

## Consent and measurement

Essential product/public journeys do not require optional analytics or advertising consent. The consent page stores optional preferences locally and does not activate third-party SDKs by itself. No analytics or advertising provider is silently configured because the supplied project information does not include approved production account IDs, legal configuration, or measurement destinations.

## Truthful commercial content

The research describes capability tiers but does not provide a verified current commercial price list for this implementation. The plans page therefore describes capability packaging and uses enquiry/create-account actions instead of inventing prices, discounts, customer counts, certifications, testimonials, addresses, or availability.

## Release validation

The repository CI must pass:

- formatting and formatting check
- TypeScript/lint
- unit tests
- typecheck
- production builds
- Prisma client generation
- PostgreSQL migration smoke test

Before a real production launch, the operator must additionally verify the deployed domain/TLS, production URLs/CORS, secrets, backup/restore, live provider credentials, real email/calendar/media behavior, accessibility/manual browser checks, monitoring, and one real staff-handled enquiry. Provider access that has not been configured and tested is not reported as passed.
