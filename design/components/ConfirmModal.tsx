import React, { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Non-blocking replacement for window.confirm(). Centered modal with a
 * dimmed backdrop. Escape closes, Enter confirms.
 */
export default function ConfirmModal({
  open,
  title = 'ยืนยัน',
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel  = 'ยกเลิก',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter')  onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 10, padding: 22, minWidth: 320, maxWidth: 460,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 18 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              background: '#334155', border: 'none', borderRadius: 6,
              color: '#cbd5e1', padding: '6px 14px',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={okRef}
            onClick={onConfirm}
            style={{
              background: destructive ? '#dc2626' : '#3b82f6',
              border: 'none', borderRadius: 6, color: '#fff',
              padding: '6px 14px', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
