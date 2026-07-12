import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { getBuilding, listFloors, listIncidents, listNodes } from '../api/client';

export default function FloorPicker() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const id = buildingId!;

  const results = useQueries({
    queries: [
      { queryKey: ['building', id], queryFn: () => getBuilding(id) },
      { queryKey: ['floors', id], queryFn: () => listFloors(id) },
      { queryKey: ['nodes', id], queryFn: () => listNodes(id) },
      {
        queryKey: ['incidents', id],
        queryFn: () => listIncidents(id, true),
        refetchInterval: 7000,
        refetchIntervalInBackground: false,
      },
    ],
  });

  const [bldQ, floorsQ, nodesQ, incQ] = results;
  const isLoading = results.some((r) => r.isLoading);

  // Count incidents per floor by looking up each incident's node_key.
  const floorIncidentCount = new Map<number, number>();
  if (incQ.data && nodesQ.data) {
    const nodeFloor = new Map(nodesQ.data.map((n) => [n.node_key, n.floor_number]));
    for (const inc of incQ.data) {
      const f = nodeFloor.get(inc.node_key);
      if (f != null) floorIncidentCount.set(f, (floorIncidentCount.get(f) ?? 0) + 1);
    }
  }

  // A building is usable without uploaded floor-plan images: any floor that
  // has nodes gets a tile (the map falls back to a schematic view). Uploaded
  // floors and node-derived floors are merged.
  const floorNumbers = new Set<number>();
  floorsQ.data?.forEach((f) => floorNumbers.add(f.floor_number));
  nodesQ.data?.forEach((n) => floorNumbers.add(n.floor_number));
  const floorList = [...floorNumbers].sort((a, b) => a - b);

  return (
    <div className="screen">
      <header className="app-bar">
        <Link to="/" className="app-bar-back" aria-label="กลับ">←</Link>
        <div>
          <div className="app-bar-title">{bldQ.data?.name ?? 'อาคาร'}</div>
          <div className="app-bar-sub">เลือกชั้นที่คุณอยู่</div>
        </div>
      </header>

      <main className="screen-body">
        {isLoading && <div className="state-msg">กำลังโหลด…</div>}
        {!isLoading && floorList.length === 0 && (
          <div className="state-msg">ยังไม่มีข้อมูลชั้นในอาคารนี้</div>
        )}
        {floorList.length > 0 && (
          <div className="floor-grid">
            {floorList.map((floorNumber) => {
              const count = floorIncidentCount.get(floorNumber) ?? 0;
              return (
                <Link
                  key={floorNumber}
                  to={`/b/${id}/f/${floorNumber}`}
                  className={`floor-tile ${count > 0 ? 'has-incident' : ''}`}
                >
                  <div className="floor-tile-label">ชั้น</div>
                  <div className="floor-tile-num">{floorNumber}</div>
                  {count > 0 && (
                    <div className="floor-tile-badge">
                      <span className="badge-dot" /> {count} จุดมีปัญหา
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
