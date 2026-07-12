import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getBuilding, listEdges, listFloors, listIncidents, listNodes } from '../api/client';
import FloorPlanCanvas from '../components/FloorPlanCanvas';
import ReportSheet from '../components/ReportSheet';
import RouteSheet from '../components/RouteSheet';
import { useBuildingEvents } from '../hooks/useBuildingEvents';
import { useUserRoute } from '../hooks/useUserRoute';

export default function FloorMap() {
  const { buildingId, floorNumber } = useParams<{ buildingId: string; floorNumber: string }>();
  const id = buildingId!;
  const floorNum = Number(floorNumber);

  const storageKey = `userRoom:${id}:${floorNum}`;
  const [userNodeKey, setUserNodeKeyRaw] = useState<string | null>(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storageKey) : null,
  );
  const setUserNodeKey = useCallback(
    (k: string | null) => {
      setUserNodeKeyRaw(k);
      try {
        if (k) sessionStorage.setItem(storageKey, k);
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* private mode */
      }
    },
    [storageKey],
  );

  const [reportOpen, setReportOpen] = useState(false);
  const [reportNodeKey, setReportNodeKey] = useState<string | null>(null);

  const [bldQ, floorsQ, nodesQ, edgesQ, incQ] = useQueries({
    queries: [
      { queryKey: ['building', id], queryFn: () => getBuilding(id) },
      { queryKey: ['floors', id], queryFn: () => listFloors(id) },
      { queryKey: ['nodes', id], queryFn: () => listNodes(id) },
      { queryKey: ['edges', id], queryFn: () => listEdges(id) },
      {
        queryKey: ['incidents', id],
        queryFn: () => listIncidents(id, true),
        refetchInterval: 7000,
        refetchIntervalInBackground: false,
      },
    ],
  });

  const routeQ = useUserRoute(id, userNodeKey);
  const qc = useQueryClient();

  // Live updates: an incident anywhere in the building should immediately
  // refresh both the incident list and the user's route. Polling at 7s
  // remains as a backstop in case the WebSocket can't connect.
  useBuildingEvents(id, (ev) => {
    if (ev.type === 'incident.created' || ev.type === 'incident.resolved') {
      qc.invalidateQueries({ queryKey: ['incidents', id] });
      qc.invalidateQueries({ queryKey: ['route', String(id)] });
    }
  });

  const allNodes = useMemo(() => nodesQ.data ?? [], [nodesQ.data]);
  // Prefer the uploaded floor record; fall back to a synthetic floor when the
  // building has nodes on this floor but no floor-plan image — the canvas
  // renders a schematic view from node coordinates in that case.
  const floor = useMemo(() => {
    const uploaded = floorsQ.data?.find((f) => f.floor_number === floorNum);
    if (uploaded) return uploaded;
    if (!allNodes.some((n) => n.floor_number === floorNum)) return undefined;
    return {
      id: -floorNum,
      building_id: Number(id),
      floor_number: floorNum,
      image_filename: null,
      image_width_px: 0,
      image_height_px: 0,
      scale_px_per_m: 6,
    };
  }, [floorsQ.data, allNodes, floorNum, id]);
  const allEdges = useMemo(() => edgesQ.data ?? [], [edgesQ.data]);
  const incidents = useMemo(() => incQ.data ?? [], [incQ.data]);

  const nodesById = useMemo(() => new Map(allNodes.map((n) => [n.node_key, n])), [allNodes]);
  const floorNodes = useMemo(() => allNodes.filter((n) => n.floor_number === floorNum), [allNodes, floorNum]);
  const floorNodeKeys = useMemo(() => new Set(floorNodes.map((n) => n.node_key)), [floorNodes]);
  const floorIncidents = useMemo(
    () => incidents.filter((i) => floorNodeKeys.has(i.node_key)),
    [incidents, floorNodeKeys],
  );
  const floorEdges = useMemo(
    () => allEdges.filter((e) => floorNodeKeys.has(e.u_key) && floorNodeKeys.has(e.v_key)),
    [allEdges, floorNodeKeys],
  );

  // Clear stale userNodeKey if it refers to a node that no longer exists or
  // is on a different floor.
  useEffect(() => {
    if (!nodesQ.data || !userNodeKey) return;
    const n = nodesById.get(userNodeKey);
    if (!n || n.floor_number !== floorNum) setUserNodeKey(null);
  }, [nodesQ.data, userNodeKey, floorNum, nodesById, setUserNodeKey]);

  const handleTapNode = (key: string) => {
    const n = nodesById.get(key);
    if (!n) return;
    // Only rooms (and exits, useful for "I'm at the exit") set the user location.
    if (n.type === 'room' || n.type === 'exit' || n.type === 'stair') {
      setUserNodeKey(key);
    }
  };

  const handleLongPress = (key: string) => {
    setReportNodeKey(key);
    setReportOpen(true);
  };

  const openReportForUser = () => {
    setReportNodeKey(userNodeKey);
    setReportOpen(true);
  };

  // The path the user should actually walk only includes nodes on this floor.
  // If the route crosses floors we trim to the first contiguous floor segment
  // and surface a "go to floor N via stair X" hint below.
  const routeOnFloor = useMemo(() => {
    if (!routeQ.data?.path) return undefined;
    const seg: string[] = [];
    for (const k of routeQ.data.path) {
      const n = nodesById.get(k);
      if (!n) { if (seg.length) break; continue; }
      if (n.floor_number === floorNum) seg.push(k);
      else if (seg.length) break;
    }
    return seg.length >= 2 ? seg : undefined;
  }, [routeQ.data, nodesById, floorNum]);

  const nextFloorHint = useMemo(() => {
    if (!routeQ.data?.path) return null;
    let crossing: { stair: string | null; target: number } | null = null;
    for (let i = 0; i < routeQ.data.path.length - 1; i++) {
      const a = nodesById.get(routeQ.data.path[i]);
      const b = nodesById.get(routeQ.data.path[i + 1]);
      if (!a || !b) continue;
      if (a.floor_number === floorNum && b.floor_number !== floorNum) {
        crossing = { stair: a.type === 'stair' ? a.node_key : b.type === 'stair' ? b.node_key : null, target: b.floor_number };
        break;
      }
    }
    return crossing;
  }, [routeQ.data, nodesById, floorNum]);

  if (floorsQ.isLoading || nodesQ.isLoading) {
    return <div className="screen"><header className="app-bar"><div className="app-bar-title">โหลด…</div></header></div>;
  }
  if (!floor) {
    return (
      <div className="screen">
        <header className="app-bar">
          <Link to={`/b/${id}`} className="app-bar-back">←</Link>
          <div className="app-bar-title">ไม่พบชั้น {floorNum}</div>
        </header>
      </div>
    );
  }

  const userNodeLabel = userNodeKey ? (nodesById.get(userNodeKey)?.label ?? userNodeKey) : null;

  return (
    <div className="screen map-screen">
      <header className="app-bar">
        <Link to={`/b/${id}`} className="app-bar-back" aria-label="กลับ">←</Link>
        <div className="app-bar-stack">
          <div className="app-bar-title small">{bldQ.data?.name ?? 'อาคาร'}</div>
          <div className="app-bar-sub">ชั้น {floor.floor_number}</div>
        </div>
        <div className="app-bar-right">
          <button
            className="icon-btn"
            onClick={() => { incQ.refetch(); routeQ.refetch(); }}
            aria-label="รีเฟรช"
            title="รีเฟรช"
          >
            ↻
          </button>
        </div>
      </header>

      <div className="map-wrap">
        <FloorPlanCanvas
          floor={floor}
          nodes={floorNodes}
          edges={floorEdges}
          incidents={floorIncidents}
          userNodeKey={userNodeKey}
          routePath={routeOnFloor}
          onTapNode={handleTapNode}
          onLongPressNode={handleLongPress}
        />

        {!userNodeKey && (
          <div className="map-hint">แตะห้องของคุณบนแผนผัง</div>
        )}

        {nextFloorHint && routeOnFloor && (
          <div className="map-cross-floor">
            → ไปต่อชั้น {nextFloorHint.target}
            {nextFloorHint.stair ? ` ผ่านบันได ${nextFloorHint.stair}` : ''}
          </div>
        )}

        <button
          className="fab"
          onClick={openReportForUser}
          aria-label="แจ้งเหตุ"
        >
          <span style={{ fontSize: 24 }}>⚠</span>
          <span>แจ้งเหตุ</span>
        </button>
      </div>

      <RouteSheet
        route={routeQ.data}
        loading={routeQ.isLoading && !!userNodeKey}
        error={!!routeQ.error}
        userNodeLabel={userNodeLabel}
        nodesById={nodesById}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        buildingId={id}
        defaultNodeKey={reportNodeKey ?? userNodeKey}
        nodesById={nodesById}
        floorNodes={floorNodes}
        onChangeNode={() => { /* user closes sheet and taps on map */ }}
      />
    </div>
  );
}
