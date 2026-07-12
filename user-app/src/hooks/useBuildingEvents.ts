/**
 * useBuildingEvents — subscribes to the per-building WebSocket stream.
 * Mirror of frontend/src/api/realtime.ts; user-app is anonymous so no
 * token is attached.
 *
 * Auto-reconnect with exponential backoff (1s, 2s, 4s, …, capped 30s).
 */
import { useEffect, useRef } from 'react';

import { API_URL } from '../api/client';

export interface BuildingEvent {
  type: string;
  payload: Record<string, unknown>;
  actor: { id: number; email: string; role: string } | null;
  ts: string;
}

export function wsUrlFor(buildingId: string | number): string {
  // API_URL might be '/api' (relative) or 'http(s)://...' — handle both.
  if (API_URL.startsWith('http')) {
    return `${API_URL.replace(/^http/, 'ws')}/buildings/${buildingId}/ws`;
  }
  // Relative path → derive from window.location.
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${API_URL}/buildings/${buildingId}/ws`;
}

export function useBuildingEvents(
  buildingId: string | number | null | undefined,
  onEvent: (e: BuildingEvent) => void,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!buildingId) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      try {
        socket = new WebSocket(wsUrlFor(buildingId));
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => { attempt = 0; };
      socket.onmessage = (msg) => {
        try { handlerRef.current(JSON.parse(msg.data) as BuildingEvent); }
        catch { /* swallow */ }
      };
      socket.onclose = () => { if (!stopped) scheduleReconnect(); };
      socket.onerror = () => { try { socket?.close(); } catch { /* noop */ } };
    };

    const scheduleReconnect = () => {
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
      timer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try { socket?.close(); } catch { /* noop */ }
    };
  }, [buildingId]);
}
