import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { login } from '../api/client';
import '../styles.css';

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
    <div className="login-screen">
      <div className="login-bg">
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 800 600">
          <defs>
            <pattern id="bg-dots" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--line-1)" />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="url(#bg-dots)" />
          {[60, 180, 300, 420].map((y, i) => (
            <g key={i} opacity="0.4">
              <rect x="100" y={y} width="600" height="80" fill="none" stroke="var(--line-1)" strokeDasharray="2 4" />
              <line x1="100" y1={y + 40} x2="700" y2={y + 40} stroke="var(--accent-cyan)" strokeOpacity="0.18" />
            </g>
          ))}
        </svg>
      </div>

      <div className="login-card">
        <div className="login-brand">
          <svg viewBox="0 0 24 24" width="36" height="36">
            <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
            <line x1="2" y1="16" x2="22" y2="16" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
            <circle cx="17" cy="6" r="1.5" fill="var(--accent-red)">
              <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" />
            </circle>
          </svg>
          <div>
            <div className="login-title mono">EVAC<span style={{color:'var(--accent-cyan)'}}>·</span>OPS</div>
            <div className="mono small dim">Building Evacuation Simulation</div>
          </div>
        </div>

        <div className="login-tabs">
          <button className="login-tab on">เข้าสู่ระบบ</button>
          <Link to="/register" className="login-tab" style={{textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>สมัครสมาชิก</Link>
        </div>

        <form className="login-form" onSubmit={submit}>
          <div className="form-row">
            <label className="mono micro dim">อีเมล / รหัสเจ้าหน้าที่</label>
            <input
              className="input" type="email" required autoFocus
              placeholder="operator@evacops.local"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label className="mono micro dim">รหัสผ่าน</label>
            <input
              className="input" type="password" required minLength={8}
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="mono small" style={{color:'var(--accent-red)',marginBottom:8}}>⚠ {error}</div>
          )}

          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ →'}
          </button>

          <div className="login-foot mono micro dim">
            <span>API: <span className="accent-cyan">evacops.local</span></span>
            <span>·</span>
            <span>JWT 24h · TLS 1.3</span>
          </div>
        </form>
      </div>

      <div className="login-side">
        <div className="mono micro dim" style={{marginBottom: 8}}>SYSTEM STATUS</div>
        {[
          ['API gateway', 'OPERATIONAL', 'lime'],
          ['NetworkX engine', 'OPERATIONAL', 'lime'],
          ['TMD weather feed', 'OPERATIONAL', 'lime'],
        ].map(([n, s, t]) => (
          <div key={n} className="status-line">
            <span className={`status-dot dot-${t}`} />
            <span className="mono small">{n}</span>
            <span className="mono micro dim grow right">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
