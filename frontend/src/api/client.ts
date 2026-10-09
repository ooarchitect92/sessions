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

export interface WorkspaceDomainRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  hostname: string;
  status: 'PENDING' | 'VERIFIED';
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export type CalendarProvider = 'GOOGLE' | 'MICROSOFT';

export interface CalendarConnectionRecord {
  id: string;
  provider: CalendarProvider;
  status: 'ACTIVE' | 'ERROR' | 'REVOKED';
  externalAccountEmail: string | null;
  calendarId: string;
  scopes: string[];
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
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
  roomName: string;
  breakoutRoomId: string | null;
}

export type BreakoutStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export interface BreakoutAssignmentRecord {
  id: string;
  userId: string;
  assignedAt: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface BreakoutRoomRecord {
  id: string;
  name: string;
  position: number;
  status: BreakoutStatus;
  participantCount: number;
  assignments: BreakoutAssignmentRecord[];
}

export interface BreakoutState {
  sessionId: string;
  rooms: BreakoutRoomRecord[];
  currentAssignment: {
    id: string;
    userId: string;
    breakoutRoomId: string;
    room: {
      id: string;
      name: string;
      status: BreakoutStatus;
    };
  } | null;
  announcements: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { displayName: string };
  }>;
}

export type UploadStatus =
  | 'AWAITING_UPLOAD'
  | 'PENDING_SCAN'
  | 'SCANNING'
  | 'READY'
  | 'REJECTED'
  | 'FAILED'
  | 'DELETED';

export type UploadPurpose =
  | 'SESSION_RESOURCE'
  | 'AGENDA_RESOURCE'
  | 'EVENT_RESOURCE';

export interface UploadAssetRecord {
  id: string;
  sessionId: string | null;
  purpose: UploadPurpose;
  status: UploadStatus;
  filename: string;
  mimeType: string;
  expectedSizeBytes: number;
  actualSizeBytes: number | null;
  checksumSha256: string | null;
  scanProvider: string | null;
  scanResult: string | null;
  scannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUploadResponse {
  asset: UploadAssetRecord;
  upload: {
    method: 'PUT';
    url: string;
    expiresAt: string;
    maxBytes: number;
  };
}

export type EventPresenterRole = 'ORGANIZER' | 'HOST' | 'CO_HOST' | 'SPEAKER';

export interface EventPresenterRecord {
  id: string;
  eventId: string;
  userId: string | null;
  role: EventPresenterRole;
  name: string;
  email: string;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  position: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord extends PlatformEvent {
  presenters?: EventPresenterRecord[];
  _count?: { registrations: number };
}

export type EventReminderKind =
  | 'EVENT_REMINDER_24H'
  | 'EVENT_REMINDER_1H';

export interface EventNotificationTemplateRecord {
  id: string;
  eventId: string;
  kind: EventReminderKind;
  enabled: boolean;
  subject: string;
  bodyText: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventNotificationDeliveryRecord {
  id: string;
  eventRegistrationId: string;
  kind: EventReminderKind;
  status:
    | 'PENDING'
    | 'SENDING'
    | 'DELIVERED'
    | 'FAILED'
    | 'DEAD_LETTER'
    | 'CANCELLED';
  recipientEmail: string;
  scheduledFor: string;
  attempts: number;
  provider: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  eventRegistration: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
}

export interface AttendanceParticipantRecord {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  eventRegistrationId: string | null;
  firstJoinedAt: string;
  lastLeftAt: string | null;
  active: boolean;
  connectionCount: number;
  attendanceSeconds: number;
}

export interface AttendanceAnalytics {
  uniqueAttendees: number;
  activeAttendees: number;
  totalAttendanceSeconds: number;
  averageAttendanceSeconds: number;
  participants: AttendanceParticipantRecord[];
}

export interface EventAnalyticsRecord {
  event: {
    id: string;
    title: string;
    startsAt: string;
    sessionId: string | null;
  };
  registrations: {
    total: number;
    byStatus: Record<string, number>;
  };
  attendance: AttendanceAnalytics;
  engagement: Record<string, number>;
}

export interface SessionAnalyticsRecord {
  session: {
    id: string;
    title: string;
    startsAt: string;
    durationMinutes: number;
    status: string;
  };
  attendance: AttendanceAnalytics;
  engagement: Record<string, number>;
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
  provider?: string | null;
  fullText?: string | null;
  version: number;
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
  transcriptId: string;
  revisionNumber: number;
  language: string | null;
  fullText: string | null;
  segments: Array<{
    startMs: number;
    endMs: number;
    speakerLabel: string | null;
    text: string;
  }>;
  reason: string | null;
  createdAt: string;
  editor: {
    id: string;
    displayName: string;
    email: string;
  };
}

export interface TranscriptCorrectionInput {
  language?: string;
  reason?: string;
  segments?: Array<{
    startMs: number;
    endMs: number;
    speakerLabel?: string | null;
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

export type AiExternalActionKind = 'EMAIL_FOLLOW_UP' | 'CRM_NOTE';
export type AiExternalActionStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface AiExternalActionRecord {
  id: string;
  sessionId: string;
  kind: AiExternalActionKind;
  status: AiExternalActionStatus;
  sourceSummaryVersion: number;
  draftProvider: string | null;
  draftModel: string | null;
  recipientEmail: string | null;
  subject: string | null;
  bodyText: string;
  targetProvider: string | null;
  targetRecordId: string | null;
  approvedAt: string | null;
  executionProvider: string | null;
  providerReferenceId: string | null;
  failureCode: string | null;
  executedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedBy?: {
    id: string;
    displayName: string;
    email: string;
  } | null;
}

export interface MemoryListItem extends Session {
  recording: RecordingRecord | null;
  transcript: TranscriptRecord | null;
  memorySummary: MemorySummaryRecord | null;
  search?: {
    rank: number;
    excerpt: string | null;
    mode: 'lexical' | 'semantic';
  };
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

export type WhiteboardOperationKind =
  | 'STROKE_ADD'
  | 'SHAPE_ADD'
  | 'NOTE_ADD'
  | 'TEXT_ADD'
  | 'OBJECT_REMOVE'
  | 'CLEAR';

export interface WhiteboardObjectRecord {
  id: string;
  type: 'stroke' | 'shape' | 'note' | 'text';
  [key: string]: unknown;
}

export interface WhiteboardOperationRecord {
  id: string;
  sessionId: string;
  whiteboardId: string;
  actorUserId: string;
  clientOperationId: string;
  sequence: number;
  kind: WhiteboardOperationKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WhiteboardState {
  sessionId: string;
  boardId: string | null;
  version: number;
  snapshotSequence: number;
  snapshot: {
    objects: Record<string, WhiteboardObjectRecord>;
    recentOperationIds: string[];
  };
  operations: WhiteboardOperationRecord[];
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

  listWorkspaceDomains(): Promise<WorkspaceDomainRecord[]> {
    return request('/workspaces/current/domains');
  },

  createWorkspaceDomain(hostname: string): Promise<WorkspaceDomainRecord> {
    return request('/workspaces/current/domains', {
      method: 'POST',
      body: JSON.stringify({ hostname }),
    });
  },

  verifyWorkspaceDomain(domainId: string): Promise<WorkspaceDomainRecord> {
    return request(`/workspaces/current/domains/${domainId}/verify`, {
      method: 'POST',
    });
  },

  removeWorkspaceDomain(domainId: string): Promise<{ id: string; removed: true }> {
    return request(`/workspaces/current/domains/${domainId}`, {
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

  createUpload(input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    purpose: UploadPurpose;
    sessionId?: string;
  }): Promise<CreateUploadResponse> {
    return request<CreateUploadResponse>('/uploads', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  completeUpload(
    uploadId: string,
    checksumSha256?: string,
  ): Promise<UploadAssetRecord> {
    return request<UploadAssetRecord>(`/uploads/${uploadId}/complete`, {
      method: 'POST',
      body: JSON.stringify(
        checksumSha256 ? { checksumSha256 } : {},
      ),
    });
  },

  getUpload(uploadId: string): Promise<UploadAssetRecord> {
    return request<UploadAssetRecord>(`/uploads/${uploadId}`);
  },

  createUploadDownloadGrant(uploadId: string): Promise<{
    asset: UploadAssetRecord;
    url: string;
    expiresIn: number;
  }> {
    return request(`/uploads/${uploadId}/download`);
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

  createMediaToken(
    sessionId: string,
    breakoutRoomId?: string,
  ): Promise<MediaToken> {
    return request<MediaToken>(`/sessions/${sessionId}/media-token`, {
      method: "POST",
      body: JSON.stringify(
        breakoutRoomId ? { breakoutRoomId } : {},
      ),
    });
  },

  getBreakouts(sessionId: string): Promise<BreakoutState> {
    return request<BreakoutState>(`/sessions/${sessionId}/breakouts`);
  },

  createBreakoutRoom(
    sessionId: string,
    name: string,
  ): Promise<{ id: string; name: string; status: BreakoutStatus }> {
    return request(`/sessions/${sessionId}/breakouts/rooms`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  assignBreakout(
    sessionId: string,
    userId: string,
    breakoutRoomId: string,
  ) {
    return request(`/sessions/${sessionId}/breakouts/assign`, {
      method: 'POST',
      body: JSON.stringify({ userId, breakoutRoomId }),
    });
  },

  randomizeBreakouts(sessionId: string, userIds: string[]) {
    return request(`/sessions/${sessionId}/breakouts/randomize`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  },

  openBreakouts(sessionId: string) {
    return request(`/sessions/${sessionId}/breakouts/open`, {
      method: 'POST',
    });
  },

  closeBreakouts(sessionId: string) {
    return request(`/sessions/${sessionId}/breakouts/close`, {
      method: 'POST',
    });
  },

  broadcastBreakout(sessionId: string, body: string) {
    return request(`/sessions/${sessionId}/breakouts/broadcast`, {
      method: 'POST',
      body: JSON.stringify({ body }),
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

  listEventPresenters(eventId: string): Promise<EventPresenterRecord[]> {
    return request<EventPresenterRecord[]>(`/events/${eventId}/presenters`);
  },

  createEventPresenter(
    eventId: string,
    input: {
      role: Exclude<EventPresenterRole, 'ORGANIZER'>;
      name: string;
      email: string;
      title?: string;
      bio?: string;
      avatarUrl?: string;
      isPublic?: boolean;
    },
  ): Promise<EventPresenterRecord> {
    return request<EventPresenterRecord>(`/events/${eventId}/presenters`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateEventPresenter(
    eventId: string,
    presenterId: string,
    input: Partial<{
      role: EventPresenterRole;
      name: string;
      title: string | null;
      bio: string | null;
      avatarUrl: string | null;
      isPublic: boolean;
    }>,
  ): Promise<EventPresenterRecord> {
    return request<EventPresenterRecord>(
      `/events/${eventId}/presenters/${presenterId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
  },

  removeEventPresenter(
    eventId: string,
    presenterId: string,
  ): Promise<{ id: string; deleted: true }> {
    return request(
      `/events/${eventId}/presenters/${presenterId}/remove`,
      { method: 'POST' },
    );
  },

  listEventNotificationTemplates(
    eventId: string,
  ): Promise<EventNotificationTemplateRecord[]> {
    return request<EventNotificationTemplateRecord[]>(
      `/notifications/events/${eventId}/templates`,
    );
  },

  updateEventNotificationTemplate(
    eventId: string,
    kind: EventReminderKind,
    version: number,
    input: Partial<{
      enabled: boolean;
      subject: string;
      bodyText: string;
    }>,
  ): Promise<EventNotificationTemplateRecord> {
    return request<EventNotificationTemplateRecord>(
      `/notifications/events/${eventId}/templates/${kind}`,
      {
        method: 'PATCH',
        headers: { 'if-match': String(version) },
        body: JSON.stringify(input),
      },
    );
  },

  listEventNotificationDeliveries(
    eventId: string,
  ): Promise<EventNotificationDeliveryRecord[]> {
    return request<EventNotificationDeliveryRecord[]>(
      `/notifications/events/${eventId}/deliveries`,
    );
  },

  retryEventNotificationDelivery(
    deliveryId: string,
  ): Promise<EventNotificationDeliveryRecord> {
    return request<EventNotificationDeliveryRecord>(
      `/notifications/events/deliveries/${deliveryId}/retry`,
      { method: 'POST' },
    );
  },

  getEventAnalytics(eventId: string): Promise<EventAnalyticsRecord> {
    return request<EventAnalyticsRecord>(`/analytics/events/${eventId}`);
  },

  getSessionAnalytics(sessionId: string): Promise<SessionAnalyticsRecord> {
    return request<SessionAnalyticsRecord>(`/analytics/sessions/${sessionId}`);
  },

  updateEvent(
    eventId: string,
    version: number,
    input: Partial<CreateEventInput>,
  ): Promise<EventRecord> {
    return request<EventRecord>(`/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
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

  listCalendarConnections(): Promise<CalendarConnectionRecord[]> {
    return request<CalendarConnectionRecord[]>('/calendar/connections');
  },

  startCalendarOAuth(provider: CalendarProvider): Promise<{
    provider: CalendarProvider;
    authorizationUrl: string;
    expiresAt: string;
  }> {
    return request(`/calendar/oauth/${provider.toLowerCase()}/start`, {
      method: 'POST',
    });
  },

  updateCalendarConnection(
    connectionId: string,
    input: { syncEnabled?: boolean; calendarId?: string },
  ): Promise<CalendarConnectionRecord> {
    return request(`/calendar/connections/${connectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  disconnectCalendar(
    connectionId: string,
  ): Promise<CalendarConnectionRecord> {
    return request(`/calendar/connections/${connectionId}/disconnect`, {
      method: 'POST',
    });
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

  listMemory(
    query?: string,
    searchMode: 'lexical' | 'semantic' = 'lexical',
  ): Promise<Paginated<MemoryListItem>> {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    params.set('searchMode', searchMode);
    const search = params.size ? `?${params.toString()}` : '';
    return request<Paginated<MemoryListItem>>(`/memory${search}`);
  },

  getMemory(sessionId: string): Promise<MemoryDetail> {
    return request<MemoryDetail>(`/memory/${sessionId}`);
  },

  listAiExternalActions(sessionId: string): Promise<AiExternalActionRecord[]> {
    return request<AiExternalActionRecord[]>(`/memory/${sessionId}/follow-ups`);
  },

  createFollowUpEmailDraft(
    sessionId: string,
    input: { recipientEmail: string; guidance?: string },
  ): Promise<AiExternalActionRecord> {
    return request<AiExternalActionRecord>(
      `/memory/${sessionId}/follow-ups/email/draft`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },

  createCrmNoteDraft(
    sessionId: string,
    input: {
      targetProvider: string;
      targetRecordId: string;
      guidance?: string;
    },
  ): Promise<AiExternalActionRecord> {
    return request<AiExternalActionRecord>(
      `/memory/${sessionId}/follow-ups/crm-note/draft`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },

  updateAiExternalAction(
    sessionId: string,
    actionId: string,
    version: number,
    input: Partial<{
      recipientEmail: string;
      subject: string;
      bodyText: string;
      targetProvider: string;
      targetRecordId: string;
    }>,
  ): Promise<AiExternalActionRecord> {
    return request<AiExternalActionRecord>(
      `/memory/${sessionId}/follow-ups/${actionId}`,
      {
        method: 'PATCH',
        headers: { 'if-match': String(version) },
        body: JSON.stringify(input),
      },
    );
  },

  approveAiExternalAction(
    sessionId: string,
    actionId: string,
    version: number,
  ): Promise<AiExternalActionRecord> {
    return request<AiExternalActionRecord>(
      `/memory/${sessionId}/follow-ups/${actionId}/approve`,
      {
        method: 'POST',
        headers: { 'if-match': String(version) },
      },
    );
  },

  retryAiExternalAction(
    sessionId: string,
    actionId: string,
  ): Promise<AiExternalActionRecord> {
    return request<AiExternalActionRecord>(
      `/memory/${sessionId}/follow-ups/${actionId}/retry`,
      { method: 'POST' },
    );
  },

  cancelAiExternalAction(
    sessionId: string,
    actionId: string,
  ): Promise<AiExternalActionRecord> {
    return request<AiExternalActionRecord>(
      `/memory/${sessionId}/follow-ups/${actionId}/cancel`,
      { method: 'POST' },
    );
  },

  listTranscriptRevisions(sessionId: string): Promise<TranscriptRevisionRecord[]> {
    return request<TranscriptRevisionRecord[]>(
      `/memory/${sessionId}/transcript/revisions`,
    );
  },

  updateTranscript(
    sessionId: string,
    version: number,
    input: TranscriptCorrectionInput,
  ): Promise<TranscriptRecord> {
    return request<TranscriptRecord>(`/memory/${sessionId}/transcript`, {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
      body: JSON.stringify(input),
    });
  },

  restoreTranscriptRevision(
    sessionId: string,
    revisionId: string,
    version: number,
  ): Promise<TranscriptRecord> {
    return request<TranscriptRecord>(
      `/memory/${sessionId}/transcript/revisions/${revisionId}/restore`,
      {
        method: 'POST',
        headers: { 'if-match': String(version) },
      },
    );
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

  getWhiteboard(sessionId: string): Promise<WhiteboardState> {
    return request<WhiteboardState>(`/sessions/${sessionId}/whiteboard`);
  },

  appendWhiteboardOperation(
    sessionId: string,
    input: {
      clientOperationId: string;
      kind: WhiteboardOperationKind;
      payload: Record<string, unknown>;
    },
  ): Promise<{
    operation: WhiteboardOperationRecord | null;
    boardVersion: number;
    compacted: boolean;
    deduplicated: boolean;
  }> {
    return request(`/sessions/${sessionId}/whiteboard/operations`, {
      method: 'POST',
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
