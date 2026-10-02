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
    };

    void connect();
    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [queryClient, sessionId]);
}
