import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicBookingPage } from './PublicBookingPage';
import { PublicBookingManagePage } from './PublicBookingManagePage';
import { PublicEventPage } from './PublicEventPage';
import { PublicWebinarJoinPage } from './PublicWebinarJoinPage';
import './styles.css';
import './public.css';

const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:3000';

const capabilities = [
  [
    '01',
    'Plan',
    'Build a timed agenda, attach the right content, and make ownership explicit before anyone joins.',
  ],
  [
    '02',
    'Run',
    'Bring video, screen share, interactive agenda, and participation tools into one guided workspace.',
  ],
  [
    '03',
    'Remember',
    'Turn recordings, transcripts, decisions, and actions into a searchable record after the call.',
  ],
];

const architecture = [
  [
    'Control plane',
    'Identity, workspaces, roles, rooms, scheduling, events, policy and billing.',
  ],
  [
    'Realtime plane',
    'WebSocket state for presence, agenda, chat, polls, Q&A and collaborative tools.',
  ],
  [
    'Media plane',
    'LiveKit SFU, TURN, adaptive WebRTC, egress and region-aware capacity.',
  ],
  [
    'Memory plane',
    'Private object storage, transcription, search, retention and opt-in AI workflows.',
  ],
];

function MarketingPage() {
  return (
    <div className="site">
      <header className="nav shell">
        <a className="logo" href="#top" aria-label="Sessions home">
          <span>S</span>
          Sessions
        </a>
        <nav>
          <a href="#product">Product</a>
          <a href="#architecture">Architecture</a>
          <a href="#principles">Principles</a>
        </nav>
        <a className="nav-cta" href={appUrl}>
          Open workspace <span>↗</span>
        </a>
      </header>

      <main id="top">
        <section className="hero shell">
          <div className="hero-copy">
            <span className="kicker">A meeting operating system</span>
            <h1>Meetings that move work forward.</h1>
            <p>
              Plan the room. Guide the conversation. Keep the decisions. Sessions brings live
              collaboration, scheduling, events, and trustworthy meeting memory into one workspace.
            </p>
            <div className="hero-actions">
              <a className="primary" href={appUrl}>
                Start a session <span>→</span>
              </a>
              <a className="secondary" href="#architecture">
                Explore the system
              </a>
            </div>
            <div className="hero-proof">
              <div>
                <strong>Original by design</strong>
                <span>Independent clean-room product</span>
              </div>
              <div>
                <strong>Secure by default</strong>
                <span>Tenant isolation and auditability</span>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-label="Session workspace preview">
            <div className="visual-window">
              <div className="window-top">
                <span />
                <span />
                <span />
                <small>Product discovery · Live</small>
              </div>
              <div className="window-body">
                <aside>
                  <small>Agenda · 42 min</small>
                  <ol>
                    <li className="completed">
                      <span>1</span>
                      <div>
                        <strong>Context</strong>
                        <small>5 min</small>
                      </div>
                    </li>
                    <li className="current">
                      <span>2</span>
                      <div>
                        <strong>Prototype</strong>
                        <small>18 min</small>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>Decision</strong>
                        <small>10 min</small>
                      </div>
                    </li>
                    <li>
                      <span>4</span>
                      <div>
                        <strong>Actions</strong>
                        <small>9 min</small>
                      </div>
                    </li>
                  </ol>
                </aside>
                <section className="visual-stage">
                  <div className="stage-copy">
                    <span>Now presenting</span>
                    <strong>Customer journey prototype</strong>
                    <small>Embedded content · Controlled by host</small>
                  </div>
                  <div className="cursor one">AR</div>
                  <div className="cursor two">PM</div>
                  <div className="participant-strip">
                    <div>AM</div>
                    <div>SK</div>
                    <div>JR</div>
                    <span>+8</span>
                  </div>
                </section>
              </div>
              <div className="window-controls">
                <button>◉</button>
                <button>⌁</button>
                <button className="share">Share</button>
                <button>✧</button>
                <button className="leave">Leave</button>
              </div>
            </div>
            <div className="floating-note note-one">
              <span>✦</span>
              <div>
                <strong>Decision captured</strong>
                <small>Move beta launch to 18 Oct</small>
              </div>
            </div>
            <div className="floating-note note-two">
              <span>03</span>
              <div>
                <strong>Actions found</strong>
                <small>Ready for review</small>
              </div>
            </div>
          </div>
        </section>

        <section className="statement">
          <div className="shell statement-grid">
            <span className="section-number">01 — Product</span>
            <h2>One continuous workflow, not a pile of disconnected tools.</h2>
            <p>A session begins before the call and keeps creating value after everyone leaves.</p>
          </div>
        </section>

        <section className="capabilities shell" id="product">
          {capabilities.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
              <small>↗</small>
            </article>
          ))}
        </section>

        <section className="agenda-feature shell">
          <div className="agenda-demo">
            <div className="agenda-demo-top">
              <span>Run of show</span>
              <small>Host view</small>
            </div>
            <div className="agenda-time">
              <strong>12:38</strong>
              <span>remaining</span>
            </div>
            <div className="agenda-active">
              <span>02</span>
              <div>
                <small>CURRENT</small>
                <strong>Walk through the prototype</strong>
                <p>Website embed · Host controlled</p>
              </div>
            </div>
            <div className="agenda-next">
              <span>Next</span>
              <strong>Prioritize open decisions</strong>
              <small>10 min</small>
            </div>
          </div>
          <div className="feature-copy">
            <span className="section-number">02 — Guided flow</span>
            <h2>The agenda is part of the meeting, not a document nobody opens.</h2>
            <p>
              Time-boxed items drive the stage. Move from context to content, polls, Q&A and
              decisions without sending participants into a maze of tabs.
            </p>
            <ul>
              <li>
                <span>✓</span> Shared, realtime agenda state
              </li>
              <li>
                <span>✓</span> Content-aware meeting segments
              </li>
              <li>
                <span>✓</span> Durable audit and event history
              </li>
            </ul>
          </div>
        </section>

        <section className="architecture" id="architecture">
          <div className="shell architecture-heading">
            <span className="section-number light">03 — Architecture</span>
            <h2>Designed as a system of clear boundaries.</h2>
            <p>
              Media, realtime collaboration, durable business state and AI workloads have different
              reliability needs. Sessions treats them that way.
            </p>
          </div>
          <div className="shell architecture-grid">
            {architecture.map(([title, copy], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="principles shell" id="principles">
          <div>
            <span className="section-number">04 — Principles</span>
            <h2>Trust is a product feature.</h2>
          </div>
          <div className="principle-list">
            <article>
              <strong>Tenant boundaries</strong>
              <p>
                Verified identity claims, application checks and forced PostgreSQL row-level
                security.
              </p>
            </article>
            <article>
              <strong>Consent before capture</strong>
              <p>
                Recording and transcription require visible disclosure, policy and auditable
                consent.
              </p>
            </article>
            <article>
              <strong>AI with a human in control</strong>
              <p>
                Suggestions are labeled, editable and reviewed before external actions are taken.
              </p>
            </article>
            <article>
              <strong>Honest delivery status</strong>
              <p>Planned capability is never presented as implemented production functionality.</p>
            </article>
          </div>
        </section>

        <section className="cta-section">
          <div className="shell cta-inner">
            <span>Sessions</span>
            <h2>Make the next meeting worth everyone’s time.</h2>
            <a href={appUrl}>
              Open the workspace <span>→</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="shell">
        <div className="logo footer-logo">
          <span>S</span>Sessions
        </div>
        <p>Independent clean-room meeting platform.</p>
        <small>© 2026 Sessions</small>
      </footer>
    </div>
  );
}

function RoutedPage() {
  const [route, organizationSlug, workspaceSlug, resourceSlug, ...rest] =
    window.location.pathname.split('/').filter(Boolean);
  const completePublicRoute =
    rest.length === 0 &&
    organizationSlug !== undefined &&
    workspaceSlug !== undefined &&
    resourceSlug !== undefined;
  const bookingManageRoute =
    route === 'book' &&
    organizationSlug !== undefined &&
    workspaceSlug !== undefined &&
    resourceSlug !== undefined &&
    rest.length === 2 &&
    rest[0] === 'manage' &&
    rest[1] !== undefined;
  const eventJoinRoute =
    route === 'events' &&
    organizationSlug !== undefined &&
    workspaceSlug !== undefined &&
    resourceSlug !== undefined &&
    rest.length === 2 &&
    rest[0] === 'join' &&
    rest[1] !== undefined;

  if (eventJoinRoute) {
    return (
      <PublicWebinarJoinPage
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        eventSlug={resourceSlug}
        registrationId={rest[1]!}
      />
    );
  }
  if (route === 'events' && completePublicRoute) {
    return (
      <PublicEventPage
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        eventSlug={resourceSlug}
      />
    );
  }
  if (bookingManageRoute) {
    return (
      <PublicBookingManagePage
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        bookingSlug={resourceSlug}
        reservationId={rest[1]!}
      />
    );
  }
  if (route === 'book' && completePublicRoute) {
    return (
      <PublicBookingPage
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        bookingSlug={resourceSlug}
      />
    );
  }
  return <MarketingPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoutedPage />
  </StrictMode>,
);
