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


export interface ApiKeyRecord {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: Array<'read' | 'write'>;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedApiKey extends ApiKeyRecord {
  token: string;
}

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

export interface CalendarConnectionRecord {
  id: string;
  userId: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  status: 'ACTIVE' | 'REAUTH_REQUIRED' | 'ERROR' | 'REVOKED';
  accountEmail: string | null;
  scopes: string[];
  calendarIds: string[];
  lastSyncedAt: string | null;
  lastError: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  busyBlockCount: number;
  user: { id: string; displayName: string; email: string };
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

export interface AgendaTemplateItem {
  id: string;
  position: number;
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  content: Record<string, unknown>;
}

export interface FileAssetRecord {
  id: string;
  sessionId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  status:
    | 'PENDING_UPLOAD'
    | 'QUARANTINED'
    | 'SCANNING'
    | 'READY'
    | 'REJECTED'
    | 'FAILED'
    | 'DELETED';
  scanProvider: string | null;
  scanResult: string | null;
  scanAttempts: number;
  lastScanError: string | null;
  uploadedAt: string | null;
  scannedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileUploadGrant {
  file: FileAssetRecord;
  upload: {
    method: 'PUT';
    url: string;
    expiresAt: string;
    contentType: string;
  };
}

export interface FileDownloadGrant {
  fileId: string;
  filename: string;
  mimeType: string;
  expiresAt: string;
  url: string;
}

export interface AgendaTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; displayName: string };
  items: AgendaTemplateItem[];
}

export interface SessionDetail extends Session {
  livekitRoomName: string;
  agendaItems: AgendaItem[];
}

export interface AgendaTimerState {
  sessionId: string;
  agendaItemId: string | null;
  durationSeconds: number;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'EXPIRED';
  remainingSeconds: number;
  endsAt: string | null;
  startedAt: string | null;
  serverTime: string;
}

export interface MediaParticipantTrack {
  sid: string;
  name: string;
  muted: boolean;
  type: number;
  source: number;
  kind: 'audio' | 'video';
}

export interface MediaParticipant {
  identity: string;
  name: string;
  permission: {
    canPublish: boolean;
    canSubscribe: boolean;
    canPublishData: boolean;
  };
  tracks: MediaParticipantTrack[];
}

export interface BreakoutAssignmentRecord {
  id: string;
  sessionId: string;
  breakoutRoomId: string;
  userId: string;
  assignedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
  user?: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
  breakoutRoom?: BreakoutRoomRecord;
}

export interface BreakoutRoomRecord {
  id: string;
  sessionId: string;
  name: string;
  position: number;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  openedAt: string | null;
  closedAt: string | null;
  assignments?: BreakoutAssignmentRecord[];
}

export interface BreakoutState {
  sessionId: string;
  canManage: boolean;
  rooms: BreakoutRoomRecord[];
  ownAssignment: (BreakoutAssignmentRecord & {
    breakoutRoom: BreakoutRoomRecord;
  }) | null;
}

export interface WhiteboardElementRecord {
  id: string;
  type: 'PEN' | 'RECT' | 'TEXT' | 'STICKY';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  points?: Array<{ x: number; y: number }>;
}

export interface WhiteboardState {
  sessionId: string;
  whiteboardId: string;
  snapshotVersion: number;
  compactedThrough: number;
  latestSequence: number;
  snapshot: {
    elements: WhiteboardElementRecord[];
  };
}

export interface MediaToken {
  url: string;
  token: string;
  expiresIn: number;
  expiresAt: string;
}

export interface AgendaSuggestion {
  title: string;
  durationSeconds: number;
  type: AgendaItemType;
  notes: string;
}

export interface GeneratedAgenda {
  sessionId: string;
  provider: string;
  model: string;
  items: AgendaSuggestion[];
}

export interface AnalyticsDailyPoint {
  date: string;
  sessions: number;
  registrations: number;
  bookings: number;
}

export interface WorkspaceAnalyticsOverview {
  range: { days: number; since: string; until: string };
  sessions: {
    total: number;
    completed: number;
    webinars: number;
    scheduledMinutes: number;
  };
  events: {
    registrations: number;
    attended: number;
    noShows: number;
    waitlisted: number;
  };
  bookings: {
    total: number;
    confirmed: number;
    cancelled: number;
    completed: number;
  };
  attendance: {
    participantSessions: number;
    intervalCount: number;
    totalSeconds: number;
  };
  engagement: {
    chatMessages: number;
    pollAnswers: number;
    questions: number;
    totalActions: number;
  };
  memory: {
    readyRecordings: number;
    readySummaries: number;
  };
  daily: AnalyticsDailyPoint[];
}

export interface AnalyticsCsvExport {
  filename: string;
  contentType: string;
  content: string;
}

export type EventStageRole = 'ORGANIZER' | 'HOST' | 'COHOST' | 'SPEAKER';

export interface EventSpeakerRecord {
  id: string;
  eventId: string;
  userId: string | null;
  role: EventStageRole;
  position: number;
  displayName: string;
  email: string | null;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord extends PlatformEvent {
  speakers?: EventSpeakerRecord[];
  _count?: { registrations: number; speakers?: number };
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
  version: number;
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

export interface TranscriptRevisionRecord {
  id: string;
  transcriptVersion: number;
  editedByUserId: string;
  reason: string | null;
  createdAt: string;
}

export interface MemoryActionItemRecord {
  title: string;
  owner: string | null;
  dueDate: string | null;
}

export interface MemorySummaryRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  provider: string | null;
  model: string | null;
  summaryText: string | null;
  decisions: string[];
  actionItems: MemoryActionItemRecord[];
  citations: unknown[];
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  version: number;
  failureCode: string | null;
}

export interface MemorySummaryRevisionRecord {
  id: string;
  summaryVersion: number;
  editedByUserId: string;
  reviewNote: string | null;
  createdAt: string;
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

export interface SessionPresenceParticipant {
  userId: string;
  displayName: string;
  roles: string[];
  joinedAt: string;
  lastSeenAt: string;
  isSelf: boolean;
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
  recipient: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
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
  listApiKeys(): Promise<ApiKeyRecord[]> {
    return request<ApiKeyRecord[]>('/api-keys');
  },

  createApiKey(input: {
    name: string;
    scopes: Array<'read' | 'write'>;
    expiresInDays?: number;
  }): Promise<CreatedApiKey> {
    return request<CreatedApiKey>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  revokeApiKey(id: string): Promise<{ id: string; revoked: true }> {
    return request<{ id: string; revoked: true }>(`/api-keys/${id}`, {
      method: 'DELETE',
    });
  },

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

  listCalendarConnections(): Promise<CalendarConnectionRecord[]> {
    return request<CalendarConnectionRecord[]>('/integrations/calendars');
  },

  startCalendarOauth(
    provider: 'google' | 'microsoft',
  ): Promise<{
    provider: 'GOOGLE' | 'MICROSOFT';
    authorizationUrl: string;
    expiresIn: number;
  }> {
    return request(`/integrations/calendars/${provider}/oauth/start`, {
      method: 'POST',
    });
  },

  syncCalendarConnection(
    id: string,
  ): Promise<{
    id: string;
    provider: 'GOOGLE' | 'MICROSOFT';
    status: 'ACTIVE';
    busyBlockCount: number;
    lastSyncedAt: string;
  }> {
    return request(`/integrations/calendars/${id}/sync`, {
      method: 'POST',
    });
  },

  disconnectCalendarConnection(
    id: string,
  ): Promise<{
    id: string;
    provider: 'GOOGLE' | 'MICROSOFT';
    status: 'REVOKED';
  }> {
    return request(`/integrations/calendars/${id}`, {
      method: 'DELETE',
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

  generateAgenda(
    sessionId: string,
    input: { objective: string; desiredItems: number },
  ): Promise<GeneratedAgenda> {
    return request<GeneratedAgenda>(`/sessions/${sessionId}/agenda-items/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async uploadSessionFile(
    sessionId: string,
    file: File,
  ): Promise<FileAssetRecord> {
    const grant = await request<FileUploadGrant>(
      `/sessions/${sessionId}/files/uploads`,
      {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      },
    );

    const uploadResponse = await fetch(grant.upload.url, {
      method: grant.upload.method,
      headers: { 'content-type': grant.upload.contentType },
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `File upload failed with status ${uploadResponse.status}`,
      );
    }

    return request<FileAssetRecord>(`/files/${grant.file.id}/complete`, {
      method: 'POST',
    });
  },

  listSessionFiles(sessionId: string): Promise<FileAssetRecord[]> {
    return request<FileAssetRecord[]>(`/sessions/${sessionId}/files`);
  },

  createFileDownloadGrant(fileId: string): Promise<FileDownloadGrant> {
    return request<FileDownloadGrant>(`/files/${fileId}/download`);
  },

  deleteFileAsset(fileId: string): Promise<{ id: string; deleted: true }> {
    return request<{ id: string; deleted: true }>(`/files/${fileId}`, {
      method: 'DELETE',
    });
  },

  listAgendaTemplates(): Promise<AgendaTemplateRecord[]> {
    return request<AgendaTemplateRecord[]>('/agenda-templates');
  },

  saveAgendaTemplate(
    sessionId: string,
    input: { name: string; description?: string },
  ): Promise<AgendaTemplateRecord> {
    return request<AgendaTemplateRecord>(`/sessions/${sessionId}/agenda-templates`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateAgendaTemplate(
    templateId: string,
    version: number,
    input: { name?: string; description?: string },
  ): Promise<AgendaTemplateRecord> {
    return request<AgendaTemplateRecord>(`/agenda-templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
      body: JSON.stringify(input),
    });
  },

  deleteAgendaTemplate(
    templateId: string,
    version: number,
  ): Promise<{ id: string }> {
    return request<{ id: string }>(`/agenda-templates/${templateId}`, {
      method: 'DELETE',
      headers: { 'if-match': String(version) },
    });
  },

  applyAgendaTemplate(
    sessionId: string,
    templateId: string,
  ): Promise<{
    sessionId: string;
    agendaTemplateId: string;
    appendedItemCount: number;
    agendaItems: AgendaItem[];
  }> {
    return request(`/sessions/${sessionId}/agenda-templates/${templateId}/apply`, {
      method: 'POST',
    });
  },

  getAgendaTimer(sessionId: string): Promise<AgendaTimerState> {
    return request<AgendaTimerState>(`/sessions/${sessionId}/agenda-items/timer`);
  },

  controlAgendaTimer(
    sessionId: string,
    action: 'START' | 'PAUSE' | 'RESET',
  ): Promise<AgendaTimerState> {
    return request<AgendaTimerState>(`/sessions/${sessionId}/agenda-items/timer`, {
      method: 'POST',
      body: JSON.stringify({ action }),
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

  getWhiteboardState(sessionId: string): Promise<WhiteboardState> {
    return request<WhiteboardState>(`/sessions/${sessionId}/whiteboard`);
  },

  applyWhiteboardOperation(
    sessionId: string,
    input: {
      operationId: string;
      type: 'UPSERT_ELEMENT' | 'DELETE_ELEMENT' | 'CLEAR';
      payload: Record<string, unknown>;
    },
  ): Promise<{
    sessionId: string;
    whiteboardId: string;
    operationId: string;
    sequence: number;
    compacted: boolean;
    duplicate: boolean;
  }> {
    return request(`/sessions/${sessionId}/whiteboard/operations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getBreakoutState(sessionId: string): Promise<BreakoutState> {
    return request<BreakoutState>(`/sessions/${sessionId}/breakouts`);
  },

  createBreakoutRooms(
    sessionId: string,
    names: string[],
  ): Promise<BreakoutRoomRecord[]> {
    return request<BreakoutRoomRecord[]>(`/sessions/${sessionId}/breakouts`, {
      method: 'POST',
      body: JSON.stringify({ rooms: names.map((name) => ({ name })) }),
    });
  },

  randomizeBreakoutAssignments(
    sessionId: string,
    includeHosts = false,
  ): Promise<BreakoutAssignmentRecord[]> {
    return request<BreakoutAssignmentRecord[]>(
      `/sessions/${sessionId}/breakouts/assignments/randomize`,
      {
        method: 'POST',
        body: JSON.stringify({ includeHosts }),
      },
    );
  },

  assignBreakoutParticipant(
    sessionId: string,
    userId: string,
    breakoutRoomId: string,
  ): Promise<BreakoutAssignmentRecord> {
    return request<BreakoutAssignmentRecord>(
      `/sessions/${sessionId}/breakouts/assignments`,
      {
        method: 'PATCH',
        body: JSON.stringify({ userId, breakoutRoomId }),
      },
    );
  },

  openBreakouts(sessionId: string): Promise<BreakoutState> {
    return request<BreakoutState>(`/sessions/${sessionId}/breakouts/open`, {
      method: 'POST',
    });
  },

  closeBreakouts(
    sessionId: string,
  ): Promise<{ sessionId: string; closedAt: string; roomCount: number }> {
    return request(`/sessions/${sessionId}/breakouts/close`, {
      method: 'POST',
    });
  },

  broadcastBreakoutMessage(
    sessionId: string,
    message: string,
  ): Promise<{
    sessionId: string;
    message: string;
    sentByUserId: string;
    sentByDisplayName: string;
    sentAt: string;
  }> {
    return request(`/sessions/${sessionId}/breakouts/broadcast`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  createBreakoutMediaToken(
    sessionId: string,
    breakoutRoomId: string,
  ): Promise<MediaToken> {
    return request<MediaToken>(
      `/sessions/${sessionId}/breakouts/${breakoutRoomId}/media-token`,
      { method: 'POST' },
    );
  },

  listMediaParticipants(sessionId: string): Promise<MediaParticipant[]> {
    return request<MediaParticipant[]>(`/sessions/${sessionId}/media/participants`);
  },

  muteMediaTrack(
    sessionId: string,
    participantId: string,
    trackSid: string,
    muted: boolean,
  ) {
    return request(
      `/sessions/${sessionId}/media/participants/${participantId}/tracks/${trackSid}/mute`,
      {
        method: 'POST',
        body: JSON.stringify({ muted }),
      },
    );
  },

  setMediaPublishPermission(
    sessionId: string,
    participantId: string,
    canPublish: boolean,
  ): Promise<MediaParticipant> {
    return request<MediaParticipant>(
      `/sessions/${sessionId}/media/participants/${participantId}/permissions`,
      {
        method: 'PATCH',
        body: JSON.stringify({ canPublish }),
      },
    );
  },

  removeMediaParticipant(
    sessionId: string,
    participantId: string,
  ): Promise<{
    sessionId: string;
    participantId: string;
    rejoinBlockedUntil: string;
  }> {
    return request(`/sessions/${sessionId}/media/participants/${participantId}`, {
      method: 'DELETE',
    });
  },

  allowMediaRejoin(
    sessionId: string,
    participantId: string,
  ): Promise<{ sessionId: string; participantId: string; rejoinAllowed: true }> {
    return request(
      `/sessions/${sessionId}/media/participants/${participantId}/allow-rejoin`,
      { method: 'POST' },
    );
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

  getAnalyticsOverview(days = 30): Promise<WorkspaceAnalyticsOverview> {
    return request<WorkspaceAnalyticsOverview>(
      `/analytics/overview?days=${encodeURIComponent(String(days))}`,
    );
  },

  exportAnalytics(days = 30): Promise<AnalyticsCsvExport> {
    return request<AnalyticsCsvExport>(
      `/analytics/export?days=${encodeURIComponent(String(days))}`,
    );
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

  listEventSpeakers(eventId: string): Promise<EventSpeakerRecord[]> {
    return request<EventSpeakerRecord[]>(`/events/${eventId}/speakers`);
  },

  createEventSpeaker(
    eventId: string,
    input: {
      userId?: string;
      role: EventStageRole;
      displayName: string;
      email?: string;
      title?: string;
      bio?: string;
      avatarUrl?: string;
    },
  ): Promise<EventSpeakerRecord> {
    return request<EventSpeakerRecord>(`/events/${eventId}/speakers`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateEventSpeaker(
    eventId: string,
    speakerId: string,
    input: Partial<{
      userId: string | null;
      role: EventStageRole;
      displayName: string;
      email: string | null;
      title: string | null;
      bio: string | null;
      avatarUrl: string | null;
    }>,
  ): Promise<EventSpeakerRecord> {
    return request<EventSpeakerRecord>(
      `/events/${eventId}/speakers/${speakerId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
  },

  deleteEventSpeaker(
    eventId: string,
    speakerId: string,
  ): Promise<{ id: string; deleted: true }> {
    return request(`/events/${eventId}/speakers/${speakerId}`, {
      method: 'DELETE',
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

  listMemorySummaryRevisions(
    sessionId: string,
  ): Promise<MemorySummaryRevisionRecord[]> {
    return request<MemorySummaryRevisionRecord[]>(
      `/memory/${sessionId}/summary/revisions`,
    );
  },

  updateMemorySummary(
    sessionId: string,
    input: {
      summaryText: string;
      decisions: string[];
      actionItems: MemoryActionItemRecord[];
      reviewNote?: string;
    },
  ): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(`/memory/${sessionId}/summary`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  listTranscriptRevisions(sessionId: string): Promise<TranscriptRevisionRecord[]> {
    return request<TranscriptRevisionRecord[]>(
      `/transcripts/${sessionId}/revisions`,
    );
  },

  updateTranscript(
    sessionId: string,
    input: {
      reason?: string;
      segments: Array<{
        position: number;
        startMs: number;
        endMs: number;
        speakerLabel?: string | null;
        text: string;
      }>;
    },
  ): Promise<TranscriptRecord> {
    return request<TranscriptRecord>(`/transcripts/${sessionId}`, {
      method: "PATCH",
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

  listSessionPresence(sessionId: string): Promise<SessionPresenceParticipant[]> {
    return request<SessionPresenceParticipant[]>(`/sessions/${sessionId}/presence`);
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
