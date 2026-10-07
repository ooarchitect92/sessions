# Public SaaS website implementation

## Scope
This implementation is intentionally limited to the customer-facing website. It does not redesign or add dashboard screens. The authenticated `frontend/` application remains the operational workspace; `website/` is the public acquisition and self-service surface.

The website covers the documented Sessions-like product story: meetings, reusable rooms, interactive agendas, content and co-browsing patterns, polls, Q&A, chat, whiteboards, breakouts, webinars, event registration, booking pages, recording, transcription, memory, AI assistance, branding, integrations, security, and analytics. Commercial facts not supported by the supplied research—especially exact numeric pricing—are not fabricated.

## Route map
| Route | Purpose |
| --- | --- |
| `/` | SaaS homepage and positioning |
| `/product` | Complete capability map and architecture |
| `/meetings` | Meetings, rooms, agendas, collaboration |
| `/webinars` | Webinar/event lifecycle and public registration |
| `/scheduling` | Booking lifecycle and reservation management |
| `/memory` | Recording, transcription, memory, AI |
| `/integrations` | Provider adapters, REST API, webhooks, calendars |
| `/security` | Isolation, consent, reliability, data and AI boundaries |
| `/pricing` | Capability packaging without invented prices |
| `/contact` | Backend-persisted demo/contact enquiry |
| `/events/:organization/:workspace/:event` | Existing dynamic event/registration flow |
| `/book/:organization/:workspace/:booking` | Existing booking/slots/reservation/ICS/manage flow |

## Working public flows
Contact/demo and product-update forms call `POST /v1/public/marketing/leads`. The API validates consent and spam honeypot fields and persists the lead in PostgreSQL before returning `RECEIVED`, so a browser-only success is never treated as a durable handoff.

Existing event pages remain connected to the published-event and registration APIs. Existing booking pages remain connected to live slots, reservation creation, ICS generation, cancellation, and rescheduling.

## Architecture alignment
- `website/`: public React/Vite frontend.
- `frontend/`: authenticated product workspace, unchanged in this scope.
- `backend/`: NestJS modular API.
- PostgreSQL/Prisma: durable registrations, reservations, and marketing leads.
- Existing realtime, media, recording, transcription, memory, notification, calendar, audit, and outbox modules remain the product implementation behind the public story.

## Release checks
Run repository type checks and tests, apply the Prisma migration, exercise a real marketing-lead submission, published event registration, and booking reservation including calendar and management actions. Verify production API/app URLs, CORS, TLS, monitoring, backups, and secrets before launch.
