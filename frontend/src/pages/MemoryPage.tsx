import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

function statusLabel(status: string | undefined): string {
  return status ? status.toLowerCase().replace('_', ' ') : 'not requested';
}

export function MemoryPage() {
  const [query, setQuery] = useState('');
  const memory = useQuery({
    queryKey: ['memory', query],
    queryFn: () => api.listMemory(query.trim() || undefined),
  });

  return (
    <div className="workflow-page">
      <section className="page-heading memory-heading">
        <div>
          <span className="eyebrow">Meeting memory</span>
          <h1>Keep the decisions, not the meeting fatigue.</h1>
          <p>
            Every ended session can become a governed bundle of recording metadata,
            transcript segments, agenda context, chat, polls, questions, and reviewed AI output.
          </p>
        </div>
        <div className="memory-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, descriptions, and transcript text" aria-label="Search memory" />
        </div>
      </section>

      <section className="panel memory-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Workspace archive</span><h2>Session memory</h2></div>
          <span className="count-pill">{memory.data?.total ?? 0}</span>
        </div>
        {memory.isLoading ? <div className="empty-panel">Loading memory…</div> : null}
        {memory.error ? <div className="error-banner">{memory.error.message}</div> : null}
        {memory.data?.items.length === 0 ? (
          <div className="empty-panel"><span>◇</span><h3>No memory artifacts yet</h3><p>End a session with recording or transcription enabled to create durable processing requests.</p></div>
        ) : null}
        <div className="memory-grid">
          {memory.data?.items.map((item) => (
            <Link className="memory-card" to={`/memory/${item.id}`} key={item.id}>
              <div className="memory-card-top">
                <span className={`status-badge status-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span>
                <span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.startsAt))}</span>
              </div>
              <h3>{item.title}</h3>
              {item.search?.excerpt ? (
                <p className="memory-search-excerpt">{item.search.excerpt}</p>
              ) : null}
              <div className="artifact-row">
                <span><strong>Recording</strong>{statusLabel(item.recording?.status)}</span>
                <span><strong>Transcript</strong>{statusLabel(item.transcript?.status)}</span>
                <span><strong>Summary</strong>{statusLabel(item.memorySummary?.status)}</span>
              </div>
              <div className="workflow-meta">
                <span>{item._count.chatMessages} chat messages</span>
                <span>{item._count.polls} polls</span>
                <span>{item._count.questions} questions</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
