import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getToken, logout, me, AuthUser } from '../api/client';

/**
 * Compact auth status pill — shows the logged-in email + a logout button,
 * or a "เข้าสู่ระบบ" link when anonymous. Sits in page headers.
 */
export default function AuthBar() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) { setUser(null); return; }
    me().then(setUser);
  }, []);

  if (!user) {
    return (
      <Link
        to="/login"
        style={{
          fontSize: 12, color: '#60a5fa', textDecoration: 'none',
          background: '#0f172a', padding: '4px 10px', borderRadius: 99,
          border: '1px solid #334155',
        }}
      >
        เข้าสู่ระบบ
      </Link>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontSize: 12, color: '#cbd5e1', background: '#0f172a',
          padding: '4px 10px', borderRadius: 99, border: '1px solid #334155',
        }}
        title={user.email}
      >
        👤 {user.email}
      </span>
      <button
        onClick={() => { logout(); setUser(null); navigate('/login'); }}
        style={{
          fontSize: 12, color: '#cbd5e1', background: '#334155',
          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
        }}
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
