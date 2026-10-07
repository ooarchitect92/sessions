export type MarketingRoute =
  | 'home' | 'product' | 'meetings' | 'webinars' | 'scheduling'
  | 'memory' | 'integrations' | 'security' | 'pricing' | 'contact';

export const features = [
  ['Live meetings','HD audio/video, screen sharing, speaker and gallery layouts, host controls, hand raise, reactions, waiting-room options, and reusable rooms.','◉'],
  ['Interactive agendas','Time-boxed agenda items can launch content, polls, Q&A, whiteboards, breakouts, or screen sharing while all participants stay synchronized.','↳'],
  ['Content & demos','Bring documents, videos, websites, approved embedded apps, and controlled co-browsing patterns into the live meeting flow.','▣'],
  ['Engagement','Polls, moderated Q&A, chat, collaborative whiteboards, and breakout rooms give participants practical ways to contribute.','✦'],
  ['Scheduling','Publish booking pages with availability, intake questions, notice periods, buffers, reservation management, and calendar invitations.','⌁'],
  ['Webinars','Create public event pages with presenters, custom registration fields, capacity, waitlists, reminders, and webinar-style roles.','◎'],
  ['Meeting memory','Keep recording, transcript, agenda, chat, poll outcomes, summary, decisions, and actions associated with one session.','◫'],
  ['AI copilot','Use reviewable AI for agenda drafts, summaries, decisions, action items, questions, and follow-up drafts without silent external actions.','✧'],
  ['Workspaces & RBAC','Separate teams, brands, templates, permissions, and business data with organization and workspace boundaries.','◇'],
  ['Branding','Use workspace branding, public event and booking experiences, notification templates, and domain-ready routing.','◐'],
  ['Integrations & API','Connect Google and Microsoft calendars, embedded apps, REST APIs, signed webhooks, and replaceable provider adapters.','↔'],
  ['Analytics','Measure registrations, attendance, no-shows, engagement, duration, booking conversion, and operational usage from authoritative events.','⌗'],
] as const;

export const workflow = [
  ['01','Prepare','Create a room, meeting, webinar, or booking page. Shape the agenda, attach content, invite people, and set recording/transcription policy.'],
  ['02','Bring people in','Participants arrive through a secure invitation, public registration page, booking confirmation, or permanent room.'],
  ['03','Run','Coordinate video, content, agenda state, chat, polls, Q&A, whiteboards, breakouts, and host moderation in realtime.'],
  ['04','Remember','Recordings and transcripts become structured session memory with context, summaries, decisions, and action items.'],
  ['05','Follow through','Deliver reminders and calendar updates, manage reservations, trigger signed webhooks, and connect outcomes to other systems.'],
] as const;

export const security = [
  ['Tenant-aware authorization','Workspace-scoped access, least-privilege roles, tenant-safe queries, and boundaries across durable data, realtime state, and artifacts.'],
  ['Consent before capture','Recording and transcription are explicit capabilities with visible disclosure and auditable consent decisions.'],
  ['Protected transport & storage','TLS in transit, managed encrypted storage, controlled artifact delivery, secrets outside source code, and scoped service credentials.'],
  ['Safer embedded content','External content is resolved intentionally with sandboxing and permission boundaries instead of unrestricted browser access.'],
  ['Reliable external effects','Durable database state is committed before notifications, calendar updates, webhooks, or other provider effects are acknowledged.'],
  ['Human-controlled AI','AI is provider-abstracted, reviewable, and prevented from silently making external changes on a user’s behalf.'],
] as const;

export const integrations = [
  ['Calendar & identity',['Google Calendar','Microsoft 365','OAuth / OIDC','ICS invites']],
  ['Content & collaboration',['Google Drive','Figma','Miro','Canva','Notion','YouTube / Vimeo']],
  ['Automation',['REST API','Signed webhooks','CRM adapters','Workflow connectors']],
  ['Platform services',['LiveKit-compatible media','Object storage','Speech-to-text','Pluggable LLM providers']],
] as const;
