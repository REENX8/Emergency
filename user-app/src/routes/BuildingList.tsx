import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { listBuildings } from '../api/client';
import type { Building } from '../api/types';

export default function BuildingList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['buildings'],
    queryFn: listBuildings,
  });

  return (
    <div className="screen">
      <header className="app-bar">
        <div className="app-bar-title">EVAC</div>
        <div className="app-bar-sub">เลือกอาคารของคุณ</div>
      </header>

      <main className="screen-body">
        {isLoading && <div className="state-msg">กำลังโหลด…</div>}
        {error && <div className="state-msg state-err">โหลดรายการอาคารไม่สำเร็จ</div>}
        {data && data.length === 0 && (
          <div className="state-msg">ยังไม่มีอาคารในระบบ — ติดต่อเจ้าหน้าที่</div>
        )}
        {data && data.length > 0 && (
          <div className="building-list">
            {data.map((b: Building) => (
              <Link key={b.id} to={`/b/${b.id}`} className="building-card">
                <div className="building-card-name">{b.name}</div>
                {b.address && <div className="building-card-addr">{b.address}</div>}
                <div className="building-card-cta">เลือกชั้น →</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
