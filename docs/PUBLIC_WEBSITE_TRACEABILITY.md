# Public website requirement traceability

This register maps the supplied Website Master Blueprint and Sessions-like research into the public-website implementation. It intentionally separates **Implemented**, **Repository-backed**, **Not activated**, and **Out of scope by user instruction**.

| Requirement area | Status | Implementation / evidence |
| --- | --- | --- |
| Public SaaS homepage and product routes | Implemented | `website/src/MarketingSite.tsx`, `site-manifest.json` |
| Professional responsive design system | Implemented | `website/src/styles.css`, semantic React components |
| Meetings / rooms / agendas positioning | Implemented + repository-backed | public pages + sessions/rooms/agendas backend modules |
| Polls / chat / Q&A / whiteboard / breakouts | Implemented as product story + repository-backed | collaboration, whiteboards, breakouts modules |
| Webinar public page | Implemented + live public API | `PublicEventPage.tsx`, `PublicEventsController` |
| Event custom registration | Implemented + live public API | dynamic form fields + event registrations |
| Event presenters / capacity / waitlist / reminders | Repository-backed | events + notification modules; surfaced publicly where applicable |
| Scheduling / booking page | Implemented + live public API | `PublicBookingPage.tsx`, public booking controller |
| Slots / intake / reservation / ICS / cancel / reschedule | Implemented + live public API | booking service and public page |
| Recording / transcription / memory / reviewable AI | Repository-backed + public product pages | recordings/transcription/memory/AI modules |
| Calendar integrations | Repository-backed | Google/Microsoft calendar modules/adapters |
| Analytics | Repository-backed + surfaced | attendance/engagement analytics foundation from main |
| REST/API architecture | Repository-backed + documented | NestJS `/v1` API and public route documentation |
| Durable enquiry/contact form | Implemented | marketing controller/service + PostgreSQL transaction |
| Lead retry idempotency | Implemented | UUID `submissionKey`, request hash, unique DB constraint |
| Lead + outbox atomicity | Implemented | one transaction creates the accepted lead, consent evidence, audit record and `marketing.lead.received` event |
| Consent evidence | Implemented | versioned purpose + server-derived statement hash stored per accepted lead |
| Safe receipt contract | Implemented | post-commit receipt reference + conversion event ID; no unnecessary PII in response |
| Attribution allowlist | Implemented | server keeps only approved action/intent/UTM string fields and discards arbitrary metadata |
| Durable lead event dispatch | Implemented | Redis stream dispatcher with claim locking, retries, backoff and dead-letter state |
| Public-form abuse control | Implemented | honeypot + hashed Redis rate limiting |
| Do not falsely acknowledge failed lead | Implemented | UI success only after successful API result |
| Data minimization for campaign context | Implemented | path + approved UTM/intent keys only |
| Optional consent preferences | Implemented | `ConsentPreferences.tsx`; no SDK auto-activation |
| Resources/content route family | Implemented | resource index + three detailed workflow guides |
| About/trust route | Implemented | `/about` |
| Focused campaign/demo landing route | Implemented | `/demo` with one dominant demo-request action and durable lead backend |
| Search route | Implemented | accessible public route/content search |
| Utility states | Implemented | 404, error, offline, thank-you, form error/success/loading |
| Correct production unknown-route 404 | Implemented | generated `404.html` + nginx `try_files ... =404` |
| Titles/descriptions/canonicals | Implemented | site manifest + runtime head + build-time route HTML |
| Sitemap and robots | Implemented | generated during website build |
| Responsive/keyboard/reduced motion | Implemented | styles + semantic interactions |
| Exact commercial prices | Not supplied / not invented | plans use enquiry path and explicit note |
| Testimonials/customer counts/certifications | Not supplied / not invented | deliberately absent |
| Third-party analytics / ads tags | Not activated | requires approved production accounts, consent/legal settings |
| CRM destination for marketing leads | Not activated | durable internal outbox event is published; no verified CRM/email destination was supplied |
| Formal accessibility conformance claim | Not claimed | target described; manual/independent evidence still required |
| Terms route | Implemented without fabricated legal commitments | `/terms` clearly separates implementation boundaries from operator-approved legal terms |
| Production legal policy text | Not invented | privacy/terms pages mark deployment-specific legal review requirements |
| Authenticated dashboard/owner console redesign | **Out of scope by explicit user instruction** | `frontend/` is not modified by this public website work |
| Proprietary Sessions code/assets | Not used | clean-room implementation |

## End-to-end release evidence expected

A website release is considered ready for merge only when repository CI passes and the branch remains isolated from `main` until review. A production launch still requires environment-specific proof for TLS, secrets, real provider credentials, backup/restore, monitoring, actual form delivery handling, and representative accessibility/browser testing.


## Explicit scope exceptions from the Website Master Blueprint

The Website Master Blueprint includes an owner console/CMS and owner-operational workflows as part of its reusable full-platform standard. For this project, the user explicitly instructed that the authenticated dashboard/owner console must **not** be built or changed. To avoid silent omission, the following blueprint areas are therefore recorded as deliberate scope exceptions rather than claimed as implemented by this PR:

- Owner console and CMS editing interfaces, including page-builder/editor workflows.
- Editorial assignments, draft conflict resolution, publish/rollback UI, and media-management screens.
- Owner lead-management screens, saved views, bulk actions, and operator inbox workflows.
- Owner-side experiment, workflow, UTM, and reporting controls.
- Any authenticated dashboard redesign or new dashboard route.

Public-facing requirements from those chapters remain applicable where they affect the visitor experience. This PR therefore implements the public routes, accessible states, forms, booking/event journeys, consent/privacy behavior, SEO, and backend business transactions while leaving authenticated owner interfaces untouched.

## Production-environment evidence still required

Repository CI proves source-level migration, formatting, lint, typecheck, unit-test, and production-build correctness. It does not by itself prove environment-specific operations. Before production launch, the operator must still attach evidence for deployed TLS/domain configuration, production secrets, backup/restore rehearsal, monitoring/alert routing, approved CRM/email/provider credentials, representative accessibility testing, browser/device checks, and any activated analytics/advertising consent configuration.
