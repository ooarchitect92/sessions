import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, type PollRecord } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BreakoutPanel } from './BreakoutPanel';
import { WhiteboardPanel } from './WhiteboardPanel';

type PanelTab =
  | 'people'
  | 'chat'
  | 'polls'
  | 'questions'
  | 'breakouts'
  | 'whiteboard';

export function SessionCollaborationPanel({
  sessionId,
  onJoinBreakout,
}: {
  sessionId: string;
  onJoinBreakout: (breakoutRoomId: string) => void;
}) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const isHost = (auth.me?.principal.roles ?? []).some((role) =>
    ['OWNER', 'ADMIN', 'HOST'].includes(role),
  );
  const currentUserId = auth.me?.principal.userId ?? '';
  const [tab, setTab] = useState<PanelTab>('people');
  const [chatBody, setChatBody] = useState('');
  const [chatChannel, setChatChannel] = useState<
    'EVERYONE' | 'HOSTS' | 'PRIVATE'
  >('EVERYONE');
  const [chatRecipientUserId, setChatRecipientUserId] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Yes\nNo');
  const [questionBody, setQuestionBody] = useState('');

  const chat = useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => api.listChat(sessionId),
    enabled: tab === 'chat',
  });
  const chatMembers = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.listWorkspaceMembers(),
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
        ...(chatChannel === 'PRIVATE'
          ? { recipientUserId: chatRecipientUserId }
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
      (chatChannel !== 'PRIVATE' || chatRecipientUserId)
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
      <div className="side-tabs six-tabs">
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>People</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'polls' ? 'active' : ''} onClick={() => setTab('polls')}>Polls</button>
        <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>Q&amp;A</button>
        <button className={tab === 'breakouts' ? 'active' : ''} onClick={() => setTab('breakouts')}>Breakouts</button>
        <button className={tab === 'whiteboard' ? 'active' : ''} onClick={() => setTab('whiteboard')}>Board</button>
      </div>

      {tab === 'people' ? (
        <div className="collaboration-scroll">
          <div className="people-list">
            <div className="person-row"><div className="avatar">LO</div><div><strong>Local Owner</strong><small>Host · you</small></div><span>•••</span></div>
          </div>
          <div className="side-panel-note"><strong>Presence is realtime</strong><p>Authenticated socket joins and leaves are broadcast to the session room. Durable attendance intervals are the next analytics increment.</p></div>
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className="collaboration-column">
          <div className="chat-channel-controls">
            <select
              value={chatChannel}
              onChange={(event) => {
                const nextChannel = event.target.value as
                  | 'EVERYONE'
                  | 'HOSTS'
                  | 'PRIVATE';
                setChatChannel(nextChannel);
                if (nextChannel !== 'PRIVATE') setChatRecipientUserId('');
              }}
            >
              <option value="EVERYONE">Everyone</option>
              {isHost ? <option value="HOSTS">Hosts only</option> : null}
              <option value="PRIVATE">Direct message</option>
            </select>
            {chatChannel === 'PRIVATE' ? (
              <select
                value={chatRecipientUserId}
                onChange={(event) => setChatRecipientUserId(event.target.value)}
                aria-label="Direct message recipient"
              >
                <option value="">Choose recipient</option>
                {chatMembers.data
                  ?.filter((membership) => membership.user.id !== currentUserId)
                  .map((membership) => (
                    <option key={membership.id} value={membership.user.id}>
                      {membership.user.displayName}
                    </option>
                  ))}
              </select>
            ) : null}
          </div>
          <div className="collaboration-scroll message-list">
            {chat.isLoading ? <p className="side-muted">Loading chat…</p> : null}
            {chat.data?.map((message) => {
              const directPeer =
                message.channel === 'PRIVATE'
                  ? message.authorUserId === currentUserId
                    ? message.recipient?.displayName
                    : message.author.displayName
                  : null;
              return (
                <article className="chat-message" key={message.id}>
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
                    {message.channel === 'EVERYONE'
                      ? 'Everyone'
                      : message.channel === 'HOSTS'
                        ? 'Hosts only'
                        : `Direct · ${directPeer ?? 'participant'}`}
                  </small>
                  <p>{message.body}</p>
                </article>
              );
            })}
            {chat.data?.length === 0 ? (
              <p className="side-muted">No messages yet.</p>
            ) : null}
          </div>
          <form className="side-composer" onSubmit={submitChat}>
            <textarea
              value={chatBody}
              onChange={(event) => setChatBody(event.target.value)}
              maxLength={5000}
              placeholder={
                chatChannel === 'EVERYONE'
                  ? 'Message everyone'
                  : chatChannel === 'HOSTS'
                    ? 'Message hosts'
                    : 'Send a private message'
              }
            />
            <button
              disabled={
                sendChat.isPending ||
                !chatBody.trim() ||
                (chatChannel === 'PRIVATE' && !chatRecipientUserId)
              }
            >
              Send
            </button>
          </form>
          {sendChat.error ? (
            <div className="error-banner">{sendChat.error.message}</div>
          ) : null}
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

      {tab === 'breakouts' ? (
        <BreakoutPanel sessionId={sessionId} onJoinBreakout={onJoinBreakout} />
      ) : null}

      {tab === 'whiteboard' ? (
        <WhiteboardPanel sessionId={sessionId} />
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
