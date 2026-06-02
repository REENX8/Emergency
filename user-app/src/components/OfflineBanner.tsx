import { useEffect, useState } from 'react';
import { t } from '../i18n';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#c0392b',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {t('offline.banner')}
    </div>
  );
}
