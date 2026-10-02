import type {
  AgendaItemType,
  ApiEnvelope,
  ArtifactStatus,
  BookingPage,
  ChatChannel,
  CreateBookingPageInput,
  CreateEventInput,
  CreatePollInput,
  CreateQuestionInput,
  CreateRoomInput,
  CreateSessionInput,
  Event as PlatformEvent,
  Paginated,
  PollStatus,
  PollType,
  QuestionStatus,
  Room,
  Session,
  SessionStatus,
  SubmitPollAnswerInput,
  UpdateSessionInput,
} from '@sessions/contracts';
import {
  bootstrapAuthentication,
  clearAuthentication,
  getAccessToken,
} from '../auth/dev-auth';

export interface AgendaItem {
  id: string;
  organizationId: string;
  workspaceId: string;
  sessionId: string;
  position: number;
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends Session {
  livekitRoomName: string;
  agendaItems: AgendaItem[];
}

export interface MediaToken {
  url: string;
  token: string;
  expiresIn: number;
  expiresAt: string;
}

export interface EventRecord extends PlatformEvent {
  _count?: { registrations: number };
}

export interface BookingPageRecord extends BookingPage {
  _count?: { reservations: number };
}

export interface RecordingRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  provider: string | null;
  objectKey: string | null;
  playbackObjectKey: string | null;
  durationSeconds: number | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  language: string | null;
  fullText?: string | null;
  completedAt: string | null;
  segments?: Array<{
    id: string;
    position: number;
    startMs: number;
    endMs: number;
    speakerLabel: string | null;
    text: string;
  }>;
}

export interface MemorySummaryRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  provider: string | null;
  model: string | null;
  summaryText: string | null;
  decisions: unknown[];
  actionItems: unknown[];
  citations: unknown[];
  failureCode: string | null;
}

export interface MemoryListItem extends Session {
  recording: RecordingRecord | null;
  transcript: TranscriptRecord | null;
  memorySummary: MemorySummaryRecord | null;
  _count: { chatMessages: number; polls: number; questions: number };
}

export interface MemoryDetail extends SessionDetail {
  recording: RecordingRecord | null;
  transcript: TranscriptRecord | null;
  memorySummary: MemorySummaryRecord | null;
  chatMessages: ChatMessageRecord[];
  polls: PollRecord[];
  questions: QuestionRecord[];
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  authorUserId: string;
  channel: ChatChannel;
  body: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: { displayName: string; avatarUrl: string | null };
}

export interface PollOptionRecord {
  id: string;
  position: number;
  label: string;
}

export interface PollRecord {
  id: string;
  sessionId: string;
  question: string;
  type: PollType;
  status: PollStatus;
  anonymous: boolean;
  launchedAt: string | null;
  closedAt: string | null;
  options: PollOptionRecord[];
  _count?: { answers: number };
}

export interface PollResults {
  pollId: string;
  status: PollStatus;
  responseCount: number;
  options: Array<{ id: string; label: string; count: number }>;
  textAnswers?: string[];
}

export interface QuestionRecord {
  id: string;
  sessionId: string;
  authorDisplayName: string | null;
  body: string;
  status: QuestionStatus;
  isAnonymous: boolean;
  answerText: string | null;
  answeredAt: string | null;
  createdAt: string;
  voteCount: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = getAccessToken() ?? (await bootstrapAuthentication());
  const execute = () => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    headers.set('authorization', `Bearer ${token}`);
    headers.set('x-request-id', crypto.randomUUID());

    return fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      ...init,
      headers,
    });
  };

  let response = await execute();
  if (response.status === 401 && import.meta.env.VITE_AUTH_MODE === 'development') {
    clearAuthentication();
    token = await bootstrapAuthentication();
    response = await execute();
  }

  const requestId = response.headers.get('x-request-id') ?? undefined;
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { message?: string | string[] }
    | { error?: { message?: string; requestId?: string } }
    | null;
  if (!response.ok) {
    const rawMessage = payload && 'message' in payload ? payload.message : undefined;
    const envelopeMessage = payload && 'error' in payload ? payload.error?.message : undefined;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : rawMessage ?? envelopeMessage ?? `Request failed (${response.status})`;
    const errorRequestId = payload && 'error' in payload ? payload.error?.requestId : undefined;
    throw new ApiError(message, response.status, errorRequestId ?? requestId);
  }
  if (!payload || !('data' in payload)) {
    throw new ApiError('The API returned an invalid response', response.status, requestId);
  }
  return payload.data;
}

export const api = {
  listRooms(): Promise<Room[]> {
    return request<Room[]>('/rooms');
  },

  createRoom(input: CreateRoomInput): Promise<Room> {
    return request<Room>('/rooms', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  deleteRoom(roomId: string, version: number): Promise<{ id: string }> {
    return request<{ id: string }>(`/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'if-match': String(version) },
    });
  },

  listSessions(status?: SessionStatus): Promise<Paginated<Session>> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<Paginated<Session>>(`/sessions${query}`);
  },

  getSession(sessionId: string): Promise<SessionDetail> {
    return request<SessionDetail>(`/sessions/${sessionId}`);
  },

  createSession(input: CreateSessionInput): Promise<Session> {
    return request<Session>('/sessions', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  updateSession(
    sessionId: string,
    version: number,
    input: UpdateSessionInput,
  ): Promise<Session> {
    return request<Session>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
      body: JSON.stringify(input),
    });
  },

  transitionSession(
    sessionId: string,
    version: number,
    action: 'publish' | 'start' | 'end' | 'cancel',
  ): Promise<Session> {
    return request<Session>(`/sessions/${sessionId}/${action}`, {
      method: 'POST',
      headers: { 'if-match': String(version) },
    });
  },

  createAgendaItem(
    sessionId: string,
    input: {
      title: string;
      durationSeconds: number;
      type: AgendaItemType;
      content: Record<string, unknown>;
    },
  ): Promise<AgendaItem> {
    return request<AgendaItem>(`/sessions/${sessionId}/agenda-items`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  activateAgendaItem(sessionId: string, agendaItemId: string) {
    return request<{ sessionId: string; agendaItem: AgendaItem; activatedAt: string }>(
      `/sessions/${sessionId}/agenda-items/${agendaItemId}/activate`,
      { method: 'POST' },
    );
  },

  createMediaToken(sessionId: string): Promise<MediaToken> {
    return request<MediaToken>(`/sessions/${sessionId}/media-token`, {
      method: 'POST',
    });
  },

  listEvents(): Promise<EventRecord[]> {
    return request<EventRecord[]>('/events');
  },

  createEvent(input: CreateEventInput): Promise<EventRecord> {
    return request<EventRecord>('/events', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  publishEvent(eventId: string, version: number): Promise<EventRecord> {
    return request<EventRecord>(`/events/${eventId}/publish`, {
      method: 'POST',
      headers: { 'if-match': String(version) },
    });
  },

  cancelEvent(eventId: string, version: number): Promise<EventRecord> {
    return request<EventRecord>(`/events/${eventId}/cancel`, {
      method: 'POST',
      headers: { 'if-match': String(version) },
    });
  },

  listBookings(): Promise<BookingPageRecord[]> {
    return request<BookingPageRecord[]>('/bookings');
  },

  createBooking(input: CreateBookingPageInput): Promise<BookingPageRecord> {
    return request<BookingPageRecord>('/bookings', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  updateBooking(
    bookingId: string,
    version: number,
    input: Partial<CreateBookingPageInput> & { active?: boolean },
  ): Promise<BookingPageRecord> {
    return request<BookingPageRecord>(`/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
      body: JSON.stringify(input),
    });
  },

  listMemory(query?: string): Promise<Paginated<MemoryListItem>> {
    const search = query ? `?query=${encodeURIComponent(query)}` : '';
    return request<Paginated<MemoryListItem>>(`/memory${search}`);
  },

  getMemory(sessionId: string): Promise<MemoryDetail> {
    return request<MemoryDetail>(`/memory/${sessionId}`);
  },

  retryMemory(sessionId: string): Promise<{ sessionId: string; retried: string[] }> {
    return request<{ sessionId: string; retried: string[] }>(`/memory/${sessionId}/retry`, {
      method: 'POST',
    });
  },

  listChat(sessionId: string): Promise<ChatMessageRecord[]> {
    return request<ChatMessageRecord[]>(`/sessions/${sessionId}/chat-messages`);
  },

  createChat(
    sessionId: string,
    input: { channel: ChatChannel; body: string },
  ): Promise<ChatMessageRecord> {
    return request<ChatMessageRecord>(`/sessions/${sessionId}/chat-messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listPolls(sessionId: string): Promise<PollRecord[]> {
    return request<PollRecord[]>(`/sessions/${sessionId}/polls`);
  },

  createPoll(sessionId: string, input: CreatePollInput): Promise<PollRecord> {
    return request<PollRecord>(`/sessions/${sessionId}/polls`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  launchPoll(sessionId: string, pollId: string): Promise<PollRecord> {
    return request<PollRecord>(`/sessions/${sessionId}/polls/${pollId}/launch`, {
      method: 'POST',
    });
  },

  closePoll(sessionId: string, pollId: string): Promise<PollRecord> {
    return request<PollRecord>(`/sessions/${sessionId}/polls/${pollId}/close`, {
      method: 'POST',
    });
  },

  answerPoll(
    sessionId: string,
    pollId: string,
    input: SubmitPollAnswerInput,
  ): Promise<unknown> {
    return request(`/sessions/${sessionId}/polls/${pollId}/answers`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  pollResults(sessionId: string, pollId: string): Promise<PollResults> {
    return request<PollResults>(`/sessions/${sessionId}/polls/${pollId}/results`);
  },

  listQuestions(sessionId: string): Promise<QuestionRecord[]> {
    return request<QuestionRecord[]>(`/sessions/${sessionId}/questions`);
  },

  createQuestion(sessionId: string, input: CreateQuestionInput): Promise<QuestionRecord> {
    return request<QuestionRecord>(`/sessions/${sessionId}/questions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  voteQuestion(
    sessionId: string,
    questionId: string,
  ): Promise<{ questionId: string; voted: boolean; voteCount: number }> {
    return request(`/sessions/${sessionId}/questions/${questionId}/vote`, {
      method: 'POST',
    });
  },

  moderateQuestion(
    sessionId: string,
    questionId: string,
    input: { status: QuestionStatus; answerText?: string },
  ): Promise<QuestionRecord> {
    return request<QuestionRecord>(`/sessions/${sessionId}/questions/${questionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};
