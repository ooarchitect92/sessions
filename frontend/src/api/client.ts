import type {
  AgendaItemType,
  ApiEnvelope,
  ArtifactStatus,
  BookingPage,
  ChatChannel,
  CreateBookingPageInput,
  CreateEventInput,
  CreateEventPresenterInput,
  CreatePollInput,
  CreateQuestionInput,
  CreateRoomInput,
  CreateSessionInput,
  Event as PlatformEvent,
  EventPresenter,
  EventPresenterRole,
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

export interface ApiKeyRecord {
  id: string;
  name: string;
  tokenPrefix: string;
  role: WorkspaceRole;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyCreateResult extends ApiKeyRecord {
  token: string;
  tokenWarning: string;
}

export interface WorkspaceAnalytics {
  range: { from: string; to: string };
  metrics: {
    sessions: number;
    completedSessions: number;
    meetingMinutes: number;
    meetingHours: number;
    eventRegistrations: number;
    attendedRegistrations: number;
    registrationNoShowRate: number;
    bookingReservations: number;
    confirmedBookings: number;
    bookingNoShowRate: number;
    chatMessages: number;
    polls: number;
    pollAnswers: number;
    questions: number;
    questionVotes: number;
    engagementActions: number;
    readyRecordings: number;
    recordingMinutes: number;
    readyTranscripts: number;
    readySummaries: number;
    reviewedSummaries: number;
  };
  trend: Array<{
    date: string;
    sessions: number;
    registrations: number;
    bookings: number;
    engagement: number;
  }>;
  recentSessions: Array<{
    id: string;
    title: string;
    startsAt: string;
    durationMinutes: number;
    kind: "MEETING" | "WEBINAR";
    status: SessionStatus;
  }>;
}

export interface SessionAnalytics {
  session: {
    id: string;
    title: string;
    kind: "MEETING" | "WEBINAR";
    status: SessionStatus;
    startsAt: string;
    durationMinutes: number;
  };
  attendance: {
    registrations: number;
    attended: number;
    noShows: number;
  };
  engagement: {
    chatMessages: number;
    polls: number;
    pollAnswers: number;
    questions: number;
    questionVotes: number;
    total: number;
  };
  artifacts: {
    recording: {
      status: ArtifactStatus;
      durationSeconds: number | null;
      completedAt: string | null;
    } | null;
    transcript: {
      status: ArtifactStatus;
      completedAt: string | null;
    } | null;
    summary: {
      status: ArtifactStatus;
      reviewedAt: string | null;
      completedAt: string | null;
    } | null;
  };
}

export interface WebhookDeliveryRecord {
  id: string;
  subscriptionId: string;
  outboxEventId: string;
  eventType: string;
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED";
  attempts: number;
  lastStatusCode: number | null;
  lastResponseBody: string | null;
  lastError: string | null;
  nextAttemptAt: string;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CalendarProvider = 'GOOGLE' | 'MICROSOFT';

export interface CalendarConnectionRecord {
  id: string;
  provider: CalendarProvider;
  providerAccountId: string | null;
  accountEmail: string | null;
  calendarId: string | null;
  scopes: string[];
  syncEnabled: boolean;
  status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarConnectResult {
  provider: CalendarProvider;
  authorizeUrl: string;
  expiresAt: string;
}

export interface WebhookSubscriptionRecord {
  id: string;
  name: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  _count?: { deliveries: number };
  deliveries?: Array<
    Pick<
      WebhookDeliveryRecord,
      | "id"
      | "status"
      | "eventType"
      | "attempts"
      | "deliveredAt"
      | "lastError"
      | "createdAt"
    >
  >;
}

export interface WebhookCreateResult extends WebhookSubscriptionRecord {
  secret: string;
  secretWarning: string;
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
  rationale?: string;
}

export interface AgendaDraft {
  sessionId: string;
  provider: string;
  model: string;
  items: AgendaDraftItem[];
  totalDurationSeconds: number;
  generatedAt: string;
  persisted: false;
}

export interface AgendaTemplateRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  createdById: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    templateId: string;
    position: number;
    title: string;
    durationSeconds: number;
    type: AgendaItemType;
    content: Record<string, unknown>;
  }>;
  createdBy: { id: string; displayName: string };
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
  presenters?: EventPresenter[];
  _count?: { registrations: number };
}

export interface BookingPageRecord extends BookingPage {
  _count?: { reservations: number };
}

export interface BookingReservationRecord {
  id: string;
  bookingPageId: string;
  sessionId: string | null;
  name: string;
  email: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  answers: Record<string, unknown>;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  version: number;
  rescheduledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  session: Session | null;
  calendarEventSyncs?: Array<{
    id: string;
    provider: CalendarProvider;
    action: 'CREATE' | 'UPDATE' | 'CANCEL';
    status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';
    providerEventId: string | null;
    attempts: number;
    syncedAt: string | null;
    failureCode: string | null;
    updatedAt: string;
  }>;
}

export interface CalendarInvitePayload {
  filename: string;
  mimeType: string;
  content: string;
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

export interface LiveTranscriptSegment {
  transcriptId: string;
  sessionId: string;
  segmentId: string;
  position: number;
  startMs: number;
  endMs: number;
  speakerLabel: string | null;
  text: string;
  userId?: string;
  displayName?: string;
  language?: string | null;
  isFinal: true;
}

export interface LiveTranscriptionChunkResult {
  sessionId: string;
  transcriptId: string;
  provider: string;
  language: string | null;
  segmentCount: number;
  segments: Array<{
    id: string;
    position: number;
    startMs: number;
    endMs: number;
    speakerLabel: string | null;
    text: string;
  }>;
}

export interface TranscriptRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  language: string | null;
  fullText?: string | null;
  completedAt: string | null;
  version: number;
  segments?: Array<{
    id: string;
    position: number;
    startMs: number;
    endMs: number;
    speakerLabel: string | null;
    text: string;
  }>;
  revisions?: Array<{
    id: string;
    segmentId: string;
    editedByUserId: string;
    before: { text?: string; speakerLabel?: string | null };
    after: { text?: string; speakerLabel?: string | null };
    createdAt: string;
  }>;
}

export interface AiCitationRecord {
  segmentPosition: number;
  quote?: string;
}

export interface AiDecisionRecord {
  text: string;
  citations?: AiCitationRecord[];
}

export interface AiActionItemRecord {
  text: string;
  owner?: string;
  dueDate?: string;
  citations?: AiCitationRecord[];
}

export interface MemorySummaryRecord {
  id: string;
  sessionId: string;
  status: ArtifactStatus;
  provider: string | null;
  model: string | null;
  summaryText: string | null;
  decisions: AiDecisionRecord[];
  actionItems: AiActionItemRecord[];
  citations: AiCitationRecord[];
  failureCode: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  followUpDraft: {
    subject?: string;
    body?: string;
    provider?: string;
    model?: string;
  };
  followUpGeneratedAt: string | null;
  followUpApprovedAt: string | null;
  followUpApprovedByUserId: string | null;
  version: number;
}

export interface MemoryListItem extends Session {
  recording: RecordingRecord | null;
  transcript: TranscriptRecord | null;
  memorySummary: MemorySummaryRecord | null;
  _count: { chatMessages: number; polls: number; questions: number };
}

export interface EmailDeliveryRecord {
  id: string;
  sessionId: string;
  memorySummaryId: string | null;
  requestedByUserId: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';
  provider: string | null;
  providerMessageId: string | null;
  recipients: string[];
  subject: string;
  body: string;
  attempts: number;
  failureCode: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryDetail extends SessionDetail {
  recording: RecordingRecord | null;
  transcript: TranscriptRecord | null;
  memorySummary: MemorySummaryRecord | null;
  emailDeliveries: EmailDeliveryRecord[];
  chatMessages: ChatMessageRecord[];
  polls: PollRecord[];
  questions: QuestionRecord[];
}

export type WhiteboardOperationKind =
  | 'STROKE'
  | 'SHAPE'
  | 'TEXT'
  | 'STICKY'
  | 'IMAGE'
  | 'CLEAR';

export interface WhiteboardOperationRecord {
  id: string;
  operationId: string;
  sessionId: string;
  documentId: string;
  authorUserId: string;
  sequence: number;
  kind: WhiteboardOperationKind;
  payload: Record<string, unknown>;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface WhiteboardState {
  document: {
    id: string;
    sessionId: string;
    version: number;
    snapshotVersion: number;
    snapshot: Record<string, unknown>;
    updatedAt: string;
  };
  operations: WhiteboardOperationRecord[];
}

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
  sessionId: string;
  name: string;
  position: number;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  livekitRoomName: string;
  createdAt: string;
  updatedAt: string;
  assignments: BreakoutAssignmentRecord[];
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
    return publicRequest('/auth/signup', { method: "POST", body: JSON.stringify(input) });
  },

  login(input: { email: string; password: string; workspaceSlug?: string }): Promise<
    | AuthTokenBundle
    | { mfaRequired: true; challengeToken: string; expiresIn: number }
  > {
    return publicRequest('/auth/login', { method: "POST", body: JSON.stringify(input) });
  },

  completeMfa(input: { challengeToken: string; code: string }): Promise<AuthTokenBundle> {
    return publicRequest<AuthTokenBundle>('/auth/mfa/complete', {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  verifyEmail(token: string): Promise<AuthTokenBundle> {
    return publicRequest<AuthTokenBundle>('/auth/verify-email', {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  requestEmailVerification(email: string): Promise<{
    accepted: true;
    developmentVerificationToken?: string;
  }> {
    return publicRequest('/auth/verify-email/request', {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  requestPasswordReset(email: string): Promise<{ accepted: true; developmentResetToken?: string }> {
    return publicRequest('/auth/password-reset/request', {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, password: string): Promise<{ reset: true }> {
    return publicRequest('/auth/password-reset/complete', {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  },

  acceptInvitation(input: { token: string; displayName?: string; password: string }): Promise<
    AuthTokenBundle | { mfaRequired: true; challengeToken: string; expiresIn: number }
  > {
    return publicRequest('/auth/invitations/accept', {
      method: "POST",
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
      method: "POST",
      body: JSON.stringify({ workspaceId, refreshToken }),
    });
  },

  logout(): Promise<{ loggedOut: true }> {
    return request('/auth/logout', {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listLoginSessions(): Promise<LoginSession[]> {
    return request<LoginSession[]>('/auth/sessions');
  },

  revokeLoginSession(sessionId: string): Promise<{ id: string; revoked: true }> {
    return request(`/auth/sessions/${sessionId}`, { method: "DELETE" });
  },

  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
    return request('/auth/password', {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  setupMfa(): Promise<{ secret: string; otpauthUri: string; recoveryCodes: string[] }> {
    return request('/auth/mfa/setup', { method: "POST" });
  },

  confirmMfa(code: string): Promise<{ enabled: true }> {
    return request('/auth/mfa/confirm', { method: "POST", body: JSON.stringify({ code }) });
  },

  disableMfa(code: string): Promise<{ enabled: false }> {
    return request('/auth/mfa', { method: "DELETE", body: JSON.stringify({ code }) });
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
      method: "POST",
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
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  listWorkspaceMembers(): Promise<WorkspaceMember[]> {
    return request('/workspaces/current/members');
  },

  updateWorkspaceMemberRole(membershipId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    return request(`/workspaces/current/members/${membershipId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  removeWorkspaceMember(membershipId: string): Promise<{ id: string; removed: true }> {
    return request(`/workspaces/current/members/${membershipId}`, { method: "DELETE" });
  },

  listWorkspaceInvitations(): Promise<WorkspaceInvitation[]> {
    return request('/workspaces/current/invitations');
  },

  inviteWorkspaceMember(email: string, role: WorkspaceRole): Promise<WorkspaceInvitation> {
    return request('/workspaces/current/invitations', {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  revokeWorkspaceInvitation(invitationId: string): Promise<{ id: string; revoked: true }> {
    return request(`/workspaces/current/invitations/${invitationId}`, { method: "DELETE" });
  },

  getWorkspaceAnalytics(input?: {
    from?: string;
    to?: string;
  }): Promise<WorkspaceAnalytics> {
    const params = new URLSearchParams();
    if (input?.from) params.set("from", input.from);
    if (input?.to) params.set("to", input.to);
    const suffix = params.size ? `?${params.toString()}` : "";
    return request(`/analytics/workspace${suffix}`);
  },

  getSessionAnalytics(id: string): Promise<SessionAnalytics> {
    return request(`/analytics/sessions/${id}`);
  },

  listApiKeys(): Promise<ApiKeyRecord[]> {
    return request("/api-keys");
  },

  createApiKey(input: {
    name: string;
    role: "HOST" | "MEMBER" | "ANALYST";
    scopes: string[];
    expiresAt?: string;
  }): Promise<ApiKeyCreateResult> {
    return request("/api-keys", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  revokeApiKey(id: string): Promise<ApiKeyRecord & { revoked: true }> {
    return request(`/api-keys/${id}`, { method: "DELETE" });
  },

  listCalendarConnections(): Promise<CalendarConnectionRecord[]> {
    return request<CalendarConnectionRecord[]>('/calendar-integrations');
  },

  beginCalendarConnection(
    provider: CalendarProvider,
    returnUrl: string,
  ): Promise<CalendarConnectResult> {
    const params = new URLSearchParams({ returnUrl });
    return request<CalendarConnectResult>(
      `/calendar-integrations/${provider.toLowerCase()}/connect?${params.toString()}`,
      { method: 'POST' },
    );
  },

  disconnectCalendar(provider: CalendarProvider): Promise<{
    provider: CalendarProvider;
    disconnected: true;
  }> {
    return request(
      `/calendar-integrations/${provider.toLowerCase()}`,
      { method: 'DELETE' },
    );
  },

  listWebhooks(): Promise<WebhookSubscriptionRecord[]> {
    return request("/webhooks");
  },

  createWebhook(input: {
    name: string;
    url: string;
    eventTypes: string[];
  }): Promise<WebhookCreateResult> {
    return request("/webhooks", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateWebhook(
    id: string,
    version: number,
    input: Partial<
      Pick<WebhookSubscriptionRecord, "name" | "url" | "eventTypes" | "active">
    >,
  ): Promise<WebhookSubscriptionRecord> {
    return request(`/webhooks/${id}`, {
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  deleteWebhook(id: string): Promise<{ id: string; deleted: true }> {
    return request(`/webhooks/${id}`, { method: "DELETE" });
  },

  rotateWebhookSecret(
    id: string,
  ): Promise<{
    id: string;
    version: number;
    secret: string;
    secretWarning: string;
  }> {
    return request(`/webhooks/${id}/rotate-secret`, { method: "POST" });
  },

  listWebhookDeliveries(id: string): Promise<WebhookDeliveryRecord[]> {
    return request(`/webhooks/${id}/deliveries`);
  },

  replayWebhookDelivery(deliveryId: string): Promise<WebhookDeliveryRecord> {
    return request(`/webhooks/deliveries/${deliveryId}/replay`, {
      method: "POST",
    });
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

  generateAgendaDraft(
    sessionId: string,
    input: {
      objective?: string;
      audience?: string;
      durationMinutes?: number;
    },
  ): Promise<AgendaDraft> {
    return request<AgendaDraft>(`/sessions/${sessionId}/agenda-items/ai-draft`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  applyAgendaDraft(
    sessionId: string,
    items: AgendaDraftItem[],
  ): Promise<AgendaItem[]> {
    return request<AgendaItem[]>(`/sessions/${sessionId}/agenda-items/ai-apply`, {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  },

  listAgendaTemplates(): Promise<AgendaTemplateRecord[]> {
    return request<AgendaTemplateRecord[]>('/agenda-templates');
  },

  createAgendaTemplate(input: {
    name: string;
    description?: string;
    items: AgendaDraftItem[];
  }): Promise<AgendaTemplateRecord> {
    return request<AgendaTemplateRecord>('/agenda-templates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateAgendaTemplate(
    templateId: string,
    version: number,
    input: {
      name?: string;
      description?: string;
      items?: AgendaDraftItem[];
    },
  ): Promise<AgendaTemplateRecord> {
    return request<AgendaTemplateRecord>(`/agenda-templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'if-match': String(version) },
      body: JSON.stringify(input),
    });
  },

  deleteAgendaTemplate(templateId: string): Promise<{ id: string; deleted: true }> {
    return request(`/agenda-templates/${templateId}`, { method: 'DELETE' });
  },

  saveSessionAgendaAsTemplate(
    sessionId: string,
    input: { name: string; description?: string },
  ): Promise<AgendaTemplateRecord> {
    return request<AgendaTemplateRecord>(
      `/sessions/${sessionId}/agenda-items/save-template`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },

  applyAgendaTemplate(
    sessionId: string,
    templateId: string,
    replaceExisting = false,
  ): Promise<AgendaItem[]> {
    return request<AgendaItem[]>(
      `/sessions/${sessionId}/agenda-items/apply-template/${templateId}`,
      {
        method: 'POST',
        body: JSON.stringify({ replaceExisting }),
      },
    );
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

  submitLiveTranscriptionChunk(
    sessionId: string,
    input: {
      sequence: number;
      startMs: number;
      mimeType: string;
      language?: string;
      audioBase64: string;
    },
  ): Promise<LiveTranscriptionChunkResult> {
    return request<LiveTranscriptionChunkResult>(
      `/sessions/${sessionId}/transcription/chunks`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
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

  getEvent(eventId: string): Promise<EventRecord> {
    return request<EventRecord>(`/events/${eventId}`);
  },

  listEventPresenters(eventId: string): Promise<EventPresenter[]> {
    return request<EventPresenter[]>(`/events/${eventId}/presenters`);
  },

  createEventPresenter(
    eventId: string,
    input: CreateEventPresenterInput,
  ): Promise<EventPresenter> {
    return request<EventPresenter>(`/events/${eventId}/presenters`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateEventPresenter(
    eventId: string,
    presenterId: string,
    input: Partial<{
      role: Exclude<EventPresenterRole, 'ORGANIZER'>;
      name: string;
      email: string;
      title: string | null;
      bio: string | null;
      avatarUrl: string | null;
      position: number;
    }>,
  ): Promise<EventPresenter> {
    return request<EventPresenter>(
      `/events/${eventId}/presenters/${presenterId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
  },

  deleteEventPresenter(
    eventId: string,
    presenterId: string,
  ): Promise<{ id: string; deleted: true }> {
    return request(`/events/${eventId}/presenters/${presenterId}`, {
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

  listBookingReservations(bookingId: string): Promise<BookingReservationRecord[]> {
    return request<BookingReservationRecord[]>(`/bookings/${bookingId}/reservations`);
  },

  rescheduleBookingReservation(
    bookingId: string,
    reservationId: string,
    version: number,
    input: { startsAt: string; timezone: string },
  ): Promise<BookingReservationRecord> {
    return request<BookingReservationRecord>(
      `/bookings/${bookingId}/reservations/${reservationId}/reschedule`,
      {
        method: 'PATCH',
        headers: { 'if-match': String(version) },
        body: JSON.stringify(input),
      },
    );
  },

  cancelBookingReservation(
    bookingId: string,
    reservationId: string,
    version: number,
  ): Promise<BookingReservationRecord> {
    return request<BookingReservationRecord>(
      `/bookings/${bookingId}/reservations/${reservationId}/cancel`,
      {
        method: 'POST',
        headers: { 'if-match': String(version) },
      },
    );
  },

  getBookingReservationCalendar(
    bookingId: string,
    reservationId: string,
  ): Promise<CalendarInvitePayload> {
    return request<CalendarInvitePayload>(
      `/bookings/${bookingId}/reservations/${reservationId}/calendar`,
    );
  },

  listMemory(query?: string): Promise<Paginated<MemoryListItem>> {
    const search = query ? `?query=${encodeURIComponent(query)}` : "";
    return request<Paginated<MemoryListItem>>(`/memory${search}`);
  },

  getMemory(sessionId: string): Promise<MemoryDetail> {
    return request<MemoryDetail>(`/memory/${sessionId}`);
  },

  updateTranscriptSegment(
    sessionId: string,
    segmentId: string,
    version: number,
    input: { text: string; speakerLabel?: string | null },
  ): Promise<TranscriptRecord> {
    return request<TranscriptRecord>(
      `/transcripts/${sessionId}/segments/${segmentId}`,
      {
        method: "PATCH",
        headers: { "if-match": String(version) },
        body: JSON.stringify(input),
      },
    );
  },

  updateMemorySummary(
    sessionId: string,
    version: number,
    input: {
      summaryText: string;
      decisions?: AiDecisionRecord[];
      actionItems?: AiActionItemRecord[];
    },
  ): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(`/memory/${sessionId}/summary`, {
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  approveMemorySummary(
    sessionId: string,
    version: number,
  ): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(
      `/memory/${sessionId}/summary/approve`,
      {
        method: "POST",
        headers: { "if-match": String(version) },
      },
    );
  },

  generateFollowUpDraft(sessionId: string): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(
      `/memory/${sessionId}/follow-up/generate`,
      { method: "POST" },
    );
  },

  updateFollowUpDraft(
    sessionId: string,
    version: number,
    input: { subject: string; body: string },
  ): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(`/memory/${sessionId}/follow-up`, {
      method: "PATCH",
      headers: { "if-match": String(version) },
      body: JSON.stringify(input),
    });
  },

  approveFollowUpDraft(
    sessionId: string,
    version: number,
  ): Promise<MemorySummaryRecord> {
    return request<MemorySummaryRecord>(
      `/memory/${sessionId}/follow-up/approve`,
      {
        method: "POST",
        headers: { "if-match": String(version) },
      },
    );
  },

  sendFollowUpDraft(
    sessionId: string,
    recipients: string[],
  ): Promise<EmailDeliveryRecord> {
    return request<EmailDeliveryRecord>(`/memory/${sessionId}/follow-up/send`, {
      method: "POST",
      body: JSON.stringify({ recipients }),
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

  getWhiteboard(sessionId: string): Promise<WhiteboardState> {
    return request(`/sessions/${sessionId}/whiteboard`);
  },

  appendWhiteboardOperation(
    sessionId: string,
    input: {
      operationId: string;
      kind: WhiteboardOperationKind;
      payload: Record<string, unknown>;
    },
  ): Promise<WhiteboardOperationRecord> {
    return request(`/sessions/${sessionId}/whiteboard/operations`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  saveWhiteboardSnapshot(
    sessionId: string,
    input: { baseVersion: number; snapshot: Record<string, unknown> },
  ): Promise<WhiteboardState["document"]> {
    return request(`/sessions/${sessionId}/whiteboard/snapshot`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listBreakouts(sessionId: string): Promise<BreakoutRoomRecord[]> {
    return request(`/sessions/${sessionId}/breakouts`);
  },

  createBreakout(
    sessionId: string,
    input: { name: string; position: number },
  ): Promise<BreakoutRoomRecord> {
    return request(`/sessions/${sessionId}/breakouts`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  assignBreakout(
    sessionId: string,
    breakoutRoomId: string,
    userIds: string[],
  ): Promise<BreakoutRoomRecord> {
    return request(
      `/sessions/${sessionId}/breakouts/${breakoutRoomId}/assignments`,
      {
        method: "PUT",
        body: JSON.stringify({ userIds }),
      },
    );
  },

  randomizeBreakouts(
    sessionId: string,
    userIds: string[],
  ): Promise<{ sessionId: string; roomCount: number; participantCount: number }> {
    return request(`/sessions/${sessionId}/breakouts/randomize`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    });
  },

  startBreakouts(
    sessionId: string,
  ): Promise<{ sessionId: string; roomCount: number; status: "ACTIVE" }> {
    return request(`/sessions/${sessionId}/breakouts/start`, {
      method: "POST",
    });
  },

  closeBreakouts(
    sessionId: string,
  ): Promise<{ sessionId: string; roomCount: number; status: "CLOSED" }> {
    return request(`/sessions/${sessionId}/breakouts/close`, {
      method: "POST",
    });
  },

  broadcastBreakout(
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
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },

  createBreakoutMediaToken(
    sessionId: string,
    breakoutRoomId: string,
  ): Promise<MediaToken> {
    return request(
      `/sessions/${sessionId}/breakouts/${breakoutRoomId}/media-token`,
      { method: "POST" },
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

  sendReaction(
    sessionId: string,
    reaction: "👍" | "👏" | "❤️" | "😂" | "🎉",
  ): Promise<{
    sessionId: string;
    userId: string;
    displayName: string;
    reaction: string;
    occurredAt: string;
  }> {
    return request(`/sessions/${sessionId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    });
  },

  setHandRaise(
    sessionId: string,
    raised: boolean,
  ): Promise<{
    sessionId: string;
    userId: string;
    displayName: string;
    raised: boolean;
    occurredAt: string;
  }> {
    return request(`/sessions/${sessionId}/hand-raise`, {
      method: "POST",
      body: JSON.stringify({ raised }),
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
