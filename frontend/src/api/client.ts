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
  RecordingConsentDecision,
  Room,
  Session,
  SessionStatus,
  SubmitPollAnswerInput,
  UpdateSessionInput,
  WorkspaceRole,
} from "@sessions/contracts";
import {
  bootstrapAuthentication,
  clearAuthentication,
  getRefreshToken,
  refreshAuthentication,
  type StoredTokenBundle,
} from "../auth/session";


export interface AuthPrincipal {
  userId: string;
  organizationId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  roles: WorkspaceRole[];
  sessionId?: string;
}

export interface WorkspaceAccess {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  timezone: string;
  role: WorkspaceRole;
}

export interface AuthTokenBundle extends StoredTokenBundle {
  principal: AuthPrincipal;
  workspaces: WorkspaceAccess[];
}

export interface AuthMe {
  principal: AuthPrincipal;
  profile: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    emailVerifiedAt: string | null;
    mfaEnabled: boolean;
  };
  workspaces: WorkspaceAccess[];
}

export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  timezone: string;
  settings: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  currentRole: WorkspaceRole;
  organization: { id: string; name: string; slug: string };
  _count: {
    memberships: number;
    rooms: number;
    sessions: number;
    events: number;
    bookingPages: number;
  };
}

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    emailVerifiedAt: string | null;
    lastLoginAt: string | null;
    mfaEnabled: boolean;
  };
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitedBy?: { id: string; displayName: string; email: string };
  acceptedBy?: { id: string; displayName: string; email: string } | null;
  developmentInvitationToken?: string;
}

export interface LoginSession {
  id: string;
  workspace: { id: string; name: string; organization: string };
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

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

export interface AgendaDraftItem {
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  content: Record<string, unknown>;
}

export interface AgendaDraft {
  sessionId: string;
  provider: string;
  model: string | null;
  items: AgendaDraftItem[];
}

export interface SessionDetail extends Session {
  livekitRoomName: string;
  agendaItems: AgendaItem[];
}

export interface ResolvedEmbed {
  provider:
    | 'youtube'
    | 'vimeo'
    | 'google'
    | 'figma'
    | 'miro'
    | 'canva'
    | 'notion'
    | 'generic';
  sourceUrl: string;
  embedUrl: string;
  hostname: string;
  sandbox: string;
  allow: string;
  referrerPolicy: 'no-referrer';
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
  mimeType: string | null;
  sizeBytes: string | null;
  retentionUntil: string | null;
  deletionRequestedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingConsentStatus {
  sessionId: string;
  required: boolean;
  currentDecision: RecordingConsentDecision | null;
  policyVersion: string;
  noticeVersion: string;
  counts: { granted: number; declined: number; revoked: number };
  updatedAt: string | null;
}

export interface RecordingPlaybackGrant {
  recordingId: string;
  sessionId: string;
  url: string;
  disposition: 'inline' | 'attachment';
  expiresAt: string;
  mimeType: string;
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

export interface SummaryDecision {
  text: string;
}

export interface SummaryActionItem {
  text: string;
  owner?: string | null;
  dueDate?: string | null;
}

export interface SummaryCitation {
  quote: string;
  startMs?: number | null;
  endMs?: number | null;
}

export interface MemorySummaryRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  provider: string | null;
  model: string | null;
  summaryText: string | null;
  decisions: SummaryDecision[];
  actionItems: SummaryActionItem[];
  citations: SummaryCitation[];
  failureCode: string | null;
  version: number;
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

export interface ChatReactionRecord {
  id: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  authorUserId: string;
  recipientUserId: string | null;
  channel: ChatChannel;
  body: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: { displayName: string; avatarUrl: string | null };
  recipient: { id: string; displayName: string; avatarUrl: string | null } | null;
  reactions: ChatReactionRecord[];
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
    this.name = "ApiError";
  }
}

async function decodeResponse<T>(response: Response): Promise<T> {
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

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  let token = authenticated ? await bootstrapAuthentication() : null;
  const execute = (accessToken: string | null) => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    headers.set('x-request-id', crypto.randomUUID());
    return fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...init, headers });
  };

  let response = await execute(token);
  if (authenticated && response.status === 401) {
    try {
      token = await refreshAuthentication();
    } catch {
      if (import.meta.env.VITE_AUTH_MODE !== 'development') {
        clearAuthentication();
        return decodeResponse<T>(response);
      }
      clearAuthentication();
      token = await bootstrapAuthentication();
    }
    response = await execute(token);
  }
  return decodeResponse<T>(response);
}

function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, false);
}

export const api = {
  signUp(input: {
    email: string;
    displayName: string;
    password: string;
    organizationName: string;
    organizationSlug: string;
    workspaceName: string;
    workspaceSlug: string;
    timezone: string;
  }): Promise<AuthTokenBundle | { verificationRequired: true; email: string; developmentVerificationToken?: string }> {
    return publicRequest('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
  },

  login(input: { email: string; password: string; workspaceSlug?: string }): Promise<
    | AuthTokenBundle
    | { mfaRequired: true; challengeToken: string; expiresIn: number }
  > {
    return publicRequest('/auth/login', { method: 'POST', body: JSON.stringify(input) });
  },

  completeMfa(input: { challengeToken: string; code: string }): Promise<AuthTokenBundle> {
    return publicRequest<AuthTokenBundle>('/auth/mfa/complete', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  verifyEmail(token: string): Promise<AuthTokenBundle> {
    return publicRequest<AuthTokenBundle>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  requestEmailVerification(email: string): Promise<{
    accepted: true;
    developmentVerificationToken?: string;
  }> {
    return publicRequest('/auth/verify-email/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  requestPasswordReset(email: string): Promise<{ accepted: true; developmentResetToken?: string }> {
    return publicRequest('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, password: string): Promise<{ reset: true }> {
    return publicRequest('/auth/password-reset/complete', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  acceptInvitation(input: { token: string; displayName?: string; password: string }): Promise<
    AuthTokenBundle | { mfaRequired: true; challengeToken: string; expiresIn: number }
  > {
    return publicRequest('/auth/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  authMe(): Promise<AuthMe> {
    return request<AuthMe>('/auth/me');
  },

  async switchWorkspace(workspaceId: string): Promise<AuthTokenBundle> {
    await bootstrapAuthentication();
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new ApiError('A managed login session is required', 401);
    }
    return request<AuthTokenBundle>('/auth/workspace/switch', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, refreshToken }),
    });
  },

  logout(): Promise<{ loggedOut: true }> {
    return request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  listLoginSessions(): Promise<LoginSession[]> {
    return request<LoginSession[]>('/auth/sessions');
  },

  revokeLoginSession(sessionId: string): Promise<{ id: string; revoked: true }> {
    return request(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  },

  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
    return request('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  setupMfa(): Promise<{ secret: string; otpauthUri: string; recoveryCodes: string[] }> {
    return request('/auth/mfa/setup', { method: 'POST' });
  },

  confirmMfa(code: string): Promise<{ enabled: true }> {
    return request('/auth/mfa/confirm', { method: 'POST', body: JSON.stringify({ code }) });
  },

  disableMfa(code: string): Promise<{ enabled: false }> {
    return request('/auth/mfa', { method: 'DELETE', body: JSON.stringify({ code }) });
  },

  listWorkspaces(): Promise<Array<{
    membershipId: string;
    role: WorkspaceRole;
    organization: { id: string; name: string; slug: string };
    workspace: {
      id: string;
      name: string;
      slug: string;
      timezone: string;
      version: number;
      memberCount: number;
      sessionCount: number;
    };
    current: boolean;
  }>> {
    return request('/workspaces');
  },

  createWorkspace(input: { name: string; slug: string; timezone: string }): Promise<WorkspaceRecord> {
    return request('/workspaces', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  getCurrentWorkspace(): Promise<WorkspaceRecord> {
    return request('/workspaces/current');
  },

  updateCurrentWorkspace(
    version: number,
    input: Partial<Pick<WorkspaceRecord, 'name' | 'slug' | 'timezone' | 'settings'>>,
  ): Promise<WorkspaceRecord> {
    return request('/workspaces/current', {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
      body: JSON.stringify(input),
    });
  },

  listWorkspaceMembers(): Promise<WorkspaceMember[]> {
    return request('/workspaces/current/members');
  },

  updateWorkspaceMemberRole(membershipId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    return request(`/workspaces/current/members/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  removeWorkspaceMember(membershipId: string): Promise<{ id: string; removed: true }> {
    return request(`/workspaces/current/members/${membershipId}`, { method: 'DELETE' });
  },

  listWorkspaceInvitations(): Promise<WorkspaceInvitation[]> {
    return request('/workspaces/current/invitations');
  },

  inviteWorkspaceMember(email: string, role: WorkspaceRole): Promise<WorkspaceInvitation> {
    return request('/workspaces/current/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  revokeWorkspaceInvitation(invitationId: string): Promise<{ id: string; revoked: true }> {
    return request(`/workspaces/current/invitations/${invitationId}`, { method: 'DELETE' });
  },
  listRooms(): Promise<Room[]> {
    return request<Room[]>("/rooms");
  },

  createRoom(input: CreateRoomInput): Promise<Room> {
    return request<Room>("/rooms", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  deleteRoom(roomId: string, version: number): Promise<{ id: string }> {
    return request<{ id: string }>(`/rooms/${roomId}`, {
      method: "DELETE",
      headers: { "if-match": String(version) },
    });
  },

  listSessions(status?: SessionStatus): Promise<Paginated<Session>> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<Paginated<Session>>(`/sessions${query}`);
  },

  getSession(sessionId: string): Promise<SessionDetail> {
    return request<SessionDetail>(`/sessions/${sessionId}`);
  },

  createSession(input: CreateSessionInput): Promise<Session> {
    return request<Session>("/sessions", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  updateSession(
    sessionId: string,
    version: number,
    input: UpdateSessionInput,
  ): Promise<Session> {
    return request<Session>(`/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  transitionSession(
    sessionId: string,
    version: number,
    action: "publish" | "start" | "end" | "cancel",
  ): Promise<Session> {
    return request<Session>(`/sessions/${sessionId}/${action}`, {
      method: "POST",
      headers: { "if-match": String(version) },
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
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  generateAgendaDraft(sessionId: string, prompt?: string): Promise<AgendaDraft> {
    return request<AgendaDraft>(`/sessions/${sessionId}/agenda-items/generate-draft`, {
      method: "POST",
      body: JSON.stringify(prompt?.trim() ? { prompt: prompt.trim() } : {}),
    });
  },

  applyAgendaDraft(
    sessionId: string,
    items: AgendaDraftItem[],
    mode: "APPEND" | "REPLACE",
  ): Promise<AgendaItem[]> {
    return request<AgendaItem[]>(`/sessions/${sessionId}/agenda-items/apply-draft`, {
      method: "POST",
      body: JSON.stringify({ items, mode }),
    });
  },

  activateAgendaItem(sessionId: string, agendaItemId: string) {
    return request<{
      sessionId: string;
      agendaItem: AgendaItem;
      activatedAt: string;
    }>(`/sessions/${sessionId}/agenda-items/${agendaItemId}/activate`, {
      method: "POST",
    });
  },

  resolveEmbed(url: string): Promise<ResolvedEmbed> {
    return request<ResolvedEmbed>('/content/resolve-embed', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  getRecordingConsent(sessionId: string): Promise<RecordingConsentStatus> {
    return request<RecordingConsentStatus>(
      `/sessions/${sessionId}/recording-consent`,
    );
  },

  recordRecordingConsent(
    sessionId: string,
    decision: RecordingConsentDecision,
    policyVersion: string,
    noticeVersion: string,
  ): Promise<{
    sessionId: string;
    decision: RecordingConsentDecision;
    policyVersion: string;
    noticeVersion: string;
    updatedAt: string;
  }> {
    return request(`/sessions/${sessionId}/recording-consent`, {
      method: "POST",
      body: JSON.stringify({ decision, policyVersion, noticeVersion }),
    });
  },

  createMediaToken(sessionId: string): Promise<MediaToken> {
    return request<MediaToken>(`/sessions/${sessionId}/media-token`, {
      method: "POST",
    });
  },

  createRecordingPlaybackGrant(
    sessionId: string,
    disposition: "inline" | "attachment" = "inline",
  ): Promise<RecordingPlaybackGrant> {
    return request<RecordingPlaybackGrant>(
      `/recordings/${sessionId}/playback?disposition=${disposition}`,
    );
  },

  updateRecordingRetention(
    sessionId: string,
    retentionUntil: string | null,
  ): Promise<RecordingRecord> {
    return request<RecordingRecord>(`/recordings/${sessionId}/retention`, {
      method: "PATCH",
      body: JSON.stringify({ retentionUntil }),
    });
  },

  deleteRecording(
    sessionId: string,
  ): Promise<{ recordingId: string; sessionId: string; accepted: true }> {
    return request(`/recordings/${sessionId}`, { method: "DELETE" });
  },

  listEvents(): Promise<EventRecord[]> {
    return request<EventRecord[]>("/events");
  },

  createEvent(input: CreateEventInput): Promise<EventRecord> {
    return request<EventRecord>("/events", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  publishEvent(eventId: string, version: number): Promise<EventRecord> {
    return request<EventRecord>(`/events/${eventId}/publish`, {
      method: "POST",
      headers: { "if-match": String(version) },
    });
  },

  cancelEvent(eventId: string, version: number): Promise<EventRecord> {
    return request<EventRecord>(`/events/${eventId}/cancel`, {
      method: "POST",
      headers: { "if-match": String(version) },
    });
  },

  listBookings(): Promise<BookingPageRecord[]> {
    return request<BookingPageRecord[]>("/bookings");
  },

  createBooking(input: CreateBookingPageInput): Promise<BookingPageRecord> {
    return request<BookingPageRecord>("/bookings", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  updateBooking(
    bookingId: string,
    version: number,
    input: Partial<CreateBookingPageInput> & { active?: boolean },
  ): Promise<BookingPageRecord> {
    return request<BookingPageRecord>(`/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  listMemory(query?: string): Promise<Paginated<MemoryListItem>> {
    const search = query ? `?query=${encodeURIComponent(query)}` : "";
    return request<Paginated<MemoryListItem>>(`/memory${search}`);
  },

  getMemory(sessionId: string): Promise<MemoryDetail> {
    return request<MemoryDetail>(`/memory/${sessionId}`);
  },

  updateMemorySummary(
    sessionId: string,
    version: number,
    input: {
      summaryText?: string;
      decisions?: SummaryDecision[];
      actionItems?: SummaryActionItem[];
      citations?: SummaryCitation[];
    },
  ): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(`/memory/${sessionId}/summary`, {
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  retryMemory(
    sessionId: string,
  ): Promise<{ sessionId: string; retried: string[] }> {
    return request<{ sessionId: string; retried: string[] }>(
      `/memory/${sessionId}/retry`,
      {
        method: "POST",
      },
    );
  },

  listChat(sessionId: string): Promise<ChatMessageRecord[]> {
    return request<ChatMessageRecord[]>(`/sessions/${sessionId}/chat-messages`);
  },

  createChat(
    sessionId: string,
    input: { channel: ChatChannel; body: string; recipientUserId?: string },
  ): Promise<ChatMessageRecord> {
    return request<ChatMessageRecord>(`/sessions/${sessionId}/chat-messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  toggleChatReaction(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ sessionId: string; messageId: string; reactions: ChatReactionRecord[] }> {
    return request(`/sessions/${sessionId}/chat-messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  },

  listPolls(sessionId: string): Promise<PollRecord[]> {
    return request<PollRecord[]>(`/sessions/${sessionId}/polls`);
  },

  createPoll(sessionId: string, input: CreatePollInput): Promise<PollRecord> {
    return request<PollRecord>(`/sessions/${sessionId}/polls`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  launchPoll(sessionId: string, pollId: string): Promise<PollRecord> {
    return request<PollRecord>(
      `/sessions/${sessionId}/polls/${pollId}/launch`,
      {
        method: "POST",
      },
    );
  },

  closePoll(sessionId: string, pollId: string): Promise<PollRecord> {
    return request<PollRecord>(`/sessions/${sessionId}/polls/${pollId}/close`, {
      method: "POST",
    });
  },

  answerPoll(
    sessionId: string,
    pollId: string,
    input: SubmitPollAnswerInput,
  ): Promise<unknown> {
    return request(`/sessions/${sessionId}/polls/${pollId}/answers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  pollResults(sessionId: string, pollId: string): Promise<PollResults> {
    return request<PollResults>(
      `/sessions/${sessionId}/polls/${pollId}/results`,
    );
  },

  listQuestions(sessionId: string): Promise<QuestionRecord[]> {
    return request<QuestionRecord[]>(`/sessions/${sessionId}/questions`);
  },

  createQuestion(
    sessionId: string,
    input: CreateQuestionInput,
  ): Promise<QuestionRecord> {
    return request<QuestionRecord>(`/sessions/${sessionId}/questions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  voteQuestion(
    sessionId: string,
    questionId: string,
  ): Promise<{ questionId: string; voted: boolean; voteCount: number }> {
    return request(`/sessions/${sessionId}/questions/${questionId}/vote`, {
      method: "POST",
    });
  },

  moderateQuestion(
    sessionId: string,
    questionId: string,
    input: { status: QuestionStatus; answerText?: string },
  ): Promise<QuestionRecord> {
    return request<QuestionRecord>(
      `/sessions/${sessionId}/questions/${questionId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },
};
