import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, type PollRecord } from '../api/client';
import { BreakoutPanel } from './BreakoutPanel';

type PanelTab = 'people' | 'chat' | 'polls' | 'questions' | 'breakouts';

export function SessionCollaborationPanel({
  sessionId,
  activeBreakoutRoomId,
  onJoinBreakout,
  onReturnMain,
}: {
  sessionId: string;
  activeBreakoutRoomId?: string | null;
  onJoinBreakout: (roomId: string) => void;
  onReturnMain: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PanelTab>('people');
  const [chatBody, setChatBody] = useState('');
  const [chatAudience, setChatAudience] = useState<'EVERYONE' | 'HOSTS' | 'DIRECT'>('EVERYONE');
  const [chatRecipientUserId, setChatRecipientUserId] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Yes\nNo');
  const [questionBody, setQuestionBody] = useState('');

  const auth = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.authMe(),
    staleTime: 60_000,
  });
  const members = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.listWorkspaceMembers(),
    enabled: tab === 'chat',
    staleTime: 60_000,
  });
  const mediaParticipants = useQuery({
    queryKey: [
      'media-participants',
      sessionId,
      activeBreakoutRoomId ?? 'main',
    ],
    queryFn: () =>
      api.listMediaParticipants(sessionId, activeBreakoutRoomId ?? null),
    enabled: tab === 'people',
    refetchInterval: tab === 'people' ? 3000 : false,
  });

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

  const setHandRaised = useMutation({
    mutationFn: (raised: boolean) =>
      api.setMyHandRaised(
        sessionId,
        raised,
        activeBreakoutRoomId ?? null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          'media-participants',
          sessionId,
          activeBreakoutRoomId ?? 'main',
        ],
      });
    },
  });

  const setTrackMuted = useMutation({
    mutationFn: ({
      participantIdentity,
      trackSid,
      muted,
    }: {
      participantIdentity: string;
      trackSid: string;
      muted: boolean;
    }) =>
      api.setMediaTrackMuted(
        sessionId,
        participantIdentity,
        trackSid,
        muted,
        activeBreakoutRoomId ?? null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          'media-participants',
          sessionId,
          activeBreakoutRoomId ?? 'main',
        ],
      });
    },
  });

  const setSpotlight = useMutation({
    mutationFn: ({
      participantIdentity,
      spotlighted,
    }: {
      participantIdentity: string;
      spotlighted: boolean;
    }) =>
      api.setMediaParticipantSpotlight(
        sessionId,
        participantIdentity,
        spotlighted,
        activeBreakoutRoomId ?? null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          'media-participants',
          sessionId,
          activeBreakoutRoomId ?? 'main',
        ],
      });
    },
  });

  const setPublishing = useMutation({
    mutationFn: ({
      participantIdentity,
      canPublish,
    }: {
      participantIdentity: string;
      canPublish: boolean;
    }) =>
      api.setMediaParticipantPublishing(
        sessionId,
        participantIdentity,
        canPublish,
        activeBreakoutRoomId ?? null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          'media-participants',
          sessionId,
          activeBreakoutRoomId ?? 'main',
        ],
      });
    },
  });

  const removeParticipant = useMutation({
    mutationFn: (participantIdentity: string) =>
      api.removeMediaParticipant(
        sessionId,
        participantIdentity,
        activeBreakoutRoomId ?? null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          'media-participants',
          sessionId,
          activeBreakoutRoomId ?? 'main',
        ],
      });
    },
  });

  const sendChat = useMutation({
    mutationFn: () =>
      api.createChat(sessionId, {
        channel: chatAudience,
        body: chatBody,
        ...(chatAudience === 'DIRECT' && chatRecipientUserId
          ? { recipientUserId: chatRecipientUserId }
          : {}),
      }),
    onSuccess: async () => {
      setChatBody('');
      await queryClient.invalidateQueries({ queryKey: ['chat', sessionId] });
    },
  });
  const toggleReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.toggleChatReaction(sessionId, messageId, emoji),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['chat', sessionId] }),
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

  const isHost =
    auth.data?.principal.roles.some((role) =>
      ['OWNER', 'ADMIN', 'HOST'].includes(role),
    ) ?? false;

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    if (chatBody.trim()) sendChat.mutate();
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
      <div className="side-tabs five-tabs">
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>People</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'polls' ? 'active' : ''} onClick={() => setTab('polls')}>Polls</button>
        <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>Q&amp;A</button>
        <button className={tab === 'breakouts' ? 'active' : ''} onClick={() => setTab('breakouts')}>Rooms</button>
      </div>

      {tab === 'people' ? (
        <div className="collaboration-scroll">
          <div className="people-panel-heading">
            <div>
              <strong>Live participants</strong>
              <span>
                {activeBreakoutRoomId ? 'Breakout room' : 'Main room'} ·{' '}
                {mediaParticipants.data?.participants.length ?? 0} connected
              </span>
            </div>
            <button
              type="button"
              className="participant-refresh"
              onClick={() => void mediaParticipants.refetch()}
              disabled={mediaParticipants.isFetching}
            >
              {mediaParticipants.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="people-list">
            {mediaParticipants.isLoading ? (
              <p className="side-muted">Loading live participants…</p>
            ) : null}
            {mediaParticipants.data?.participants.map((participant) => {
              const isSelf = participant.identity === auth.data?.principal.userId;
              const roleLabel =
                participant.presenterRole ??
                participant.roles[0] ??
                (participant.canPublish ? 'participant' : 'attendee');
              return (
                <article className="participant-card" key={participant.identity}>
                  <div className="participant-card-heading">
                    <div className="avatar">
                      {participant.name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <strong>{participant.name}</strong>
                      <small>
                        {roleLabel.toLowerCase().replaceAll('_', ' ')}
                        {isSelf ? ' · you' : ''}
                        {' · '}
                        {participant.state}
                      </small>
                    </div>
                    <div className="participant-state-stack">
                      {participant.handRaised ? (
                        <span className="participant-hand-raised">✋ Raised</span>
                      ) : null}
                      {participant.spotlighted ? (
                        <span className="participant-spotlight-state">Spotlight</span>
                      ) : null}
                      <span
                        className={
                          participant.isPublisher
                            ? 'participant-publish-state live'
                            : 'participant-publish-state'
                        }
                      >
                        {participant.isPublisher ? 'publishing' : 'listening'}
                      </span>
                    </div>
                  </div>

                  <div className="participant-track-list">
                    {participant.tracks.map((track) => (
                      <div className="participant-track-row" key={track.sid}>
                        <div>
                          <strong>
                            {track.source === 'unknown'
                              ? track.kind
                              : track.source.replaceAll('-', ' ')}
                          </strong>
                          <small>{track.muted ? 'Muted' : 'Live'}</small>
                        </div>
                        {isHost && !isSelf && track.kind !== 'data' ? (
                          <button
                            type="button"
                            disabled={setTrackMuted.isPending}
                            onClick={() =>
                              setTrackMuted.mutate({
                                participantIdentity: participant.identity,
                                trackSid: track.sid,
                                muted: !track.muted,
                              })
                            }
                          >
                            {track.muted ? 'Unmute' : 'Mute'}
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {participant.tracks.length === 0 ? (
                      <span className="participant-no-tracks">
                        No published camera, microphone or screen tracks.
                      </span>
                    ) : null}
                  </div>

                  {isSelf ? (
                    <div className="participant-self-actions">
                      <button
                        type="button"
                        disabled={setHandRaised.isPending}
                        onClick={() => setHandRaised.mutate(!participant.handRaised)}
                      >
                        {participant.handRaised ? 'Lower hand' : 'Raise hand'}
                      </button>
                    </div>
                  ) : null}

                  {isHost && !isSelf ? (
                    <div className="participant-moderation-actions">
                      <button
                        type="button"
                        className="participant-spotlight-action"
                        disabled={setSpotlight.isPending}
                        onClick={() =>
                          setSpotlight.mutate({
                            participantIdentity: participant.identity,
                            spotlighted: !participant.spotlighted,
                          })
                        }
                      >
                        {participant.spotlighted ? 'Clear spotlight' : 'Spotlight'}
                      </button>
                      <button
                        type="button"
                        className="participant-publishing-action"
                        disabled={setPublishing.isPending}
                        onClick={() =>
                          setPublishing.mutate({
                            participantIdentity: participant.identity,
                            canPublish: !participant.canPublish,
                          })
                        }
                      >
                        {participant.canPublish
                          ? 'Disable publishing'
                          : 'Allow publishing'}
                      </button>
                      <button
                      type="button"
                      className="participant-remove"
                      disabled={removeParticipant.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${participant.name} from this media room?`,
                          )
                        ) {
                          removeParticipant.mutate(participant.identity);
                        }
                      }}
                    >
                      Remove from room
                    </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {mediaParticipants.data?.participants.length === 0 ? (
              <p className="side-muted">No one is connected to this media room yet.</p>
            ) : null}
          </div>

          {mediaParticipants.error ? (
            <div className="error-banner compact-error">
              {mediaParticipants.error.message}
            </div>
          ) : null}
          {setHandRaised.error ? (
            <div className="error-banner compact-error">
              {setHandRaised.error.message}
            </div>
          ) : null}
          {setTrackMuted.error ? (
            <div className="error-banner compact-error">
              {setTrackMuted.error.message}
            </div>
          ) : null}
          {setSpotlight.error ? (
            <div className="error-banner compact-error">
              {setSpotlight.error.message}
            </div>
          ) : null}
          {setPublishing.error ? (
            <div className="error-banner compact-error">
              {setPublishing.error.message}
            </div>
          ) : null}
          {removeParticipant.error ? (
            <div className="error-banner compact-error">
              {removeParticipant.error.message}
            </div>
          ) : null}
          <div className="side-panel-note">
            <strong>Host moderation</strong>
            <p>
              The People panel reads the active LiveKit room and refreshes every
              three seconds. Hosts can mute published tracks or eject another
              participant; moderation actions are server-authorized and audited.
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className="collaboration-column">
          <div className="chat-audience-controls">
            <select
              value={chatAudience}
              onChange={(event) => {
                const value = event.target.value as typeof chatAudience;
                setChatAudience(value);
                if (value !== 'DIRECT') setChatRecipientUserId('');
              }}
            >
              <option value="EVERYONE">Everyone</option>
              {auth.data?.principal.roles.some((role) =>
                ['OWNER', 'ADMIN', 'HOST'].includes(role),
              ) ? (
                <option value="HOSTS">Hosts only</option>
              ) : null}
              <option value="DIRECT">Direct message</option>
            </select>
            {chatAudience === 'DIRECT' ? (
              <select
                value={chatRecipientUserId}
                onChange={(event) => setChatRecipientUserId(event.target.value)}
                required
              >
                <option value="">Choose recipient</option>
                {members.data
                  ?.filter((member) => member.user.id !== auth.data?.principal.userId)
                  .map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.displayName}
                    </option>
                  ))}
              </select>
            ) : null}
          </div>

          <div className="collaboration-scroll message-list">
            {chat.isLoading ? <p className="side-muted">Loading chat…</p> : null}
            {chat.data?.map((message) => {
              const reactionCounts = message.reactions.reduce<Record<string, number>>(
                (counts, reaction) => ({
                  ...counts,
                  [reaction.emoji]: (counts[reaction.emoji] ?? 0) + 1,
                }),
                {},
              );
              const directLabel =
                message.channel === 'DIRECT'
                  ? `Direct · ${message.recipient?.displayName ?? 'participant'}`
                  : message.channel === 'HOSTS'
                    ? 'Hosts only'
                    : null;
              return (
                <article className="chat-message" key={message.id}>
                  <div>
                    <strong>{message.author.displayName}</strong>
                    <span>
                      {directLabel ? `${directLabel} · ` : ''}
                      {new Intl.DateTimeFormat(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(message.createdAt))}
                    </span>
                  </div>
                  <p>{message.body}</p>
                  <div className="chat-reactions" aria-label="Message reactions">
                    {['👍', '❤️', '😂', '🎉', '👏', '👀'].map((emoji) => {
                      const active = message.reactions.some(
                        (reaction) =>
                          reaction.userId === auth.data?.principal.userId &&
                          reaction.emoji === emoji,
                      );
                      return (
                        <button
                          type="button"
                          className={active ? 'active' : ''}
                          key={emoji}
                          disabled={toggleReaction.isPending}
                          onClick={() =>
                            toggleReaction.mutate({ messageId: message.id, emoji })
                          }
                          aria-label={`React with ${emoji}`}
                        >
                          {emoji}
                          {reactionCounts[emoji] ? (
                            <span>{reactionCounts[emoji]}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
            {chat.data?.length === 0 ? <p className="side-muted">No messages yet.</p> : null}
          </div>
          <form className="side-composer" onSubmit={submitChat}>
            <textarea
              value={chatBody}
              onChange={(event) => setChatBody(event.target.value)}
              maxLength={5000}
              placeholder={
                chatAudience === 'DIRECT'
                  ? 'Private message'
                  : chatAudience === 'HOSTS'
                    ? 'Message hosts'
                    : 'Message everyone'
              }
            />
            <button
              disabled={
                sendChat.isPending ||
                !chatBody.trim() ||
                (chatAudience === 'DIRECT' && !chatRecipientUserId)
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

      {tab === 'breakouts' ? (
        <BreakoutPanel
          sessionId={sessionId}
          onJoinBreakout={onJoinBreakout}
          onReturnMain={onReturnMain}
        />
      ) : null}
    </aside>
  );
}
