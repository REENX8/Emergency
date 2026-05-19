/**
 * SimulationPage — EVAC·OPS hi-fi design, wired to real API.
 * Route: /buildings/:buildingId/simulate
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';

import { http } from '../api/client';
import FloorPlan from '../js/FloorPlan';
import { ControlPanel, ResultsPanel, StatusStrip } from '../js/Panels';
import { SimTopBar, Legend } from '../js/TopBar';
import {
  propagateSmoke,
  computeFireSpread,
  planEvacuation,
  safetyScore,
} from '../js/sim';
import '../styles.css';

export default function SimulationPage() {
  const { buildingId } = useParams();

  /* ── Remote data ─────────────────────────────────────────────── */
  const [building,  setBuilding]  = useState(null);
  const [nodes,     setNodes]     = useState([]);
  const [edges,     setEdges]     = useState([]);
  const [weather,   setWeather]   = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);

  /* ── Scenario state ──────────────────────────────────────────── */
  const [fireLocation,  setFireLocation]  = useState('');
  const [algorithm,     setAlgorithm]     = useState('compare');
  const [blockedExits,  setBlockedExits]  = useState([]);
  const [crowd,         setCrowd]         = useState({});
  const [occupied,      setOccupied]      = useState([]);
  const [useWeather,    setUseWeather]    = useState(true);
  const [manualWind,    setManualWind]    = useState({ deg: 135, ms: 3.5 });

  /* ── Timeline ────────────────────────────────────────────────── */
  const [fireTime,  setFireTime]  = useState(0);
  const [playing,   setPlaying]   = useState(false);

  /* ── Error state ─────────────────────────────────────────────── */
  const [loadError,    setLoadError]    = useState(null);

  /* ── UI state ────────────────────────────────────────────────── */
  const [tab,          setTab]          = useState('results');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [clickedNode,  setClickedNode]  = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState({
    safety: true, connectivity: true, bottleneck: false, maxflow: false,
  });
  const [showBottleneck, setShowBottleneck] = useState(false);

  const rafRef = useRef(null);
  const lastTickRef = useRef(0);

  /* ── Load building data ──────────────────────────────────────── */
  useEffect(() => {
    if (!buildingId) return;
    setLoading(true);

    Promise.all([
      http.get(`/buildings/${buildingId}`),
      http.get(`/buildings/${buildingId}/nodes`, { params: { limit: 500 } }),
      http.get(`/buildings/${buildingId}/edges`),
      http.get('/weather').catch(() => ({ data: null })),
      http.get(`/buildings/${buildingId}/incidents`, { params: { limit: 200 } })
          .catch(() => ({ data: { items: [] } })),
    ]).then(([bRes, nRes, eRes, wRes, iRes]) => {
      setBuilding(bRes.data);

      // Normalize nodes: backend uses node_key, design uses id
      const rawNodes = nRes.data?.items ?? nRes.data ?? [];
      const normalized = rawNodes.map(n => ({
        id: n.node_key || n.id,
        type: n.type,
        label: n.label || n.node_key || n.id,
        x: n.x || 0,
        y: n.y || 0,
        floor: n.floor_number || n.floor || 1,
        cap: n.capacity || n.cap || 0,
        capacity: n.capacity || n.cap || 0,
      }));
      setNodes(normalized);

      // Normalize edges: backend uses u_key/v_key, design uses u/v
      const rawEdges = eRes.data || [];
      const normEdges = rawEdges.map(e => ({
        u: e.u_key || e.u,
        v: e.v_key || e.v,
        distance_m: e.distance_m || 10,
        width_m: e.width_m || 2,
        is_stair: e.is_stair || false,
      }));
      setEdges(normEdges);

      if (wRes.data) setWeather(wRes.data);
      setIncidents(iRes.data?.items ?? iRes.data ?? []);

      // Set defaults
      const rooms = normalized.filter(n => n.type === 'room');
      const firstRoom = rooms[0]?.id || normalized[0]?.id || '';
      setFireLocation(firstRoom);
      setOccupied(rooms.map(n => n.id));
      const corridors = normalized.filter(n => n.type === 'corridor');
      if (corridors.length > 0) {
        const defaultCrowd = {};
        corridors.forEach(c => { defaultCrowd[c.id] = 0; });
        if (corridors[1]) defaultCrowd[corridors[1].id] = 0.3;
        setCrowd(defaultCrowd);
      }
    }).catch(err => {
      console.error('Failed to load building data:', err);
      setLoadError(
        err?.response?.data?.detail
        || err?.message
        || 'Failed to load building data. Please refresh the page.'
      );
    }).finally(() => {
      setLoading(false);
    });
  }, [buildingId]);

  /* ── Derived data ────────────────────────────────────────────── */
  const wind = useWeather && weather
    ? { deg: weather.wind_direction_deg, ms: weather.wind_speed_ms }
    : manualWind;

  const smoke = useMemo(
    () => propagateSmoke(nodes, edges, fireLocation, wind.deg),
    [nodes, edges, fireLocation, wind.deg]);

  const fireSpread = useMemo(
    () => computeFireSpread(nodes, edges, fireLocation, wind.deg, wind.ms),
    [nodes, edges, fireLocation, wind.deg, wind.ms]);

  const routes_dij = useMemo(
    () => planEvacuation(nodes, edges, {
      fire_location: fireLocation, occupied_rooms: occupied,
      blocked_exits: blockedExits, crowd, smoke, algorithm: 'dijkstra',
    }),
    [nodes, edges, fireLocation, occupied, blockedExits, crowd, smoke]);

  const routes_astar = useMemo(
    () => planEvacuation(nodes, edges, {
      fire_location: fireLocation, occupied_rooms: occupied,
      blocked_exits: blockedExits, crowd, smoke, algorithm: 'astar',
    }),
    [nodes, edges, fireLocation, occupied, blockedExits, crowd, smoke]);

  const activeRoutes  = algorithm === 'astar' ? routes_astar : routes_dij;
  const compareAstar  = algorithm === 'compare' ? routes_astar : null;

  const bestPath = useMemo(() => {
    const reachable = activeRoutes.filter(r => r.reachable);
    if (!reachable.length) return null;
    return reachable.reduce((a, b) => (a.time_s < b.time_s ? a : b)).path;
  }, [activeRoutes]);

  const comparePath = useMemo(() => {
    if (!compareAstar) return null;
    const reachable = compareAstar.filter(r => r.reachable);
    if (!reachable.length) return null;
    return reachable.reduce((a, b) => (a.time_s < b.time_s ? a : b)).path;
  }, [compareAstar]);

  const safety = useMemo(() => safetyScore(nodes, edges), [nodes, edges]);
  const bottlenecks = useMemo(() => {
    const exits = nodes.filter(n => n.type === 'exit').map(n => n.id);
    const stairs = nodes.filter(n => n.type === 'stair').map(n => n.id);
    // Stair→exit connections are common single points of failure
    return exits.flatMap(exit =>
      edges
        .filter(e => (e.u === exit && stairs.includes(e.v)) || (e.v === exit && stairs.includes(e.u)))
        .map(e => [e.u === exit ? e.v : e.u, exit])
    ).slice(0, 4);
  }, [nodes, edges]);

  const maxflowBadges = analysisOpen.maxflow
    ? Object.fromEntries(nodes.filter(n => n.type === 'exit').map((n, i) => [n.id, 24 + i * 12]))
    : {};

  /* ── Fire timeline auto-play ─────────────────────────────────── */
  useEffect(() => {
    if (!playing || !fireSpread) return;
    const max = Math.ceil(fireSpread.max_time);
    lastTickRef.current = performance.now();
    const tick = (now) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setFireTime(prev => {
        const next = prev + dt * 5;
        if (next >= max) { setPlaying(false); return max; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, fireSpread]);

  useEffect(() => { setFireTime(0); setPlaying(false); }, [fireLocation]);

  /* ── Stats ───────────────────────────────────────────────────── */
  const totalEvac   = activeRoutes.filter(r => r.reachable).reduce((s, r) => s + r.time_s, 0);
  const avgEvac     = totalEvac / Math.max(1, activeRoutes.filter(r => r.reachable).length);
  const unreachable = activeRoutes.filter(r => !r.reachable).length;
  const slowest     = activeRoutes.filter(r => r.reachable).reduce((a, b) => (a.time_s > b.time_s ? a : b), { time_s: 0 });

  if (loading) {
    return (
      <div className="sim-screen" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div className="mono small dim">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="sim-screen">
      {loadError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#c0392b', color: '#fff',
          padding: '10px 16px', fontSize: '13px', fontFamily: 'monospace',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>⚠ {loadError}</span>
          <button
            onClick={() => setLoadError(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px' }}
          >✕</button>
        </div>
      )}
      <SimTopBar
        building={building}
        algorithm={algorithm}
        setAlgorithm={setAlgorithm}
        weather={weather}
        useWeather={useWeather}
      />

      <div className="sim-body">
        <ControlPanel
          nodes={nodes}
          fireLocation={fireLocation} setFireLocation={setFireLocation}
          blockedExits={blockedExits} setBlockedExits={setBlockedExits}
          crowd={crowd} setCrowd={setCrowd}
          occupied={occupied} setOccupied={setOccupied}
          useWeather={useWeather} setUseWeather={setUseWeather}
          manualWind={manualWind} setManualWind={setManualWind}
          weather={weather}
        />

        <div className="sim-center">
          <div className="map-wrap">
            <div className="map-corner top-left">
              <span className="mono small dim">VIEW</span>
              <span className="mono small">FLAT · {[...new Set(nodes.map(n => n.floor))].length}F</span>
              <span className="mono small dim">·</span>
              <span className="mono small">SCALE 1:240</span>
            </div>
            <div className="map-corner top-right">
              <Legend smokeOn={Object.values(smoke).some(v => v > 0.05)} />
            </div>

            <FloorPlan
              nodes={nodes} edges={edges}
              fireNode={fireLocation} smoke={smoke}
              fireSpread={fireSpread} fireTime={fireTime}
              selectedPath={selectedRoute?.path} bestPath={bestPath}
              comparePath={comparePath}
              bottleneckEdges={showBottleneck ? bottlenecks : []}
              maxflowBadges={maxflowBadges}
              highlightedNode={clickedNode}
              onNodeClick={setClickedNode}
              formulaOverlay={false}
            />

            <StatusStrip
              fireSpread={fireSpread} fireTime={fireTime} playing={playing}
              setPlaying={setPlaying} setFireTime={setFireTime}
              wind={wind} smoke={smoke}
            />
          </div>

          <ResultsPanel
            tab={tab} setTab={setTab}
            routes={activeRoutes} compareRoutes={compareAstar}
            algorithm={algorithm}
            selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute}
            safety={safety}
            bottlenecks={bottlenecks}
            showBottleneck={showBottleneck} setShowBottleneck={setShowBottleneck}
            maxflowBadges={maxflowBadges}
            analysisOpen={analysisOpen} setAnalysisOpen={setAnalysisOpen}
            stats={{ totalEvac, avgEvac, unreachable, slowest }}
            clickedNode={clickedNode}
            incidents={incidents}
          />
        </div>
      </div>
    </div>
  );
}
