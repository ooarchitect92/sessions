import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { bootstrapAuthentication } from '../auth/dev-auth';

export type SessionReaction = '👍' | '❤️' | '😂' | '👏' | '🎉' | '🙌';

export interface SessionReactionEvent {
  reactionId: string;
  sessionId: string;
  userId: string;
  displayName: string;
  reaction: SessionReaction;
  occurredAt: string;
}

export interface SessionRealtimeController {
  connected: boolean;
  reactions: SessionReactionEvent[];
  sendReaction: (reaction: SessionReaction) => void;
}

function realtimeUrl(): string {
  const api = new URL(import.meta.env.VITE_API_URL);
  return `${api.origin}/realtime`;
}

export function useSessionRealtime(sessionId: string): SessionRealtimeController {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket>();
  const [connected, setConnected] = useState(false);
  const [reactions, setReactions] = useState<SessionReactionEvent[]>([]);

  const sendReaction = useCallback(
    (reaction: SessionReaction) => {
      socketRef.current?.emit('reaction.send', { sessionId, reaction });
    },
    [sessionId],
  );

  useEffect(() => {
    let disposed = false;
    let socket: Socket | undefined;
    let heartbeatTimer: number | undefined;
    const reactionTimers = new Set<number>();

    const connect = async () => {
      const token = await bootstrapAuthentication();
      if (disposed) return;

      socket = io(realtimeUrl(), {
        transports: ['websocket'],
        auth: { token },
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket?.emit('session.join', { sessionId }, () => {
          void queryClient.invalidateQueries({
            queryKey: ['session-presence', sessionId],
          });
        });
        heartbeatTimer = window.setInterval(() => {
          socket?.emit('session.heartbeat', { sessionId });
        }, 30_000);
      });
      socket.on('disconnect', () => {
        setConnected(false);
      });
      socket.on('agenda.activated', () => {
        void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      });
      socket.on('presence.updated', (event: { sessionId: string }) => {
        if (event.sessionId !== sessionId) return;
        void queryClient.invalidateQueries({
          queryKey: ['session-presence', sessionId],
        });
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
      socket.on('reaction.received', (event: SessionReactionEvent) => {
        if (event.sessionId !== sessionId) return;
        setReactions((current) => [...current.slice(-7), event]);
        const timer = window.setTimeout(() => {
          setReactions((current) =>
            current.filter((reaction) => reaction.reactionId !== event.reactionId),
          );
          reactionTimers.delete(timer);
        }, 2600);
        reactionTimers.add(timer);
      });
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
      setConnected(false);
      socketRef.current = undefined;
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
      socket?.disconnect();
      for (const timer of reactionTimers) window.clearTimeout(timer);
      reactionTimers.clear();
    };
  }, [queryClient, sessionId]);

  return { connected, reactions, sendReaction };
}
