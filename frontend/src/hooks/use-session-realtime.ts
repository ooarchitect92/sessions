import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { bootstrapAuthentication } from '../auth/dev-auth';

function realtimeUrl(): string {
  const api = new URL(import.meta.env.VITE_API_URL);
  return `${api.origin}/realtime`;
}

export interface WhiteboardCursorRealtimePayload {
  sessionId: string;
  userId: string;
  displayName: string;
  x: number;
  y: number;
  visible: boolean;
  occurredAt: string;
}

export interface LiveCaptionRealtimePayload {
  sessionId: string;
  sequence: number;
  speakerUserId: string;
  speakerName: string;
  text: string;
  language: string | null;
  provider: string;
  occurredAt: string;
}

export interface LiveCaptionErrorPayload {
  sessionId: string;
  sequence: number;
  code: string;
  message: string;
}

const activeSessionSockets = new Map<string, Socket>();

export function publishWhiteboardCursor(
  sessionId: string,
  input: { x: number; y: number; visible: boolean },
): void {
  const socket = activeSessionSockets.get(sessionId);
  if (!socket?.connected) return;
  socket.emit('whiteboard.cursor', { sessionId, ...input });
}

export function publishCaptionAudio(
  sessionId: string,
  input: {
    sequence: number;
    mimeType: string;
    language?: string | null;
    audio: ArrayBuffer;
  },
): boolean {
  const socket = activeSessionSockets.get(sessionId);
  if (!socket?.connected) return false;
  socket.emit('caption.audio', { sessionId, ...input });
  return true;
}

function dispatchWhiteboardCursor(payload: WhiteboardCursorRealtimePayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<WhiteboardCursorRealtimePayload>(
      `sessions:whiteboard-cursor:${payload.sessionId}`,
      { detail: payload },
    ),
  );
}

function dispatchLiveCaption(payload: LiveCaptionRealtimePayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LiveCaptionRealtimePayload>(
      `sessions:caption-final:${payload.sessionId}`,
      { detail: payload },
    ),
  );
}

function dispatchLiveCaptionError(payload: LiveCaptionErrorPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LiveCaptionErrorPayload>(
      `sessions:caption-error:${payload.sessionId}`,
      { detail: payload },
    ),
  );
}

export function useSessionRealtime(sessionId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let socket: Socket | undefined;

    const connect = async () => {
      const token = await bootstrapAuthentication();
      if (disposed) return;

      socket = io(realtimeUrl(), {
        transports: ['websocket'],
        auth: { token },
      });
      socket.on('connect', () => {
        if (!socket) return;
        activeSessionSockets.set(sessionId, socket);
        socket.emit('session.join', { sessionId });
      });
      socket.on('agenda.activated', () => {
        void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      });
      socket.on('participant.joined', () => {
        void queryClient.invalidateQueries({ queryKey: ['session-presence', sessionId] });
      });
      socket.on('participant.left', () => {
        void queryClient.invalidateQueries({ queryKey: ['session-presence', sessionId] });
      });
      for (const eventName of ['chat.message.created', 'chat.reaction.updated']) {
        socket.on(eventName, () => {
          void queryClient.invalidateQueries({ queryKey: ['chat', sessionId] });
        });
      }
      socket.on('whiteboard.operation.appended', () => {
        void queryClient.invalidateQueries({ queryKey: ['whiteboard', sessionId] });
      });
      socket.on(
        'whiteboard.cursor.updated',
        (payload: WhiteboardCursorRealtimePayload) => {
          if (payload?.sessionId === sessionId) dispatchWhiteboardCursor(payload);
        },
      );
      socket.on('caption.final', (payload: LiveCaptionRealtimePayload) => {
        if (payload?.sessionId === sessionId) dispatchLiveCaption(payload);
      });
      socket.on('caption.error', (payload: LiveCaptionErrorPayload) => {
        if (payload?.sessionId === sessionId) dispatchLiveCaptionError(payload);
      });
      for (const eventName of ['breakouts.updated', 'breakouts.announcement']) {
        socket.on(eventName, () => {
          void queryClient.invalidateQueries({ queryKey: ['breakouts', sessionId] });
        });
      }
      for (const eventName of [
        'poll.created',
        'poll.launched',
        'poll.closed',
        'poll.results.updated',
      ]) {
        socket.on(eventName, () => {
          void queryClient.invalidateQueries({ queryKey: ['polls', sessionId] });
        });
      }
      for (const eventName of [
        'question.created',
        'question.updated',
        'question.votes.updated',
      ]) {
        socket.on(eventName, () => {
          void queryClient.invalidateQueries({ queryKey: ['questions', sessionId] });
        });
      }
      socket.on('memory.updated', () => {
        void queryClient.invalidateQueries({ queryKey: ['memory'] });
        void queryClient.invalidateQueries({
          queryKey: ['memory-detail', sessionId],
        });
      });
    };

    void connect();
    return () => {
      disposed = true;
      const current = activeSessionSockets.get(sessionId);
      if (current && current === socket) activeSessionSockets.delete(sessionId);
      socket?.disconnect();
    };
  }, [queryClient, sessionId]);
}
