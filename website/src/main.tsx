import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:3000';

const capabilities = [
  {
    number: '01',
    title: 'Run the meeting, not the meeting software.',
    copy: 'Video, screen sharing, participant controls, and a shared stage stay connected to the session plan.',
  },
  {
    number: '02',
    title: 'Give every conversation a visible shape.',
    copy: 'Time-boxed agenda items can drive presentations, demonstrations, polls, whiteboards, Q&A, and breakouts.',
  },
  {
    number: '03',
    title: 'Make the outcome reusable.',
    copy: 'Recordings, transcripts, decisions, actions, and approved AI drafts become a governed meeting memory.',
  },
];

function App() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Sessions home">
          <span>S</span>
          <strong>Sessions</strong>
        </a>
        <nav aria-label="Primary">
          <a href="#product">Product</a>
          <a href="#workflows">Workflows</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <a className="button small" href={appUrl}>Open workspace</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="kicker">Meetings with a memory</span>
          <h1>One place to prepare, meet, and move the work forward.</h1>
          <p>
            Sessions unifies live meetings, interactive agendas, webinars, scheduling, and post-meeting memory without forcing teams to stitch together five different tools.
          </p>
          <div className="hero-actions">
            <a className="button" href={appUrl}>Enter the product</a>
            <a className="text-link" href="#architecture">See the system design →</a>
          </div>
        </div>
        <div className="hero-visual" aria-label="Illustrated meeting workspace">
          <div className="agenda-card">
            <span>Shared agenda</span>
            <strong>Customer onboarding</strong>
            <ol>
              <li className="done"><b>01</b><span>Welcome and context</span><em>3 min</em></li>
              <li className="active"><b>02</b><span>Product walkthrough</span><em>15 min</em></li>
              <li><b>03</b><span>Live questions</span><em>10 min</em></li>
            </ol>
          </div>
          <div className="meeting-card">
            <div className="meeting-top"><span>Live · 8 people</span><span>•••</span></div>
            <div className="speaker"><span>AM</span><small>Presenting</small></div>
            <div className="participant-strip"><span>SO</span><span>KR</span><span>LM</span><span>+5</span></div>
          </div>
          <div className="memory-card"><span>After the call</span><strong>Summary ready for review</strong><small>5 decisions · 7 actions · transcript linked</small></div>
        </div>
      </section>

      <section className="capability-grid" id="product">
        {capabilities.map((capability) => (
          <article key={capability.number}>
            <span>{capability.number}</span>
            <h2>{capability.title}</h2>
            <p>{capability.copy}</p>
          </article>
        ))}
      </section>

      <section className="workflow-section" id="workflows">
        <div className="section-heading">
          <span className="kicker">Connected workflows</span>
          <h2>From a booking link to a searchable outcome.</h2>
        </div>
        <div className="workflow-line">
          <article><b>Schedule</b><p>Calendar-connected booking pages, event registration, reminders, and reliable timezone rules.</p></article>
          <article><b>Facilitate</b><p>Permanent rooms, host controls, agenda navigation, embedded content, polls, Q&A, and breakouts.</p></article>
          <article><b>Remember</b><p>Recording, transcription, playback, search, summaries, decisions, and human-approved follow-up drafts.</p></article>
          <article><b>Integrate</b><p>Scoped API keys, signed webhooks, OAuth connectors, CRM updates, and governed exports.</p></article>
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div>
          <span className="kicker light">Built for isolation and recovery</span>
          <h2>A meeting platform is a distributed system before it is a video screen.</h2>
          <p>
            The implementation separates durable commands, realtime collaboration, WebRTC media, asynchronous processing, and object storage. Tenant identity comes from verified claims, PostgreSQL row-level security provides a second boundary, and externally visible changes are backed by audit and outbox records.
          </p>
          <a className="button inverted" href={`${appUrl}/rooms`}>Explore the foundation</a>
        </div>
        <div className="architecture-map" aria-label="Architecture layers">
          <span>React web applications</span>
          <i>HTTPS · WebSocket · WebRTC</i>
          <span>NestJS API and collaboration gateway</span>
          <i>Transactions · outbox · scoped tokens</i>
          <div><span>PostgreSQL + RLS</span><span>Redis streams</span><span>LiveKit SFU</span><span>Object storage</span></div>
        </div>
      </section>

      <footer>
        <div className="brand"><span>S</span><strong>Sessions</strong></div>
        <p>Independent clean-room implementation. No proprietary source code, assets, or undocumented behavior are reused.</p>
        <a href={appUrl}>Open workspace →</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
