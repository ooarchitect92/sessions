import { useEffect } from 'react';
import { MarketingLeadForm } from './MarketingLeadForm';
import { features, integrations, security, workflow, type MarketingRoute } from './marketing-data';

const appUrl=import.meta.env.VITE_APP_URL??'http://localhost:3000';

const meta:Record<MarketingRoute,{title:string;description:string}>={
  home:{title:'Sessions — Meetings that move work forward',description:'Agenda-led meetings, webinars, scheduling, collaboration, recording, transcription, and meeting memory in one platform.'},
  product:{title:'Product — Sessions',description:'Explore the complete Sessions workflow across meetings, collaboration, events, bookings, memory, AI, integrations, and analytics.'},
  meetings:{title:'Meetings — Sessions',description:'Run structured video meetings with interactive agendas, content, polls, Q&A, whiteboards, chat, and breakouts.'},
  webinars:{title:'Webinars & Events — Sessions',description:'Publish branded event pages, register attendees, manage presenters, reminders, and interactive webinars.'},
  scheduling:{title:'Scheduling — Sessions',description:'Publish booking pages with availability, intake forms, calendar invitations, cancellation, and rescheduling.'},
  memory:{title:'AI & Meeting Memory — Sessions',description:'Turn recordings and transcripts into searchable meeting memory, summaries, decisions, and actions.'},
  integrations:{title:'Integrations & API — Sessions',description:'Connect calendars, content tools, REST APIs, signed webhooks, storage, transcription, and AI providers.'},
  security:{title:'Security & Trust — Sessions',description:'Tenant isolation, consent-aware recording, secure storage, reliable external effects, and human-controlled AI.'},
  pricing:{title:'Plans — Sessions',description:'Understand Sessions capability tiers without publishing unapproved commercial pricing.'},
  contact:{title:'Contact & Demo — Sessions',description:'Tell us about your meeting, webinar, scheduling, or collaboration workflow.'},
};

function Header(){
  return <header className="m-header"><a className="skip" href="#main">Skip to content</a><div className="shell nav">
    <a className="brand" href="/"><span>S</span><b>Sessions</b></a>
    <nav aria-label="Primary"><a href="/product">Product</a><a href="/meetings">Meetings</a><a href="/webinars">Webinars</a><a href="/scheduling">Scheduling</a><a href="/pricing">Plans</a><a href="/security">Security</a></nav>
    <div className="nav-actions"><a href={`${appUrl}/login`}>Log in</a><a className="btn primary sm" href={`${appUrl}/signup`}>Get started <span>→</span></a></div>
    <details className="mobile-menu"><summary>Menu</summary><div><a href="/product">Product</a><a href="/meetings">Meetings</a><a href="/webinars">Webinars</a><a href="/scheduling">Scheduling</a><a href="/memory">AI & Memory</a><a href="/integrations">Integrations</a><a href="/pricing">Plans</a><a href="/security">Security</a><a href="/contact">Contact</a><a href={`${appUrl}/login`}>Log in</a></div></details>
  </div></header>;
}

function Footer(){
  return <footer className="m-footer"><div className="shell footer-grid">
    <div className="footer-intro"><a className="brand light" href="/"><span>S</span><b>Sessions</b></a><p>Plan, run, and remember high-value meetings and events in one guided workflow.</p><MarketingLeadForm kind="NEWSLETTER" compact submitLabel="Get product updates"/></div>
    <div><b>Product</b><a href="/product">Overview</a><a href="/meetings">Meetings</a><a href="/webinars">Webinars</a><a href="/scheduling">Scheduling</a><a href="/memory">AI & Memory</a></div>
    <div><b>Platform</b><a href="/integrations">Integrations & API</a><a href="/security">Security & Trust</a><a href="/pricing">Plans</a><a href="/contact">Contact</a></div>
    <div><b>Get started</b><a href={`${appUrl}/signup`}>Create account</a><a href={`${appUrl}/login`}>Log in</a><a href="/contact?intent=demo">Request demo</a></div>
  </div><div className="shell footer-bottom"><span>© 2026 Sessions. Independent clean-room product.</span><span>Public website and self-service journeys are separate from the authenticated workspace.</span></div></footer>;
}

function Preview(){
  return <div className="preview" aria-label="Illustration of an agenda-led meeting workspace">
    <div className="preview-bar"><i/><i/><i/><span>Customer discovery · Live</span><b>00:32:18</b></div>
    <div className="preview-body">
      <aside><small>AGENDA · 42 MIN</small>{[['1','Context','5 min'],['2','Product demo','18 min'],['3','Questions','10 min'],['4','Next steps','9 min']].map((x,i)=><div className={i===1?'active':i===0?'done':''} key={x[0]}><b>{x[0]}</b><span><strong>{x[1]}</strong><small>{x[2]}</small></span></div>)}</aside>
      <section><span className="stage-label">SHARED CONTENT</span><div className="stage-card"><small>Prototype walkthrough</small><strong>Show the real product while the agenda keeps everyone aligned.</strong><i/><i/><i/></div><div className="people"><span>BM</span><span>SK</span><span>JR</span><b>+8</b></div></section>
      <aside className="notes"><small>LIVE NOTES</small><div><b>Decision</b><p>Move beta launch to 18 Oct.</p></div><div><b>Poll</b><p>7 of 9 answered.</p></div><div><b>Action</b><p>Share revised onboarding flow.</p></div></aside>
    </div>
    <div className="preview-tools"><span>◉</span><span>⌁</span><b>Share</b><span>✧</span><span>☰</span><i>Leave</i></div>
  </div>;
}

function Hero({eyebrow,title,copy,visual=true,primary='Get started',primaryHref,secondary='Explore product',secondaryHref='/product'}:{eyebrow:string;title:string;copy:string;visual?:boolean;primary?:string;primaryHref?:string;secondary?:string;secondaryHref?:string}){
  return <section className={visual?'hero shell':'page-hero shell'}><div className="hero-copy"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p><div className="actions"><a className="btn primary" href={primaryHref??`${appUrl}/signup`}>{primary} <span>→</span></a><a className="btn secondary" href={secondaryHref}>{secondary}</a></div><div className="proof"><span><b>Agenda-led</b><small>Keep every session on purpose.</small></span><span><b>Human-controlled AI</b><small>Review before external action.</small></span><span><b>Full lifecycle</b><small>Before, during, and after.</small></span></div></div>{visual?<Preview/>:null}</section>;
}

function SectionTitle({eyebrow,title,copy,dark=false}:{eyebrow:string;title:string;copy?:string;dark?:boolean}){
  return <div className={dark?'section-title dark-title':'section-title'}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{copy?<p>{copy}</p>:null}</div>;
}

function FeatureGrid({limit}:{limit?:number}){
  return <div className="feature-grid">{features.slice(0,limit??features.length).map(([title,copy,icon],i)=><article key={title}><span className="f-icon">{icon}</span><small>{String(i+1).padStart(2,'0')}</small><h3>{title}</h3><p>{copy}</p></article>)}</div>;
}

function Workflow(){
  return <section className="section workflow"><div className="shell"><SectionTitle eyebrow="End-to-end workflow" title="One journey from invitation to follow-through." copy="Scheduling, live collaboration, recording, memory, and integrations work as one system instead of disconnected tools."/><div className="workflow-grid">{workflow.map(([n,t,c])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div></div></section>;
}

function Architecture(){
  return <section className="section architecture"><div className="shell"><SectionTitle dark eyebrow="Platform architecture" title="Clear boundaries for business state, realtime collaboration, media, and memory." copy="The current project uses a NestJS business API, PostgreSQL, realtime synchronization, WebRTC media, object storage, workers, and provider adapters so workloads can evolve independently."/><div className="arch-grid">
    <article><span>CONTROL PLANE</span><h3>Business API</h3><p>Identity, workspaces, roles, rooms, sessions, agendas, events, bookings, policy, and stable API contracts.</p></article>
    <article><span>REALTIME PLANE</span><h3>Live collaboration</h3><p>Presence, agenda state, chat, polls, Q&A, whiteboards, breakouts, and session signaling.</p></article>
    <article><span>MEDIA PLANE</span><h3>WebRTC & recording</h3><p>Audio, video, screen share, SFU/TURN connectivity, egress, and recorded media artifacts.</p></article>
    <article><span>MEMORY PLANE</span><h3>Transcript & AI</h3><p>Recordings, speech-to-text, searchable memory, summaries, decisions, actions, and reviewable AI output.</p></article>
  </div></div></section>;
}

function FinalCta(){
  return <section className="final-cta"><div className="shell"><span className="eyebrow">Ready when your workflow is</span><h2>Bring the whole meeting lifecycle into one system.</h2><p>Start in the product, or tell us what you need for meetings, webinars, scheduling, security, branding, or integrations.</p><div className="actions"><a className="btn lime" href={`${appUrl}/signup`}>Get started →</a><a className="btn ghost" href="/contact?intent=demo">Request a demo</a></div></div></section>;
}

function Home(){
  return <><Hero eyebrow="Meetings, webinars, scheduling, and memory" title="Make every session easier to run — and harder to forget." copy="Sessions brings video, interactive agendas, embedded content, engagement tools, scheduling, public events, recording, transcription, and reviewable AI into one guided meeting lifecycle."/>
  <section className="section shell"><SectionTitle eyebrow="One platform" title="Replace the meeting-tool maze with a continuous workflow." copy="Use purpose-built capabilities before, during, and after the live conversation."/><FeatureGrid limit={6}/><a className="inline-link" href="/product">Explore the complete product →</a></section>
  <Workflow/>
  <section className="section shell spotlight"><div className="spot-card"><span>02 · CURRENT</span><strong>Walk through the prototype</strong><p>18 minutes · embedded content · host controlled</p><button>Next: Prioritize decisions →</button></div><div><span className="eyebrow">Interactive agenda</span><h2>The agenda is part of the meeting, not a document nobody opens.</h2><p>Time-boxed agenda items control the live flow and can activate content, polls, Q&A, whiteboards, breakouts, or screen sharing for everyone.</p><ul><li>Shared realtime agenda state</li><li>Content-aware session segments</li><li>Reusable agenda patterns</li><li>Durable event history</li></ul></div></section>
  <section className="section soft"><div className="shell"><SectionTitle eyebrow="Built for real work" title="Sales demos, onboarding, training, workshops, coaching, and customer sessions."/><div className="solution-grid">{[['Sales & demos','Reusable agendas, product content, questions, decisions, and searchable memory.','/meetings'],['Customer onboarding','Rooms, files, whiteboards, actions, and repeatable onboarding flow.','/meetings'],['Training & webinars','Presenter-led sessions, polls, Q&A, breakouts, registration, and recordings.','/webinars'],['Coaching & consultations','Booking, intake, calendar invite, meeting, and outcome in one lifecycle.','/scheduling']].map(([t,c,h])=><a key={t} href={h}><span>↗</span><h3>{t}</h3><p>{c}</p></a>)}</div></div></section>
  <Architecture/><FinalCta/></>;
}

function Product(){
  return <><Hero visual={false} eyebrow="Product overview" title="Everything the meeting needs — before, during, and after." copy="The public site surfaces the complete Sessions-like capability map while the authenticated product stays in the existing application. Public events and bookings remain connected to real backend workflows." secondary="Request a demo" secondaryHref="/contact?intent=demo"/>
  <section className="section shell"><SectionTitle eyebrow="Capability map" title="Full product coverage in one public overview."/><FeatureGrid/></section><Workflow/><Architecture/><FinalCta/></>;
}

function Meetings(){
  return <><Hero eyebrow="Meetings & rooms" title="Run a meeting like a guided workspace, not a video call surrounded by tabs." copy="Bring video, screen sharing, a persistent agenda, embedded content, chat, polls, Q&A, whiteboards, breakout rooms, recording, transcription, and host controls into one synchronized session." secondary="See AI & memory" secondaryHref="/memory"/>
  <section className="section shell"><div className="detail-grid">{[['01','Permanent rooms','Stable links can carry reusable settings, default agendas, branding, host rules, waiting experience, and recording defaults.'],['02','Host-led agenda state','Move participants through a shared sequence of content and interaction with the current agenda item synchronized in realtime.'],['03','Participation tools','Use chat, reactions, polls, Q&A, whiteboards, and breakouts while hosts retain role and moderation boundaries.'],['04','Durable meeting record','Recording, transcript, agenda, chat, polls, decisions, and actions stay connected after the call ends.']].map(([n,t,c])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div></section>
  <section className="section architecture"><div className="shell realtime"><div><SectionTitle dark eyebrow="Realtime architecture" title="Use the right channel for the right state." copy="WebRTC carries media. WebSockets synchronize live collaboration. HTTP handles durable CRUD, uploads, artifacts, and administration."/></div><div className="stack"><b>Browser client</b><i>HTTPS · WebSocket · WebRTC</i><div><span>Business API</span><span>Realtime sync</span></div><i>purpose-specific paths</i><div><span>PostgreSQL</span><span>Media / storage</span></div></div></div></section><FinalCta/></>;
}

function Webinars(){
  return <><Hero eyebrow="Webinars & public events" title="From event page to live audience — without stitching the journey together later." copy="Publish a branded event page, show presenters and event context, collect custom registration fields, manage capacity or waitlists, schedule reminders, and run webinar-style roles with Q&A and polls." secondary="Talk to us" secondaryHref="/contact?intent=webinars"/>
  <section className="section shell"><div className="detail-grid">{[['01','Publish','Create a public event route with title, timing, presenters, branding, capacity, and custom registration fields.'],['02','Register','Persist attendee registration and return registered or waitlisted status from the backend.'],['03','Remind','Use durable reminder templates and delivery reconciliation rather than treating browser success as delivery proof.'],['04','Run & measure','Host presenters, moderate engagement, and retain attendance and session evidence for follow-through.']].map(([n,t,c])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div></section>
  <RouteFlow title="A public registration path already exists in the product." route="/events/:organization/:workspace/:event" api="GET /v1/public/.../events/:event → POST .../registrations"/><FinalCta/></>;
}

function Scheduling(){
  return <><Hero eyebrow="Scheduling & booking pages" title="Let someone pick a time — then carry the booking all the way into the meeting." copy="Publish booking pages with duration, availability rules, notice periods, buffers, intake questions, slot reservation, calendar invites, cancellation, and rescheduling." secondary="Request a demo" secondaryHref="/contact?intent=scheduling"/>
  <section className="section shell"><SectionTitle eyebrow="Booking lifecycle" title="A real reservation, not a calendar-looking form." copy="The existing public booking journey reads availability from the API, reserves the chosen slot, and supports calendar generation plus attendee management actions."/><div className="flow-line">{['Availability rules','Public slots','Intake form','Confirmed reservation','Calendar & reminders','Session'].map((x,i)=><span key={x}>{x}{i<5?<i>→</i>:null}</span>)}</div></section>
  <RouteFlow dark title="Booking pages are backend-connected." route="/book/:organization/:workspace/:booking" api="GET .../slots → POST .../reservations → calendar / cancel / reschedule"/><FinalCta/></>;
}

function Memory(){
  return <><Hero eyebrow="Recording, transcription & AI" title="Turn the call into a memory people can actually use." copy="Keep recording, transcript, agenda context, chat, poll outcomes, summaries, decisions, and action items connected to the session. AI can help transform the transcript while people stay in control." secondary="Security approach" secondaryHref="/security"/>
  <section className="section shell"><div className="detail-grid">{[['01','Capture with consent','Recording and transcription follow explicit session settings and participant disclosure.'],['02','Process asynchronously','Media moves through storage and speech-to-text workflows without blocking the live meeting.'],['03','Structure the memory','Transcript, agenda, recording, polls, chat, summary, decisions, and actions remain associated with one session.'],['04','Review AI output','Summaries and draft follow-ups are reviewable, with provider abstraction and no silent external action.']].map(([n,t,c])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}</div></section><Architecture/><FinalCta/></>;
}

function Integrations(){
  return <><Hero visual={false} eyebrow="Integrations & API" title="Keep the platform connected without making one provider the architecture." copy="Calendar providers, content tools, media, object storage, transcription, AI, REST APIs, and signed webhooks sit behind explicit interfaces so integrations can change without replacing the core business model." secondary="Security approach" secondaryHref="/security"/>
  <section className="section shell"><div className="integration-grid">{integrations.map(([title,items])=><article key={title}><span>↔</span><h3>{title}</h3>{items.map(x=><p key={x}>{x}</p>)}</article>)}</div></section>
  <section className="section soft"><div className="shell webhook"><div><SectionTitle eyebrow="Automation boundary" title="Signed events for external workflows." copy="The architecture supports REST endpoints and HMAC-signed webhook delivery with retries for meaningful lifecycle events."/></div><div className="chips">{['session.started','session.ended','participant.joined','recording.ready','transcript.ready','booking.created','booking.rescheduled','event.registration.created'].map(x=><span key={x}>{x}</span>)}</div></div></section><FinalCta/></>;
}

function Security(){
  return <><Hero visual={false} eyebrow="Security & trust" title="Trust belongs in the product architecture, not in a badge row." copy="The platform is designed around tenant boundaries, least privilege, consent-aware recording, protected storage, strict embedded-content boundaries, signed integrations, auditability, and recovery discipline." primary="Talk to us" primaryHref="/contact?intent=security"/>
  <section className="section shell"><div className="security-grid">{security.map(([title,copy],i)=><article key={title}><span>{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
  <section className="section architecture"><div className="shell policy"><div><SectionTitle dark eyebrow="Data boundaries" title="Keep purpose, identity, and retention explicit."/></div><div><p>Recording and transcript data should not be pushed into generic analytics or advertising payloads. Sensitive data handling, retention, export, deletion, and provider configuration require explicit purpose and tests.</p><p>This website does not claim fabricated certifications or universal legal compliance. Production compliance depends on the actual deployment, providers, contracts, regions, and verified controls.</p></div></div></section><FinalCta/></>;
}

function Pricing(){
  const plans=[
    ['Starter','For individuals and small teams proving the workflow',['Meetings and reusable rooms','Interactive agendas','Booking and event pages','Core collaboration tools','Session memory'],'Create an account',`${appUrl}/signup`],
    ['Team','For teams running repeatable customer-facing sessions',['Everything in Starter','Multiple workspaces','Advanced branding','Integrations and webhooks','Expanded reporting'],'Talk to sales','/contact?intent=pricing'],
    ['Business','For organizations with stronger governance needs',['Everything in Team','Identity and access options','Custom-domain readiness','Governance and audit controls','Deployment and support planning'],'Plan your rollout','/contact?intent=business'],
  ] as const;
  return <><Hero visual={false} eyebrow="Plans & rollout" title="Choose the capability level. Approve the commercial price separately." copy="The research describes tiered quotas and higher-tier capabilities but does not provide an authoritative current price list. This website therefore avoids inventing prices." secondary="Talk to sales" secondaryHref="/contact?intent=pricing"/>
  <section className="section shell"><div className="plans">{plans.map(([name,audience,list,cta,href],i)=><article className={i===1?'featured':''} key={name}>{i===1?<span className="plan-tag">Recommended for teams</span>:null}<small>{audience}</small><h2>{name}</h2><p>{i===0?'Core meeting, agenda, public-event, booking, and memory capabilities.':i===1?'Richer workspace operations, branding, automation, integrations, and reporting when configured.':'Negotiated identity, domain, governance, support, and higher-capacity requirements.'}</p><ul>{list.map(x=><li key={x}>✓ {x}</li>)}</ul><a className={i===1?'btn primary wide':'btn secondary wide'} href={href}>{cta} →</a></article>)}</div><p className="pricing-note">Final quotas, billing cadence, taxes, discounts, support terms, and contractual commitments must be approved before publication.</p></section><FinalCta/></>;
}

function Contact(){
  return <section className="section shell contact"><div><span className="eyebrow">Contact & demo</span><h1>Tell us how your team meets today.</h1><p>Share the workflow you want to improve. The form persists the accepted enquiry in the backend before showing success.</p><div className="contact-points"><span><b>Meetings</b>Agenda-led collaboration and reusable rooms</span><span><b>Webinars</b>Registration, presenters, reminders, and engagement</span><span><b>Scheduling</b>Availability, intake, reservations, and calendars</span><span><b>Platform</b>Security, integrations, API, branding, and rollout</span></div></div><div className="contact-card"><MarketingLeadForm kind="DEMO" title="Request a product conversation" submitLabel="Submit request"/></div></section>;
}

function RouteFlow({title,route,api,dark=false}:{title:string;route:string;api:string;dark?:boolean}){
  return <section className={dark?'section architecture':'section soft'}><div className="shell route-flow"><div><span className="eyebrow">Working public flow</span><h2>{title}</h2><p>The public experience stays independent from the dashboard while using the same business API and durable database state.</p></div><div className="route-card"><small>PUBLIC ROUTE</small><code>{route}</code><span>↓</span><code>{api}</code></div></div></section>;
}

export function MarketingSite({route}:{route:MarketingRoute}){
  useEffect(()=>{
    document.title=meta[route].title;
    let node=document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if(!node){node=document.createElement('meta');node.name='description';document.head.appendChild(node);}
    node.content=meta[route].description;
    window.scrollTo(0,0);
  },[route]);
  const page=route==='home'?<Home/>:route==='product'?<Product/>:route==='meetings'?<Meetings/>:route==='webinars'?<Webinars/>:route==='scheduling'?<Scheduling/>:route==='memory'?<Memory/>:route==='integrations'?<Integrations/>:route==='security'?<Security/>:route==='pricing'?<Pricing/>:<Contact/>;
  return <div className="marketing"><Header/><main id="main">{page}</main><Footer/></div>;
}
