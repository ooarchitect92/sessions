import type {
  AgendaItemType,
  ApiEnvelope,
  CreateRoomInput,
  CreateSessionInput,
  Paginated,
  Room,
  Session,
  SessionStatus,
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
};
