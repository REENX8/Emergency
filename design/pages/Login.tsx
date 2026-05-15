import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';

import { login } from '../api/client';

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  background: '#0f172a',
  color: '#f1f5f9',
  border: '1px solid #334155',
  fontSize: 14,
  marginBottom: 12,
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form
        onSubmit={submit}
        style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
          padding: 28, width: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 18 }}>
          🚨 เข้าสู่ระบบ
        </h1>

        <label style={{ fontSize: 12, color: '#94a3b8' }}>อีเมล</label>
        <input
          type="email" autoFocus required style={fieldStyle}
          value={email} onChange={(e) => setEmail(e.target.value)}
        />

        <label style={{ fontSize: 12, color: '#94a3b8' }}>รหัสผ่าน</label>
        <input
          type="password" required minLength={8} style={fieldStyle}
          value={password} onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>⚠ {error}</div>
        )}

        <button
          type="submit" disabled={busy}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
            background: busy ? '#475569' : '#3b82f6', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>

        <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          ยังไม่มีบัญชี? <Link to="/register" style={{ color: '#60a5fa' }}>สมัครสมาชิก</Link>
        </div>
      </form>
    </div>
  );
}
