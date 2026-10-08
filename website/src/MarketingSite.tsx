import { useEffect, useMemo, useState } from 'react';
import { ConsentPreferences } from './ConsentPreferences';
import { MarketingLeadForm } from './MarketingLeadForm';
import { features, integrations, security, workflow } from './marketing-data';
import { applyMarketingHead } from './site-head';
import { routeDefinitions, type MarketingRoute } from './site-routes';

const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:3000';

const resources = [
  {
    route: 'resource-agenda' as const,
    href: '/resources/agenda-led-meetings',
    eyebrow: 'Meeting design',
    title: 'How agenda-led meetings keep everyone in the same flow',
    summary:
      'Use a time-boxed agenda as live meeting state, not as a document that sits beside the call.',
  },
  {
    route: 'resource-webinars' as const,
    href: '/resources/webinar-lifecycle',
    eyebrow: 'Webinar operations',
    title: 'The complete webinar lifecycle from public page to follow-through',
    summary:
      'Connect registration, presenter context, reminders, live engagement, attendance, and memory.',
  },
  {
    route: 'resource-scheduling' as const,
    href: '/resources/scheduling-workflow',
    eyebrow: 'Scheduling',
    title: 'Build a booking flow that survives real calendar complexity',
    summary:
      'Treat availability, intake, reservation, calendar delivery, cancellation, and rescheduling as one lifecycle.',
  },
] as const;

function Header({ route }: { route: MarketingRoute }) {
  const nav = [
    ['/product', 'Product', 'product'],
    ['/meetings', 'Meetings', 'meetings'],
    ['/webinars', 'Webinars', 'webinars'],
    ['/scheduling', 'Scheduling', 'scheduling'],
    ['/pricing', 'Plans', 'pricing'],
    ['/security', 'Security', 'security'],
  ] as const;
  return (
    <header className="m-header">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell nav">
        <a className="brand" href="/" aria-label="Sessions home">
          <span>S</span>
          <b>Sessions</b>
        </a>
        <nav aria-label="Primary">
          {nav.map(([href, label, key]) => (
            <a key={href} href={href} aria-current={route === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a href="/search" aria-label="Search the Sessions website">
            Search
          </a>
          <a href={`${appUrl}/login`}>Log in</a>
          <a
            className="btn primary sm"
            href={`${appUrl}/signup`}
            data-action-id="header_get_started"
          >
            Get started <span aria-hidden="true">→</span>
          </a>
        </div>
        <details className="mobile-menu">
          <summary>Menu</summary>
          <div>
            <a href="/product">Product</a>
            <a href="/meetings">Meetings</a>
            <a href="/webinars">Webinars</a>
            <a href="/scheduling">Scheduling</a>
            <a href="/memory">AI & Memory</a>
            <a href="/integrations">Integrations</a>
            <a href="/pricing">Plans</a>
            <a href="/security">Security</a>
            <a href="/resources">Resources</a>
            <a href="/about">About</a>
            <a href="/search">Search</a>
            <a href="/contact">Contact</a>
            <a href={`${appUrl}/login`}>Log in</a>
          </div>
        </details>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="m-footer">
      <div className="shell footer-grid">
        <div className="footer-intro">
          <a className="brand light" href="/">
            <span>S</span>
            <b>Sessions</b>
          </a>
          <p>
            Plan, run, and remember high-value meetings and events in one guided workflow.
          </p>
          <MarketingLeadForm kind="NEWSLETTER" compact submitLabel="Get product updates" />
        </div>
        <div>
          <b>Product</b>
          <a href="/product">Overview</a>
          <a href="/meetings">Meetings</a>
          <a href="/webinars">Webinars</a>
          <a href="/scheduling">Scheduling</a>
          <a href="/memory">AI & Memory</a>
        </div>
        <div>
          <b>Platform</b>
          <a href="/integrations">Integrations & API</a>
          <a href="/security">Security & Trust</a>
          <a href="/pricing">Plans</a>
          <a href="/resources">Resources</a>
          <a href="/about">About</a>
        </div>
        <div>
          <b>Help & policies</b>
          <a href="/demo">Request a demo</a>
          <a href="/contact">Contact</a>
          <a href="/search">Search</a>
          <a href="/terms">Terms information</a>
          <a href="/privacy">Privacy information</a>
          <a href="/accessibility">Accessibility</a>
          <a href="/consent">Consent preferences</a>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 Sessions. Independent clean-room product.</span>
        <span>Public website and self-service journeys are separate from the authenticated workspace.</span>
      </div>
    </footer>
  );
}

function Preview() {
  return (
    <div className="preview" aria-label="Illustration of an agenda-led meeting workspace">
      <div className="preview-bar">
        <i />
        <i />
        <i />
        <span>Customer discovery · Live</span>
        <b>00:32:18</b>
      </div>
      <div className="preview-body">
        <aside>
          <small>AGENDA · 42 MIN</small>
          {[
            ['1', 'Context', '5 min'],
            ['2', 'Product demo', '18 min'],
            ['3', 'Questions', '10 min'],
            ['4', 'Next steps', '9 min'],
          ].map((item, index) => (
            <div className={index === 1 ? 'active' : index === 0 ? 'done' : ''} key={item[0]}>
              <b>{item[0]}</b>
              <span>
                <strong>{item[1]}</strong>
                <small>{item[2]}</small>
              </span>
            </div>
          ))}
        </aside>
        <section>
          <span className="stage-label">SHARED CONTENT</span>
          <div className="stage-card">
            <small>Prototype walkthrough</small>
            <strong>Show the real product while the agenda keeps everyone aligned.</strong>
            <i />
            <i />
            <i />
          </div>
          <div className="people">
            <span>BM</span>
            <span>SK</span>
            <span>JR</span>
            <b>+8</b>
          </div>
        </section>
        <aside className="notes">
          <small>LIVE NOTES</small>
          <div>
            <b>Decision</b>
            <p>Move beta launch to 18 Oct.</p>
          </div>
          <div>
            <b>Poll</b>
            <p>7 of 9 answered.</p>
          </div>
          <div>
            <b>Action</b>
            <p>Share revised onboarding flow.</p>
          </div>
        </aside>
      </div>
      <div className="preview-tools" aria-hidden="true">
        <span>◉</span>
        <span>⌁</span>
        <b>Share</b>
        <span>✧</span>
        <span>☰</span>
        <i>Leave</i>
      </div>
    </div>
  );
}

function Hero({
  eyebrow,
  title,
  copy,
  visual = true,
  primary = 'Get started',
  primaryHref,
  secondary = 'Explore product',
  secondaryHref = '/product',
}: {
  eyebrow: string;
  title: string;
  copy: string;
  visual?: boolean;
  primary?: string;
  primaryHref?: string;
  secondary?: string;
  secondaryHref?: string;
}) {
  return (
    <section className={visual ? 'hero shell' : 'page-hero shell'}>
      <div className="hero-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
        <div className="actions">
          <a
            className="btn primary"
            href={primaryHref ?? `${appUrl}/signup`}
            data-action-id="hero_primary"
          >
            {primary} <span aria-hidden="true">→</span>
          </a>
          <a className="btn secondary" href={secondaryHref} data-action-id="hero_secondary">
            {secondary}
          </a>
        </div>
        <div className="proof">
          <span>
            <b>Agenda-led</b>
            <small>Keep every session on purpose.</small>
          </span>
          <span>
            <b>Human-controlled AI</b>
            <small>Review before external action.</small>
          </span>
          <span>
            <b>Full lifecycle</b>
            <small>Before, during, and after.</small>
          </span>
        </div>
      </div>
      {visual ? <Preview /> : null}
    </section>
  );
}

function SectionTitle({
  eyebrow,
  title,
  copy,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? 'section-title dark-title' : 'section-title'}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {copy ? <p>{copy}</p> : null}
    </div>
  );
}

function FeatureGrid({ limit }: { limit?: number }) {
  return (
    <div className="feature-grid">
      {features.slice(0, limit ?? features.length).map(([title, copy, icon], index) => (
        <article key={title}>
          <span className="f-icon" aria-hidden="true">
            {icon}
          </span>
          <small>{String(index + 1).padStart(2, '0')}</small>
          <h3>{title}</h3>
          <p>{copy}</p>
        </article>
      ))}
    </div>
  );
}

function Workflow() {
  return (
    <section className="section workflow">
      <div className="shell">
        <SectionTitle
          eyebrow="End-to-end workflow"
          title="One journey from invitation to follow-through."
          copy="Scheduling, live collaboration, recording, memory, and integrations work as one system instead of disconnected tools."
        />
        <div className="workflow-grid">
          {workflow.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section className="section architecture">
      <div className="shell">
        <SectionTitle
          dark
          eyebrow="Platform architecture"
          title="Clear boundaries for business state, realtime collaboration, media, and memory."
          copy="The current project uses a NestJS business API, PostgreSQL, realtime synchronization, WebRTC media, object storage, workers, and provider adapters so workloads can evolve independently."
        />
        <div className="arch-grid">
          <article>
            <span>CONTROL PLANE</span>
            <h3>Business API</h3>
            <p>
              Identity, workspaces, roles, rooms, sessions, agendas, events, bookings, policy, and
              stable API contracts.
            </p>
          </article>
          <article>
            <span>REALTIME PLANE</span>
            <h3>Live collaboration</h3>
            <p>
              Presence, agenda state, chat, polls, Q&A, whiteboards, breakouts, and session
              signaling.
            </p>
          </article>
          <article>
            <span>MEDIA PLANE</span>
            <h3>WebRTC & recording</h3>
            <p>
              Audio, video, screen share, SFU/TURN connectivity, egress, and recorded media
              artifacts.
            </p>
          </article>
          <article>
            <span>MEMORY PLANE</span>
            <h3>Transcript & AI</h3>
            <p>
              Recordings, speech-to-text, searchable memory, summaries, decisions, actions, and
              reviewable AI output.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final-cta">
      <div className="shell">
        <span className="eyebrow">Ready when your workflow is</span>
        <h2>Bring the whole meeting lifecycle into one system.</h2>
        <p>
          Start in the product, or tell us what you need for meetings, webinars, scheduling,
          security, branding, or integrations.
        </p>
        <div className="actions">
          <a className="btn lime" href={`${appUrl}/signup`} data-action-id="final_get_started">
            Get started →
          </a>
          <a className="btn ghost" href="/demo" data-action-id="final_request_demo">
            Request a demo
          </a>
        </div>
      </div>
    </section>
  );
}

function Home() {
  return (
    <>
      <Hero
        eyebrow="Meetings, webinars, scheduling, and memory"
        title="Make every session easier to run — and harder to forget."
        copy="Sessions brings video, interactive agendas, embedded content, engagement tools, scheduling, public events, recording, transcription, and reviewable AI into one guided meeting lifecycle."
      />
      <section className="section shell">
        <SectionTitle
          eyebrow="One platform"
          title="Replace the meeting-tool maze with a continuous workflow."
          copy="Use purpose-built capabilities before, during, and after the live conversation."
        />
        <FeatureGrid limit={6} />
        <a className="inline-link" href="/product">
          Explore the complete product →
        </a>
      </section>
      <Workflow />
      <section className="section shell spotlight">
        <div className="spot-card">
          <span>02 · CURRENT</span>
          <strong>Walk through the prototype</strong>
          <p>18 minutes · embedded content · host controlled</p>
          <span className="preview-next">Next: Prioritize decisions →</span>
        </div>
        <div>
          <span className="eyebrow">Interactive agenda</span>
          <h2>The agenda is part of the meeting, not a document nobody opens.</h2>
          <p>
            Time-boxed agenda items control the live flow and can activate content, polls, Q&A,
            whiteboards, breakouts, or screen sharing for everyone.
          </p>
          <ul>
            <li>Shared realtime agenda state</li>
            <li>Content-aware session segments</li>
            <li>Reusable agenda patterns</li>
            <li>Durable event history</li>
          </ul>
        </div>
      </section>
      <section className="section soft">
        <div className="shell">
          <SectionTitle
            eyebrow="Built for real work"
            title="Sales demos, onboarding, training, workshops, coaching, and customer sessions."
          />
          <div className="solution-grid">
            {[
              ['Sales & demos', 'Reusable agendas, product content, questions, decisions, and searchable memory.', '/meetings'],
              ['Customer onboarding', 'Rooms, files, whiteboards, actions, and repeatable onboarding flow.', '/meetings'],
              ['Training & webinars', 'Presenter-led sessions, polls, Q&A, breakouts, registration, and recordings.', '/webinars'],
              ['Coaching & consultations', 'Booking, intake, calendar invite, meeting, and outcome in one lifecycle.', '/scheduling'],
            ].map(([title, copy, href]) => (
              <a key={title} href={href}>
                <span aria-hidden="true">↗</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
      <Architecture />
      <section className="section shell faq-section">
        <SectionTitle
          eyebrow="Helpful questions"
          title="Understand the product before you start."
          copy="These answers describe the implemented architecture and documented product scope without inventing commercial or compliance claims."
        />
        {[
          ['Is this only a video meeting tool?', 'No. The product model connects meetings, interactive agendas, collaboration, webinars, booking pages, recording, transcription, memory, AI assistance, and integrations.'],
          ['Can public registration and booking pages work without the dashboard?', 'Yes. Public event and booking routes are separate website journeys backed by the same NestJS API and PostgreSQL data.'],
          ['Does the website publish exact prices?', 'Not yet. The supplied research describes tiered quotas but does not provide an approved current price list, so the public site uses an enquiry path instead of fabricating prices.'],
          ['Does AI make changes automatically?', 'The documented design treats AI output as reviewable assistance. External actions remain user-controlled.'],
        ].map(([question, answer]) => (
          <details key={question} className="faq-item">
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <FinalCta />
    </>
  );
}

function Product() {
  return (
    <>
      <Hero
        visual={false}
        eyebrow="Product overview"
        title="Everything the meeting needs — before, during, and after."
        copy="The public site surfaces the complete Sessions-like capability map while the authenticated product stays in the existing application. Public events and bookings remain connected to real backend workflows."
        secondary="Request a demo"
        secondaryHref="/demo"
      />
      <section className="section shell">
        <SectionTitle eyebrow="Capability map" title="Full product coverage in one public overview." />
        <FeatureGrid />
      </section>
      <Workflow />
      <Architecture />
      <FinalCta />
    </>
  );
}

function Meetings() {
  return (
    <>
      <Hero
        eyebrow="Meetings & rooms"
        title="Run a meeting like a guided workspace, not a video call surrounded by tabs."
        copy="Bring video, screen sharing, a persistent agenda, embedded content, chat, polls, Q&A, whiteboards, breakout rooms, recording, transcription, and host controls into one synchronized session."
        secondary="See AI & memory"
        secondaryHref="/memory"
      />
      <section className="section shell">
        <div className="detail-grid">
          {[
            ['01', 'Permanent rooms', 'Stable links can carry reusable settings, default agendas, branding, host rules, waiting experience, and recording defaults.'],
            ['02', 'Host-led agenda state', 'Move participants through a shared sequence of content and interaction with the current agenda item synchronized in realtime.'],
            ['03', 'Participation tools', 'Use chat, reactions, polls, Q&A, whiteboards, and breakouts while hosts retain role and moderation boundaries.'],
            ['04', 'Durable meeting record', 'Recording, transcript, agenda, chat, polls, decisions, and actions stay connected after the call ends.'],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section architecture">
        <div className="shell realtime">
          <SectionTitle
            dark
            eyebrow="Realtime architecture"
            title="Use the right channel for the right state."
            copy="WebRTC carries media. WebSockets synchronize live collaboration. HTTP handles durable CRUD, uploads, artifacts, and administration."
          />
          <div className="stack" aria-label="Meeting architecture diagram">
            <b>Browser client</b>
            <i>HTTPS · WebSocket · WebRTC</i>
            <div>
              <span>Business API</span>
              <span>Realtime sync</span>
            </div>
            <i>purpose-specific paths</i>
            <div>
              <span>PostgreSQL</span>
              <span>Media / storage</span>
            </div>
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}

function Webinars() {
  return (
    <>
      <Hero
        eyebrow="Webinars & public events"
        title="From event page to live audience — without stitching the journey together later."
        copy="Publish a branded event page, show presenters and event context, collect custom registration fields, manage capacity or waitlists, schedule reminders, and run webinar-style roles with Q&A and polls."
        secondary="Talk to us"
        secondaryHref="/contact?intent=webinars"
      />
      <section className="section shell">
        <div className="detail-grid">
          {[
            ['01', 'Publish', 'Create a public event route with title, timing, presenters, branding, capacity, and custom registration fields.'],
            ['02', 'Register', 'Persist attendee registration and return registered or waitlisted status from the backend.'],
            ['03', 'Remind', 'Use durable reminder templates and delivery reconciliation rather than treating browser success as delivery proof.'],
            ['04', 'Run & measure', 'Host presenters, moderate engagement, and retain attendance and session evidence for follow-through.'],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <RouteFlow
        title="A public registration path already exists in the product."
        route="/events/:organization/:workspace/:event"
        api="GET /v1/public/.../events/:event → POST .../registrations"
      />
      <FinalCta />
    </>
  );
}

function Scheduling() {
  return (
    <>
      <Hero
        eyebrow="Scheduling & booking pages"
        title="Let someone pick a time — then carry the booking all the way into the meeting."
        copy="Publish booking pages with duration, availability rules, notice periods, buffers, intake questions, slot reservation, calendar invites, cancellation, and rescheduling."
        secondary="Request a demo"
        secondaryHref="/contact?intent=scheduling"
      />
      <section className="section shell">
        <SectionTitle
          eyebrow="Booking lifecycle"
          title="A real reservation, not a calendar-looking form."
          copy="The existing public booking journey reads availability from the API, reserves the chosen slot, and supports calendar generation plus attendee management actions."
        />
        <div className="flow-line">
          {['Availability rules', 'Public slots', 'Intake form', 'Confirmed reservation', 'Calendar & reminders', 'Session'].map(
            (item, index) => (
              <span key={item}>
                {item}
                {index < 5 ? <i aria-hidden="true">→</i> : null}
              </span>
            ),
          )}
        </div>
      </section>
      <RouteFlow
        dark
        title="Booking pages are backend-connected."
        route="/book/:organization/:workspace/:booking"
        api="GET .../slots → POST .../reservations → calendar / cancel / reschedule"
      />
      <FinalCta />
    </>
  );
}

function Memory() {
  return (
    <>
      <Hero
        eyebrow="Recording, transcription & AI"
        title="Turn the call into a memory people can actually use."
        copy="Keep recording, transcript, agenda context, chat, poll outcomes, summaries, decisions, and action items connected to the session. AI can help transform the transcript while people stay in control."
        secondary="Security approach"
        secondaryHref="/security"
      />
      <section className="section shell">
        <div className="detail-grid">
          {[
            ['01', 'Capture with consent', 'Recording and transcription follow explicit session settings and participant disclosure.'],
            ['02', 'Process asynchronously', 'Media moves through storage and speech-to-text workflows without blocking the live meeting.'],
            ['03', 'Structure the memory', 'Transcript, agenda, recording, polls, chat, summary, decisions, and actions remain associated with one session.'],
            ['04', 'Review AI output', 'Summaries and draft follow-ups are reviewable, with provider abstraction and no silent external action.'],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <Architecture />
      <FinalCta />
    </>
  );
}

function Integrations() {
  return (
    <>
      <Hero
        visual={false}
        eyebrow="Integrations & API"
        title="Keep the platform connected without making one provider the architecture."
        copy="Calendar providers, content tools, media, object storage, transcription, AI, REST APIs, and signed webhooks sit behind explicit interfaces so integrations can change without replacing the core business model."
        secondary="Security approach"
        secondaryHref="/security"
      />
      <section className="section shell">
        <div className="integration-grid">
          {integrations.map(([title, items]) => (
            <article key={title}>
              <span aria-hidden="true">↔</span>
              <h3>{title}</h3>
              {items.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </article>
          ))}
        </div>
      </section>
      <section className="section soft">
        <div className="shell webhook">
          <SectionTitle
            eyebrow="Automation boundary"
            title="Signed events for external workflows."
            copy="The architecture supports REST endpoints and HMAC-signed webhook delivery with retries for meaningful lifecycle events."
          />
          <div className="chips">
            {[
              'session.started',
              'session.ended',
              'participant.joined',
              'recording.ready',
              'transcript.ready',
              'booking.created',
              'booking.rescheduled',
              'event.registration.created',
            ].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}

function Security() {
  return (
    <>
      <Hero
        visual={false}
        eyebrow="Security & trust"
        title="Trust belongs in the product architecture, not in a badge row."
        copy="The platform is designed around tenant boundaries, least privilege, consent-aware recording, protected storage, strict embedded-content boundaries, signed integrations, auditability, and recovery discipline."
        primary="Talk to us"
        primaryHref="/contact?intent=security"
      />
      <section className="section shell">
        <div className="security-grid">
          {security.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section architecture">
        <div className="shell policy">
          <SectionTitle dark eyebrow="Data boundaries" title="Keep purpose, identity, and retention explicit." />
          <div>
            <p>
              Recording and transcript data should not be pushed into generic analytics or
              advertising payloads. Sensitive data handling, retention, export, deletion, and provider
              configuration require explicit purpose and tests.
            </p>
            <p>
              This website does not claim fabricated certifications or universal legal compliance.
              Production compliance depends on the actual deployment, providers, contracts, regions,
              and verified controls.
            </p>
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}

function Pricing() {
  const plans = [
    [
      'Starter',
      'For individuals and small teams proving the workflow',
      ['Meetings and reusable rooms', 'Interactive agendas', 'Booking and event pages', 'Core collaboration tools', 'Session memory'],
      'Create an account',
      `${appUrl}/signup`,
    ],
    [
      'Team',
      'For teams running repeatable customer-facing sessions',
      ['Everything in Starter', 'Multiple workspaces', 'Advanced branding', 'Integrations and webhooks', 'Expanded reporting'],
      'Talk to sales',
      '/contact?intent=pricing',
    ],
    [
      'Business',
      'For organizations with stronger governance needs',
      ['Everything in Team', 'Identity and access options', 'Custom-domain readiness', 'Governance and audit controls', 'Deployment and support planning'],
      'Plan your rollout',
      '/contact?intent=business',
    ],
  ] as const;
  return (
    <>
      <Hero
        visual={false}
        eyebrow="Plans & rollout"
        title="Choose the capability level. Approve the commercial price separately."
        copy="The research describes tiered quotas and higher-tier capabilities but does not provide an authoritative current price list. This website therefore avoids inventing prices."
        secondary="Talk to sales"
        secondaryHref="/contact?intent=pricing"
      />
      <section className="section shell">
        <div className="plans">
          {plans.map(([name, audience, list, cta, href], index) => (
            <article className={index === 1 ? 'featured' : ''} key={name}>
              {index === 1 ? <span className="plan-tag">Recommended for teams</span> : null}
              <small>{audience}</small>
              <h2>{name}</h2>
              <p>
                {index === 0
                  ? 'Core meeting, agenda, public-event, booking, and memory capabilities.'
                  : index === 1
                    ? 'Richer workspace operations, branding, automation, integrations, and reporting when configured.'
                    : 'Negotiated identity, domain, governance, support, and higher-capacity requirements.'}
              </p>
              <ul>
                {list.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
              <a className={index === 1 ? 'btn primary wide' : 'btn secondary wide'} href={href}>
                {cta} →
              </a>
            </article>
          ))}
        </div>
        <p className="pricing-note">
          Final quotas, billing cadence, taxes, discounts, support terms, and contractual
          commitments must be approved before publication.
        </p>
      </section>
      <FinalCta />
    </>
  );
}

function Demo() {
  return (
    <>
      <Hero
        visual={false}
        eyebrow="Focused product demo"
        title="See the complete meeting lifecycle in one guided walkthrough."
        copy="Use this focused demo path to tell us which workflow matters most: meetings, webinars, scheduling, recording and memory, security, branding, or integrations. The request is only confirmed after the backend durably accepts it."
        primary="Request your demo"
        primaryHref="#demo-request"
        secondary="Explore product first"
        secondaryHref="/product"
      />
      <section className="section shell demo-journey">
        <SectionTitle
          eyebrow="What the walkthrough can cover"
          title="Start with your use case, then follow the end-to-end flow."
          copy="The demo route is deliberately focused on one conversion action rather than sending visitors through an unrelated dashboard."
        />
        <div className="detail-grid">
          {[
            ['01', 'Before the session', 'Booking pages, event registration, room setup, agendas, reminders, calendars, and intake.'],
            ['02', 'During the session', 'Video, screen sharing, agenda state, embedded content, polls, Q&A, chat, whiteboards, and breakouts.'],
            ['03', 'After the session', 'Recording, transcription, searchable memory, summaries, decisions, actions, and analytics.'],
            ['04', 'Platform controls', 'Workspace isolation, permissions, integrations, APIs, webhooks, branding, and security boundaries.'],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section shell contact" id="demo-request">
        <div>
          <span className="eyebrow">Demo request</span>
          <h2>Tell us what you want to evaluate.</h2>
          <p>
            The request uses the same durable public lead pipeline as the contact page, including
            server validation, consent, idempotency, rate limiting, PostgreSQL persistence, and the
            lead outbox event.
          </p>
        </div>
        <div className="contact-card">
          <MarketingLeadForm
            kind="DEMO"
            title="Request a Sessions walkthrough"
            submitLabel="Request demo"
          />
        </div>
      </section>
    </>
  );
}

function Contact() {
  return (
    <section className="section shell contact">
      <div>
        <span className="eyebrow">Contact & demo</span>
        <h1>Tell us how your team meets today.</h1>
        <p>
          Share the workflow you want to improve. The form only shows success after the backend
          has durably accepted the enquiry.
        </p>
        <div className="contact-points">
          <span>
            <b>Meetings</b>Agenda-led collaboration and reusable rooms
          </span>
          <span>
            <b>Webinars</b>Registration, presenters, reminders, and engagement
          </span>
          <span>
            <b>Scheduling</b>Availability, intake, reservations, and calendars
          </span>
          <span>
            <b>Platform</b>Security, integrations, API, branding, and rollout
          </span>
        </div>
      </div>
      <div className="contact-card">
        <MarketingLeadForm
          kind="DEMO"
          title="Request a product conversation"
          submitLabel="Submit request"
        />
      </div>
    </section>
  );
}

function About() {
  return (
    <>
      <Hero
        visual={false}
        eyebrow="About the build"
        title="A clean-room platform built around the complete meeting lifecycle."
        copy="The product is based on public research into the Sessions workflow and the repository’s own modular architecture. It does not copy proprietary code, private assets, or undocumented commercial claims."
        primary="Explore the product"
        primaryHref="/product"
        secondary="Read resources"
        secondaryHref="/resources"
      />
      <section className="section shell">
        <SectionTitle
          eyebrow="Product principles"
          title="Useful boundaries make the platform easier to trust and evolve."
        />
        <div className="trust-grid">
          {[
            ['One lifecycle', 'Scheduling, live collaboration, event operations, memory, and follow-through share the same product model.'],
            ['Clean-room implementation', 'Public research informs functionality while code, content, and visual language are independently implemented.'],
            ['Durable business state', 'PostgreSQL remains authoritative for accepted registrations, reservations, leads, and product records.'],
            ['Replaceable providers', 'Media, storage, email, calendars, speech-to-text, and AI sit behind explicit service boundaries.'],
            ['No invented proof', 'The public site avoids fabricated customers, prices, certifications, addresses, or compliance badges.'],
            ['Dashboard boundary', 'This website work intentionally leaves the authenticated operational dashboard unchanged.'],
          ].map(([title, copy]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <Architecture />
      <FinalCta />
    </>
  );
}

function Resources() {
  return (
    <>
      <Hero
        visual={false}
        eyebrow="Resources"
        title="Practical guides for the workflows the platform is built to support."
        copy="Use these short guides to understand how agenda-led meetings, webinar operations, and scheduling fit together before you configure the product."
        primary="Explore product"
        primaryHref="/product"
        secondary="Search resources"
        secondaryHref="/search"
      />
      <section className="section shell">
        <div className="resource-grid">
          {resources.map((resource) => (
            <article key={resource.href}>
              <span className="eyebrow">{resource.eyebrow}</span>
              <h2>{resource.title}</h2>
              <p>{resource.summary}</p>
              <a href={resource.href}>Read guide →</a>
            </article>
          ))}
        </div>
      </section>
      <FinalCta />
    </>
  );
}

function ResourceArticle({ route }: { route: 'resource-agenda' | 'resource-webinars' | 'resource-scheduling' }) {
  const article =
    route === 'resource-agenda'
      ? {
          eyebrow: 'Meeting design',
          title: 'How agenda-led meetings keep everyone in the same flow',
          intro:
            'A useful agenda becomes live meeting state: each segment has a purpose, duration, and content or interaction mode, and the host advances the shared context for everyone.',
          sections: [
            ['1. Design the sequence before the call', 'Give each agenda item a clear outcome and realistic duration. Attach the content or interaction that belongs to that segment so participants do not hunt across tabs.'],
            ['2. Synchronize the active item', 'Treat the current agenda item as shared realtime state. Host navigation can switch the visible content, poll, Q&A, whiteboard, breakout, or screen-sharing context.'],
            ['3. Keep engagement contextual', 'Polls and questions are stronger when they appear at the moment the agenda needs them. The agenda becomes the orchestration layer rather than another static document.'],
            ['4. Preserve the context afterward', 'Keep the agenda beside the recording, transcript, chat, poll outcomes, summary, decisions, and action items so memory retains the structure of the conversation.'],
          ],
        }
      : route === 'resource-webinars'
        ? {
            eyebrow: 'Webinar operations',
            title: 'The complete webinar lifecycle from public page to follow-through',
            intro:
              'A webinar is more than a live room. The reliable workflow starts with public information and registration, continues through reminders and moderated participation, and ends with attendance evidence and reusable memory.',
            sections: [
              ['1. Publish truthful event context', 'Give attendees the title, time, timezone, presenters, agenda context, capacity state, and required registration fields before they submit.'],
              ['2. Persist registration before confirmation', 'A browser success state should only appear after the API durably accepts the registration and determines whether the attendee is registered or waitlisted.'],
              ['3. Deliver reminders from durable state', 'Reminder templates and scheduled deliveries should be recoverable and retryable. A temporary provider problem must not erase the registration.'],
              ['4. Measure the real event', 'Connect registrations, attendance intervals, engagement events, questions, polls, and the session record so reporting can distinguish sign-up from actual participation.'],
            ],
          }
        : {
            eyebrow: 'Scheduling',
            title: 'Build a booking flow that survives real calendar complexity',
            intro:
              'A booking page is a transaction boundary. Availability, notice rules, buffers, intake answers, the reserved slot, calendar delivery, cancellation, and rescheduling must agree.',
            sections: [
              ['1. Calculate slots from server rules', 'Publish availability from the authoritative booking rules and existing calendar commitments instead of trusting a browser-only calendar grid.'],
              ['2. Collect only useful intake information', 'Ask for the information needed to prepare the session, validate it on the server, and keep labels and errors accessible.'],
              ['3. Reserve once', 'Create the reservation atomically for the chosen start time and return a management token so the attendee can manage the booking without dashboard access.'],
              ['4. Keep calendar and booking state aligned', 'Generate an ICS invite and support cancellation or rescheduling through the same reservation lifecycle. Provider integrations can extend the same domain model.'],
            ],
          };

  return (
    <article className="article-page shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span aria-hidden="true">/</span>
        <a href="/resources">Resources</a>
        <span aria-hidden="true">/</span>
        <span>{article.eyebrow}</span>
      </nav>
      <span className="eyebrow">{article.eyebrow}</span>
      <h1>{article.title}</h1>
      <p className="article-lead">{article.intro}</p>
      <div className="article-body">
        {article.sections.map(([title, copy]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{copy}</p>
          </section>
        ))}
      </div>
      <aside className="article-cta">
        <h2>See the workflow in the product.</h2>
        <p>Explore the capability map or send a demo request with the use case you want to run.</p>
        <div className="actions">
          <a className="btn primary" href="/product">
            Explore product
          </a>
          <a className="btn secondary" href="/contact?intent=resource">
            Request a demo
          </a>
        </div>
      </aside>
    </article>
  );
}

function SearchPage() {
  const initial = new URLSearchParams(window.location.search).get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return routeDefinitions
      .filter((item) => item.index)
      .filter((item) => `${item.title} ${item.description} ${item.path}`.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [query]);

  return (
    <section className="section shell search-page">
      <span className="eyebrow">Site search</span>
      <h1>Find a product page or guide.</h1>
      <form
        action="/search"
        method="get"
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          const url = new URL(window.location.href);
          if (query.trim()) url.searchParams.set('q', query.trim());
          else url.searchParams.delete('q');
          window.history.replaceState({}, '', url);
        }}
      >
        <label htmlFor="site-search">Search Sessions</label>
        <div>
          <input
            id="site-search"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “booking”, “webinar”, or “security”"
          />
          <button className="btn primary" type="submit">
            Search
          </button>
        </div>
      </form>
      <div className="search-results" aria-live="polite">
        {!query.trim() ? (
          <p>Enter a term to search the public product pages and resources.</p>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <h2>No matching public page</h2>
            <p>Try a broader term or contact us if you are looking for a specific workflow.</p>
            <a href="/contact">Contact us →</a>
          </div>
        ) : (
          <>
            <p>{results.length} result{results.length === 1 ? '' : 's'}</p>
            {results.map((result) => (
              <a className="search-result" href={result.path} key={result.path}>
                <small>{result.path}</small>
                <h2>{result.title.replace(' — Sessions', '')}</h2>
                <p>{result.description}</p>
              </a>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function Terms() {
  return (
    <article className="policy-page shell">
      <span className="eyebrow">Terms information</span>
      <h1>Public website terms boundary</h1>
      <p className="article-lead">
        This implementation provides the route, structure, and product-use boundaries needed for a
        production terms page without inventing a legal entity, jurisdiction, fees, governing law,
        support promises, or contractual commitments that were not supplied.
      </p>
      <section>
        <h2>Public website use</h2>
        <p>
          Visitors may browse the public product and resource pages and may use published event,
          booking, contact, and demo journeys according to the validation and access rules enforced
          by the backend.
        </p>
      </section>
      <section>
        <h2>Product and account terms</h2>
        <p>
          Account access, paid plans, service limits, support obligations, cancellation rules,
          warranties, and organization-specific agreements require verified commercial and legal
          terms from the production operator before they can be presented as binding conditions.
        </p>
      </section>
      <section>
        <h2>External services</h2>
        <p>
          Calendar, media, storage, transcription, AI, email, and other providers may have their
          own applicable terms when those integrations are configured. This page does not invent
          provider obligations that have not been verified for the deployment.
        </p>
      </section>
      <section>
        <h2>Production legal review</h2>
        <p>
          Before launch, the operator must supply its verified legal identity, contact details,
          governing-law decisions, commercial terms, support commitments, intellectual-property
          wording, and jurisdiction-specific notices. Until then this page is implementation
          information, not a substitute for approved production legal terms.
        </p>
      </section>
      <div className="actions">
        <a className="btn secondary" href="/privacy">
          Privacy information
        </a>
        <a className="btn secondary" href="/contact">
          Contact
        </a>
      </div>
    </article>
  );
}

function Privacy() {
  return (
    <article className="policy-page shell">
      <span className="eyebrow">Privacy information</span>
      <h1>Public website data boundaries</h1>
      <p className="article-lead">
        This page describes the current implementation so visitors can understand what the public
        website sends to the backend. It is not a claim of universal legal compliance and does not
        replace deployment-specific legal review.
      </p>
      <section>
        <h2>Contact and demo enquiries</h2>
        <p>
          When you submit an enquiry, the backend accepts the fields shown in the form: name,
          email, optional company/team information, the message, consent state, source path, and
          approved campaign parameters. It does not intentionally copy arbitrary form values into
          analytics payloads.
        </p>
      </section>
      <section>
        <h2>Event registration and bookings</h2>
        <p>
          Public event and booking journeys store the attendee or invitee information required for
          registration, intake, reservation management, reminder delivery, and calendar workflows.
          Those records belong to the organization/workspace that published the public page.
        </p>
      </section>
      <section>
        <h2>Optional measurement</h2>
        <p>
          The website does not activate a third-party analytics or advertising SDK by default.
          Consent preferences are stored locally on the visitor device and are available for a
          future deployment to respect before optional measurement is configured.
        </p>
      </section>
      <section>
        <h2>Production policy ownership</h2>
        <p>
          The production operator must supply verified legal identity, contact details, processing
          purposes, retention periods, provider list, rights procedures, and jurisdiction-specific
          wording before treating this implementation page as a complete privacy notice.
        </p>
      </section>
      <a className="inline-link" href="/consent">
        Review consent preferences →
      </a>
    </article>
  );
}

function Accessibility() {
  return (
    <article className="policy-page shell">
      <span className="eyebrow">Accessibility</span>
      <h1>Accessibility is part of the release contract.</h1>
      <p className="article-lead">
        The public website is designed toward WCAG 2.2 Level AA behavior, but this page does not
        claim formal conformance without the required evaluation and evidence.
      </p>
      <div className="trust-grid">
        {[
          ['Structure', 'Semantic landmarks, logical headings, descriptive page titles, crawlable links, and a skip-to-content link.'],
          ['Keyboard & focus', 'Interactive controls are keyboard reachable with visible focus treatment and no critical hover-only content.'],
          ['Forms', 'Persistent labels, browser autocomplete, required states, server validation, accessible error feedback, and honest success states.'],
          ['Responsive reading', 'Content-driven breakpoints, reflow, readable contrast, touch targets, and no essential horizontal scrolling.'],
          ['Motion', 'Reduced-motion preferences disable nonessential motion and the site avoids autoplaying essential media.'],
          ['Fallback states', 'Search empty states, not-found, temporary-error, offline, form error, loading, and success states remain understandable without animation.'],
        ].map(([title, copy]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
      <p className="policy-note">
        If you encounter an accessibility problem, use the contact form and include the page and
        task you were trying to complete.
      </p>
      <a className="btn secondary" href="/contact?intent=accessibility">
        Report an accessibility problem
      </a>
    </article>
  );
}

function Consent() {
  return (
    <section className="section shell consent-page">
      <div>
        <span className="eyebrow">Consent preferences</span>
        <h1>Keep optional measurement separate from essential website operation.</h1>
        <p>
          The public website can operate, accept enquiries, register event attendees, and manage
          bookings without optional analytics or advertising consent.
        </p>
      </div>
      <ConsentPreferences />
    </section>
  );
}

function UtilityPage({ kind }: { kind: 'offline' | 'error' | 'thank-you' }) {
  const content =
    kind === 'offline'
      ? {
          eyebrow: 'Offline',
          title: 'You appear to be offline.',
          copy: 'Reconnect and retry. If you were submitting a form, keep this tab open so you can safely try again rather than assuming it was accepted.',
          action: 'Retry',
          href: window.location.pathname,
        }
      : kind === 'error'
        ? {
            eyebrow: 'Temporary problem',
            title: 'The page could not complete that request.',
            copy: 'No success should be assumed. Retry the page or use the contact route when the service is available.',
            action: 'Return home',
            href: '/',
          }
        : {
            eyebrow: 'Request received',
            title: 'Thank you.',
            copy: 'This confirmation route is available for configured form journeys. A request is only treated as accepted after the backend returns a successful durable response.',
            action: 'Return home',
            href: '/',
          };
  return (
    <section className="utility-page shell">
      <span className="eyebrow">{content.eyebrow}</span>
      <h1>{content.title}</h1>
      <p>{content.copy}</p>
      <a className="btn primary" href={content.href}>
        {content.action}
      </a>
    </section>
  );
}

function NotFound() {
  return (
    <section className="utility-page shell">
      <span className="eyebrow">404</span>
      <h1>That page is not part of the public website.</h1>
      <p>
        Check the address, search the public pages, or return to the product overview. Unknown
        routes are not silently turned into the homepage.
      </p>
      <div className="actions">
        <a className="btn primary" href="/search">
          Search website
        </a>
        <a className="btn secondary" href="/product">
          Product overview
        </a>
      </div>
    </section>
  );
}

function RouteFlow({
  title,
  route,
  api,
  dark = false,
}: {
  title: string;
  route: string;
  api: string;
  dark?: boolean;
}) {
  return (
    <section className={dark ? 'section architecture' : 'section soft'}>
      <div className="shell route-flow">
        <div>
          <span className="eyebrow">Working public flow</span>
          <h2>{title}</h2>
          <p>
            The public experience stays independent from the dashboard while using the same
            business API and durable database state.
          </p>
        </div>
        <div className="route-card">
          <small>PUBLIC ROUTE</small>
          <code>{route}</code>
          <span aria-hidden="true">↓</span>
          <code>{api}</code>
        </div>
      </div>
    </section>
  );
}

function pageFor(route: MarketingRoute) {
  switch (route) {
    case 'home':
      return <Home />;
    case 'product':
      return <Product />;
    case 'meetings':
      return <Meetings />;
    case 'webinars':
      return <Webinars />;
    case 'scheduling':
      return <Scheduling />;
    case 'memory':
      return <Memory />;
    case 'integrations':
      return <Integrations />;
    case 'security':
      return <Security />;
    case 'pricing':
      return <Pricing />;
    case 'demo':
      return <Demo />;
    case 'contact':
      return <Contact />;
    case 'about':
      return <About />;
    case 'resources':
      return <Resources />;
    case 'resource-agenda':
    case 'resource-webinars':
    case 'resource-scheduling':
      return <ResourceArticle route={route} />;
    case 'search':
      return <SearchPage />;
    case 'terms':
      return <Terms />;
    case 'privacy':
      return <Privacy />;
    case 'accessibility':
      return <Accessibility />;
    case 'consent':
      return <Consent />;
    case 'offline':
    case 'error':
    case 'thank-you':
      return <UtilityPage kind={route} />;
    case 'not-found':
      return <NotFound />;
  }
}

export function MarketingSite({ route }: { route: MarketingRoute }) {
  useEffect(() => {
    applyMarketingHead(route);
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="marketing">
      <Header route={route} />
      <main id="main">{pageFor(route)}</main>
      <Footer />
    </div>
  );
}
