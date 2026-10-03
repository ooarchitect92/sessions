import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, type PollRecord } from '../api/client';

type PanelTab = 'people' | 'chat' | 'polls' | 'questions';

export function SessionCollaborationPanel({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PanelTab>('people');
  const [chatBody, setChatBody] = useState('');
  const [chatChannel, setChatChannel] = useState<'EVERYONE' | 'HOSTS' | 'PRIVATE'>('EVERYONE');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Yes\nNo');
  const [questionBody, setQuestionBody] = useState('');

  const presence = useQuery({
    queryKey: ['session-presence', sessionId],
    queryFn: () => api.listSessionPresence(sessionId),
    enabled: tab === 'chat' || tab === 'people',
    refetchInterval: 45_000,
  });
  const self = presence.data?.find((participant) => participant.isSelf);
  const chat = useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => api.listChat(sessionId),
    enabled: tab === 'chat',
  });
  const polls = useQuery({
    queryKey: ['polls', sessionId],
    queryFn: () => api.listPolls(sessionId),
    enabled: tab === 'polls',
  });
  const questions = useQuery({
    queryKey: ['questions', sessionId],
    queryFn: () => api.listQuestions(sessionId),
    enabled: tab === 'questions',
  });

  const sendChat = useMutation({
    mutationFn: () =>
      api.createChat(sessionId, {
        channel: chatChannel,
        body: chatBody,
        ...(chatChannel === 'PRIVATE' && recipientUserId
          ? { recipientUserId }
          : {}),
      }),
    onSuccess: async () => {
      setChatBody('');
      await queryClient.invalidateQueries({ queryKey: ['chat', sessionId] });
    },
  });
  const createPoll = useMutation({
    mutationFn: () =>
      api.createPoll(sessionId, {
        question: pollQuestion,
        type: 'SINGLE_CHOICE',
        anonymous: false,
        options: pollOptions.split('\n').map((value) => value.trim()).filter(Boolean),
      }),
    onSuccess: async () => {
      setPollQuestion('');
      await queryClient.invalidateQueries({ queryKey: ['polls', sessionId] });
    },
  });
  const launchPoll = useMutation({
    mutationFn: (poll: PollRecord) => api.launchPoll(sessionId, poll.id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['polls', sessionId] }),
  });
  const closePoll = useMutation({
    mutationFn: (poll: PollRecord) => api.closePoll(sessionId, poll.id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['polls', sessionId] }),
  });
  const answerPoll = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      api.answerPoll(sessionId, pollId, { selectedOptionIds: [optionId] }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['polls', sessionId] }),
  });
  const createQuestion = useMutation({
    mutationFn: () => api.createQuestion(sessionId, { body: questionBody, isAnonymous: false }),
    onSuccess: async () => {
      setQuestionBody('');
      await queryClient.invalidateQueries({ queryKey: ['questions', sessionId] });
    },
  });
  const voteQuestion = useMutation({
    mutationFn: (questionId: string) => api.voteQuestion(sessionId, questionId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['questions', sessionId] }),
  });
  const answerQuestion = useMutation({
    mutationFn: ({ questionId, answerText }: { questionId: string; answerText: string }) =>
      api.moderateQuestion(sessionId, questionId, { status: 'ANSWERED', answerText }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['questions', sessionId] }),
  });

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    if (
      chatBody.trim() &&
      (chatChannel !== 'PRIVATE' || Boolean(recipientUserId))
    ) {
      sendChat.mutate();
    }
  };
  const submitPoll = (event: FormEvent) => {
    event.preventDefault();
    if (pollQuestion.trim()) createPoll.mutate();
  };
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (questionBody.trim()) createQuestion.mutate();
  };

  return (
    <aside className="meeting-side-panel collaboration-panel">
      <div className="side-tabs four-tabs">
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>People</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'polls' ? 'active' : ''} onClick={() => setTab('polls')}>Polls</button>
        <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>Q&amp;A</button>
      </div>

      {tab === 'people' ? (
        <div className="collaboration-scroll">
          <div className="people-list">
            {presence.data?.map((participant) => (
              <div className="person-row" key={participant.userId}>
                <div className="avatar">
                  {participant.displayName
                    .split(' ')
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join('')}
                </div>
                <div>
                  <strong>{participant.displayName}</strong>
                  <small>
                    {participant.roles.map((role) => role.toLowerCase()).join(', ')}
                    {participant.isSelf ? ' · you' : ''}
                  </small>
                </div>
                <span title="Online">●</span>
              </div>
            ))}
            {presence.isLoading ? <p className="side-muted">Loading people…</p> : null}
            {presence.data?.length === 0 ? (
              <p className="side-muted">No active participants.</p>
            ) : null}
          </div>
          <div className="side-panel-note">
            <strong>Live session presence</strong>
            <p>
              The roster is backed by Redis heartbeats so it can be shared across API
              instances and recover from stale browser connections.
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className="collaboration-column">
          <div className="collaboration-scroll message-list">
            {chat.isLoading ? <p className="side-muted">Loading chat…</p> : null}
            {chat.data?.map((message) => (
              <article
                className={message.channel === 'PRIVATE' ? 'chat-message private-message' : 'chat-message'}
                key={message.id}
              >
                <div>
                  <strong>{message.author.displayName}</strong>
                  <span>
                    {new Intl.DateTimeFormat(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(message.createdAt))}
                  </span>
                </div>
                <small className="chat-channel-label">
                  {message.channel === 'PRIVATE'
                    ? `Private · ${message.author.displayName} → ${message.recipient?.displayName ?? 'recipient'}`
                    : message.channel === 'HOSTS'
                      ? 'Hosts'
                      : 'Everyone'}
                </small>
                <p>{message.body}</p>
              </article>
            ))}
            {chat.data?.length === 0 ? <p className="side-muted">No messages yet.</p> : null}
          </div>
          <form className="side-composer private-chat-composer" onSubmit={submitChat}>
            <div className="chat-routing-row">
              <select
                value={chatChannel}
                onChange={(event) => {
                  const next = event.target.value as 'EVERYONE' | 'HOSTS' | 'PRIVATE';
                  setChatChannel(next);
                  if (next !== 'PRIVATE') setRecipientUserId('');
                }}
                aria-label="Chat audience"
              >
                <option value="EVERYONE">Everyone</option>
                {self?.roles.some((role) =>
                  ['OWNER', 'ADMIN', 'HOST'].includes(role),
                ) ? (
                  <option value="HOSTS">Hosts</option>
                ) : null}
                <option value="PRIVATE">Private</option>
              </select>
              {chatChannel === 'PRIVATE' ? (
                <select
                  required
                  value={recipientUserId}
                  onChange={(event) => setRecipientUserId(event.target.value)}
                  aria-label="Private message recipient"
                >
                  <option value="">Choose person…</option>
                  {presence.data
                    ?.filter((participant) => !participant.isSelf)
                    .map((participant) => (
                      <option key={participant.userId} value={participant.userId}>
                        {participant.displayName}
                      </option>
                    ))}
                </select>
              ) : null}
            </div>
            <textarea
              value={chatBody}
              onChange={(event) => setChatBody(event.target.value)}
              maxLength={5000}
              placeholder={
                chatChannel === 'PRIVATE'
                  ? 'Private message'
                  : chatChannel === 'HOSTS'
                    ? 'Message hosts'
                    : 'Message everyone'
              }
            />
            {sendChat.error ? (
              <div className="error-banner compact-error">{sendChat.error.message}</div>
            ) : null}
            <button
              disabled={
                sendChat.isPending ||
                !chatBody.trim() ||
                (chatChannel === 'PRIVATE' && !recipientUserId)
              }
            >
              Send
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'polls' ? (
        <div className="collaboration-column">
          <div className="collaboration-scroll poll-list">
            {polls.data?.map((poll) => (
              <article className="poll-card" key={poll.id}>
                <div className="poll-card-heading"><span>{poll.status.toLowerCase()}</span><strong>{poll.question}</strong></div>
                <div className="poll-options">
                  {poll.options.map((option) => <button key={option.id} disabled={poll.status !== 'LIVE' || answerPoll.isPending} onClick={() => answerPoll.mutate({ pollId: poll.id, optionId: option.id })}>{option.label}</button>)}
                </div>
                <div className="poll-card-footer"><small>{poll._count?.answers ?? 0} responses</small>{poll.status === 'DRAFT' ? <button onClick={() => launchPoll.mutate(poll)}>Launch</button> : null}{poll.status === 'LIVE' ? <button onClick={() => closePoll.mutate(poll)}>Close</button> : null}</div>
              </article>
            ))}
            {polls.data?.length === 0 ? <p className="side-muted">No polls yet.</p> : null}
          </div>
          <form className="side-builder" onSubmit={submitPoll}><input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Poll question" maxLength={1000} /><textarea value={pollOptions} onChange={(event) => setPollOptions(event.target.value)} placeholder="One option per line" /><button disabled={createPoll.isPending || !pollQuestion.trim()}>Create poll</button></form>
        </div>
      ) : null}

      {tab === 'questions' ? (
        <div className="collaboration-column">
          <div className="collaboration-scroll question-list">
            {questions.data?.map((question) => (
              <article className="question-card" key={question.id}><div className="question-meta"><span>{question.authorDisplayName ?? 'Anonymous'}</span><span>{question.status.toLowerCase()}</span></div><p>{question.body}</p>{question.answerText ? <div className="question-answer"><strong>Answer</strong>{question.answerText}</div> : null}<div className="question-actions"><button onClick={() => voteQuestion.mutate(question.id)}>▲ {question.voteCount}</button>{question.status !== 'ANSWERED' ? <button onClick={() => { const answerText = window.prompt('Answer this question'); if (answerText?.trim()) answerQuestion.mutate({ questionId: question.id, answerText }); }}>Answer</button> : null}</div></article>
            ))}
            {questions.data?.length === 0 ? <p className="side-muted">No questions yet.</p> : null}
          </div>
          <form className="side-composer" onSubmit={submitQuestion}><textarea value={questionBody} onChange={(event) => setQuestionBody(event.target.value)} maxLength={5000} placeholder="Ask a question" /><button disabled={createQuestion.isPending || !questionBody.trim()}>Ask</button></form>
        </div>
      ) : null}
    </aside>
  );
}
