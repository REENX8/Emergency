import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { getToken, me, AuthUser } from '../api/client';

interface Props {
  children: React.ReactElement;
}

/**
 * Route guard for write-capable pages. Reads the bearer token from
 * localStorage; if missing or invalid, redirects to /login while remembering
 * the originally requested path.
 */
export default function RequireAuth({ children }: Props) {
  const location = useLocation();
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) { setChecked(true); return; }
    me().then((u) => { setUser(u); setChecked(true); });
  }, []);

  if (!checked) {
    return (
      <div style={{ padding: 40, color: '#94a3b8', background: '#0f172a', minHeight: '100vh' }}>
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
