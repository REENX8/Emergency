/**
 * realtime.ts — WebSocket subscription hook for per-building events.
 *
 * Connects to /buildings/{id}/ws and dispatches incoming events to a
 * caller-provided handler. Falls back silently when the socket closes —
 * the caller's polling code remains as a backstop.
 *
 * Auto-reconnects with exponential backoff capped at 30s.
 */
import { useEffect, useRef } from 'react';

import { API_URL, getToken } from './client';

export interface BuildingEvent {
  type: string;
  payload: any;
  actor: { id: number; email: string; role: string } | null;
  ts: string;
}

function wsUrlFor(buildingId: number | string): string {
  // API_URL might be '/api' (relative, production nginx) or 'http(s)://...'
  // (dev) — a relative base needs the scheme/host derived from the page.
  const base = API_URL.startsWith('http')
    ? API_URL.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${API_URL}`;
  const tok = getToken();
  const qs = tok ? `?token=${encodeURIComponent(tok)}` : '';
  return `${base}/buildings/${buildingId}/ws${qs}`;
}

export function useBuildingEvents(
  buildingId: number | string | null | undefined,
  onEvent: (e: BuildingEvent) => void,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!buildingId) return;

    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
        try {
          handlerRef.current(JSON.parse(msg.data) as BuildingEvent);
        } catch {
          /* swallow malformed payloads */
        }
      };
      socket.onclose = () => {
        if (!stopped) scheduleReconnect();
      };
      socket.onerror = () => {
        try { socket?.close(); } catch { /* noop */ }
      };
    };

    const scheduleReconnect = () => {
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { socket?.close(); } catch { /* noop */ }
    };
  }, [buildingId]);
}
