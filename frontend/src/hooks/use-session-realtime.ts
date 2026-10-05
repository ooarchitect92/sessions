import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { bootstrapAuthentication } from '../auth/dev-auth';

function realtimeUrl(): string {
  const api = new URL(import.meta.env.VITE_API_URL);
  return `${api.origin}/realtime`;
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
        socket?.emit('session.join', { sessionId });
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
      socket.on('chat.message.created', () => {
        void queryClient.invalidateQueries({ queryKey: ['chat', sessionId] });
      });
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
      for (const eventName of [
        'breakout.updated',
        'breakout.started',
        'breakout.closed',
      ]) {
        socket.on(eventName, () => {
          void queryClient.invalidateQueries({
            queryKey: ['breakouts', sessionId],
          });
        });
      }
      for (const eventName of [
        'whiteboard.operation',
        'whiteboard.snapshot.updated',
      ]) {
        socket.on(eventName, () => {
          void queryClient.invalidateQueries({
            queryKey: ['whiteboard', sessionId],
          });
        });
      }
      socket.on(
        'session.reaction',
        (payload: {
          userId?: string;
          displayName?: string;
          reaction?: string;
          occurredAt?: string;
        }) => {
          window.dispatchEvent(
            new CustomEvent('sessions:reaction', { detail: payload }),
          );
        },
      );
      socket.on(
        'session.hand_raise',
        (payload: {
          userId?: string;
          displayName?: string;
          raised?: boolean;
          occurredAt?: string;
        }) => {
          window.dispatchEvent(
            new CustomEvent('sessions:hand-raise', { detail: payload }),
          );
        },
      );
      socket.on('breakout.broadcast', (payload: { message?: string }) => {
        if (payload?.message) {
          window.dispatchEvent(
            new CustomEvent('sessions:breakout-broadcast', {
              detail: { message: payload.message },
            }),
          );
        }
      });
      socket.on(
        'transcript.live.segment',
        (payload: {
          transcriptId?: string;
          sessionId?: string;
          segmentId?: string;
          position?: number;
          startMs?: number;
          endMs?: number;
          speakerLabel?: string | null;
          text?: string;
          userId?: string;
          displayName?: string;
          language?: string | null;
          isFinal?: boolean;
        }) => {
          if (payload?.segmentId && payload.text) {
            window.dispatchEvent(
              new CustomEvent('sessions:live-caption', { detail: payload }),
            );
          }
          void queryClient.invalidateQueries({
            queryKey: ['memory-detail', sessionId],
          });
        },
      );
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
      socket?.disconnect();
    };
  }, [queryClient, sessionId]);
}
