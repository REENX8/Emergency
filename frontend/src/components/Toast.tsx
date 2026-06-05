import React, { useEffect } from 'react';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

interface Props {
  open: boolean;
  message: string;
  kind?: ToastKind;
  durationMs?: number;
  onClose: () => void;
}

const COLORS: Record<ToastKind, { bg: string; border: string; text: string }> = {
  info:    { bg: '#1e293b', border: '#3b82f6', text: '#e2e8f0' },
  success: { bg: '#14532d', border: '#22c55e', text: '#dcfce7' },
  error:   { bg: '#450a0a', border: '#ef4444', text: '#fecaca' },
  warning: { bg: '#451a03', border: '#f59e0b', text: '#fed7aa' },
};

/**
 * Non-blocking notification, auto-dismisses after `durationMs`. Replaces
 * window.alert() throughout the app.
 */
export default function Toast({ open, message, kind = 'info', durationMs = 3500, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onClose, durationMs);
    return () => clearTimeout(id);
  }, [open, durationMs, onClose]);

  if (!open) return null;
  const c = COLORS[kind];

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1100,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        padding: '10px 16px',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        maxWidth: 380,
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {message}
    </div>
  );
}
