/**
 * SimulationPage — evacuation simulation for a DB-backed building.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

import BuildingMap     from '../components/BuildingMap';
import ControlPanel    from '../components/ControlPanel';
import ResultsTable    from '../components/ResultsTable';
import IncidentPanel   from '../components/IncidentPanel';
import AnalysisPanel   from '../components/AnalysisPanel';
import BuildingSelector from '../components/BuildingSelector';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const TAB = { results: 'results', analysis: 'analysis' };

const tabStyle = (active) => ({
  padding: '6px 16px', borderRadius: '6px 6px 0 0', border: 'none',
  cursor: 'pointer', fontWeight: 600, fontSize: 13,
  background: active ? '#1e293b' : 'transparent',
  color: active ? '#f1f5f9' : '#64748b',
  borderBottom: active ? 'none' : '1px solid #334155',
});

export default function SimulationPage() {
  const { buildingId } = useParams();
  const navigate       = useNavigate();

  const [building,      setBuilding]      = useState(null);
  const [graph,         setGraph]         = useState(null);
  const [nodes,         setNodes]         = useState([]);
  const [result,        setResult]        = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [weather,       setWeather]       = useState(null);
  const [selectedPath,  setSelectedPath]  = useState(null);
  const [clickedNode,   setClickedNode]   = useState(null);
  const [tab,           setTab]           = useState(TAB.results);
  const [algorithm,     setAlgorithm]     = useState('dijkstra');

  const [bottleneckEdges, setBottleneckEdges] = useState([]);
  const [maxflowBadges,   setMaxflowBadges]   = useState({});
  const [smokeAnnotations, setSmokeAnnotations] = useState([]);
  const [fireSpread, setFireSpread] = useState(null);
  const [fireTime,   setFireTime]   = useState(0);
  const [firePlaying, setFirePlaying] = useState(false);
  const [lastApiMs,  setLastApiMs]   = useState(null);
  const rafRef = useRef(null);
  const lastTickRef = useRef(0);

  const loadGraph = useCallback(async () => {
    try {
      const [gRes, nRes] = await Promise.all([
        axios.get(`${API}/buildings/${buildingId}/graph`),
        axios.get(`${API}/buildings/${buildingId}/nodes`),
      ]);
      setGraph(gRes.data);
      setNodes(nRes.data);
    } catch { /* ignore */ }
  }, [buildingId]);

  useEffect(() => {
    axios.get(`${API}/buildings/${buildingId}`).then(r => setBuilding(r.data)).catch(() => {});
    axios.get(`${API}/weather`).then(r => setWeather(r.data)).catch(() => {});
    loadGraph();
  }, [buildingId, loadGraph]);

  const runEvacuation = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    setCompareResult(null);
    const algo = algorithm === 'compare' ? 'dijkstra' : algorithm;
    try {
      let resp;
      if (algorithm === 'compare') {
        resp = await axios.post(
          `${API}/buildings/${buildingId}/evacuate/compare`,
          {
            fire_location:         params.fire_location,
            crowd_densities:       params.crowd_densities || [],
            use_weather_wind:      params.use_weather_wind,
            manual_wind_direction: params.manual_wind_direction,
            manual_wind_speed:     params.manual_wind_speed,
          }
        );
        setCompareResult(resp.data);
        setSmokeAnnotations(resp.data.smoke_annotations || []);
        setWeather(resp.data.weather);
        setResult(null);
        setSelectedPath(null);
      } else {
        resp = await axios.post(
          `${API}/buildings/${buildingId}/evacuate`,
          { ...params, algorithm: algo, compare_algorithms: true }
        );
        setResult(resp.data);
        setWeather(resp.data.weather);
        setSelectedPath(null);
      }
      const ms = resp.headers?.['x-process-time-ms'];
      if (ms != null) setLastApiMs(Number(ms));
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'API error');
    } finally {
      setLoading(false);
    }
  }, [buildingId, algorithm]);

  const handleIncidentChange = useCallback(async (newIncident) => {
    setResult(null);
    loadGraph();
    if (newIncident?.incident_type === 'fire') {
      try {
        const { data } = await axios.post(
          `${API}/buildings/${buildingId}/smoke/propagate`,
          { fire_node: newIncident.node_key, use_weather_wind: true }
        );
        setSmokeAnnotations(data.smoke_annotations || []);
      } catch { /* ignore */ }
    }
  }, [buildingId, loadGraph]);

  const runFireSpread = async () => {
    if (!fireNode) return;
    try {
      const { data } = await axios.post(`${API}/buildings/${buildingId}/fire/spread`, {
        fire_node: fireNode,
        use_weather_wind: true,
      });
      setFireSpread(data);
      setFireTime(0);
      setFirePlaying(false);
    } catch { /* ignore */ }
  };

  // Auto-play fire-spread timeline via requestAnimationFrame.
  // Advances ~5 simulated seconds per real second; stops at max_time.
  useEffect(() => {
    if (!firePlaying || !fireSpread) return;
    const max = Math.ceil(fireSpread.max_time);
    const SIM_SECONDS_PER_REAL_SECOND = 5;
    lastTickRef.current = performance.now();
    const step = (now) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setFireTime(prev => {
        const next = prev + dt * SIM_SECONDS_PER_REAL_SECOND;
        if (next >= max) {
          setFirePlaying(false);
          return max;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [firePlaying, fireSpread]);

  const activeResult = result || (compareResult ? {
    fire_location:       compareResult.fire_location,
    primary_routes:      compareResult.comparison?.dijkstra || [],
    comparison:          compareResult.comparison,
    smoke_blocked_edges: (compareResult.smoke_annotations || [])
      .filter(a => a.blocked).map(a => [a.source, a.target]),
    graph_state:         compareResult.graph_state,
    weather:             compareResult.weather,
  } : null);

  const displayGraph = activeResult?.graph_state || (graph ? { nodes: graph.nodes, edges: graph.edges } : null);
  const fireNode     = activeResult?.fire_location || null;
  const smokeEdges   = activeResult?.smoke_blocked_edges || [];
  const bestPath     = activeResult?.primary_routes?.find(r => r.reachable)?.path || null;

  const floors        = result?.floors || graph?.floors || [];
  const activeFloor   = floors.find(f => f.image_filename);
  const floorImageUrl = activeFloor?.image_filename
    ? (activeFloor.image_filename.startsWith('http')
        ? activeFloor.image_filename
        : `${API}/uploads/${activeFloor.image_filename}`)
    : null;

  if (!building) return <div style={{ padding: 40, color: '#94a3b8' }}>กำลังโหลด...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <button onClick={() => navigate('/')} style={{
          background: '#334155', border: 'none', borderRadius: 6,
          padding: '5px 12px', color: '#cbd5e1', cursor: 'pointer', fontSize: 13,
        }}>← กลับ</button>

        <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
          🚨 {building.name}
        </span>

        <BuildingSelector currentId={buildingId} />

        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {['dijkstra', 'astar', 'compare'].map(a => (
            <button key={a} onClick={() => setAlgorithm(a)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: algorithm === a ? '#3b82f6' : '#334155',
              color: '#fff',
            }}>
              {a === 'dijkstra' ? 'Dijkstra' : a === 'astar' ? 'A*' : 'Compare'}
            </button>
          ))}
        </div>

        <button onClick={runFireSpread} disabled={!fireNode} style={{
          padding: '4px 12px', borderRadius: 6, border: 'none', cursor: fireNode ? 'pointer' : 'not-allowed',
          fontWeight: 600, fontSize: 12,
          background: fireNode ? '#b45309' : '#334155',
          color: '#fff', opacity: fireNode ? 1 : 0.5,
        }}>🔥 ลามไฟ</button>

        {weather && (
          <span style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>
            💨 {weather.wind_speed_ms} m/s · {weather.wind_direction_deg}°
          </span>
        )}

        {lastApiMs != null && (
          <span
            title="เวลาประมวลผลล่าสุดของ backend"
            style={{
              fontSize: 11, color: lastApiMs > 500 ? '#fbbf24' : '#64748b',
              background: '#0f172a', padding: '2px 8px', borderRadius: 99,
              border: '1px solid #334155',
            }}
          >
            ⏱ {lastApiMs.toFixed(0)}ms
          </span>
        )}

        {error && (
          <span style={{ color: '#f87171', fontSize: 13, background: '#450a0a',
            padding: '4px 10px', borderRadius: 6, marginLeft: 'auto' }}>
            ⚠ {error}
          </span>
        )}

        <button onClick={() => navigate(`/buildings/${buildingId}/edit`)} style={{
          marginLeft: error ? 0 : 'auto',
          background: '#334155', border: 'none', borderRadius: 6,
          padding: '5px 12px', color: '#cbd5e1', cursor: 'pointer', fontSize: 13,
        }}>✏️ แก้ไขแปลน</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ControlPanel onEvacuate={runEvacuation} loading={loading} weather={weather} nodes={nodes} />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <BuildingMap
            elements={displayGraph}
            fireNode={fireNode}
            smokeEdges={smokeEdges}
            selectedPath={selectedPath}
            bestPath={bestPath}
            floorImageUrl={floorImageUrl}
            onNodeClick={(nodeId) => setClickedNode(nodeId)}
            smokeAnnotations={smokeAnnotations}
            bottleneckEdges={bottleneckEdges}
            maxflowBadges={maxflowBadges}
            compareResult={algorithm === 'compare' ? compareResult?.comparison : null}
            fireSpreadNodes={fireSpread ? fireSpread.nodes.filter(n => n.reach_time <= fireTime).map(n => n.node) : []}
            fireSpreadData={fireSpread?.nodes || []}
            fireSpreadTime={fireTime}
          />

          {fireSpread && (
            <div style={{ background: '#1e293b', padding: '8px 16px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#f97316', fontSize: 12, fontWeight: 700 }}>🔥 ไฟลาม</span>
              <button
                onClick={() => {
                  if (fireTime >= Math.ceil(fireSpread.max_time)) setFireTime(0);
                  setFirePlaying(p => !p);
                }}
                style={{
                  background: firePlaying ? '#b45309' : '#16a34a', border: 'none',
                  borderRadius: 4, color: '#fff', padding: '3px 10px',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                }}
                title="เล่นไทม์ไลน์ไฟลาม"
              >
                {firePlaying ? '⏸ หยุด' : '▶ เล่น'}
              </button>
              <input type="range" min={0} max={Math.ceil(fireSpread.max_time)} step={0.1} value={fireTime}
                onChange={e => { setFirePlaying(false); setFireTime(Number(e.target.value)); }}
                style={{ flex: 1 }} />
              <span style={{ color: '#f1f5f9', fontSize: 12, minWidth: 80 }}>
                {fireTime.toFixed(1)}s / {Math.ceil(fireSpread.max_time)}s
              </span>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                🔥 {fireSpread.nodes.filter(n => n.reach_time <= fireTime).length} จุด
              </span>
              <button onClick={() => { setFireSpread(null); setFirePlaying(false); }} style={{ background: '#334155', border: 'none', borderRadius: 4, color: '#94a3b8', padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          )}

          <div style={{
            display: 'flex', gap: 0, borderBottom: '1px solid #334155',
            paddingLeft: 14, paddingTop: 8, background: '#0f172a',
          }}>
            <button style={tabStyle(tab === TAB.results)} onClick={() => setTab(TAB.results)}>
              📋 ผลลัพธ์
            </button>
            <button style={tabStyle(tab === TAB.analysis)} onClick={() => setTab(TAB.analysis)}>
              📊 วิเคราะห์
            </button>
          </div>

          {tab === TAB.results && (
            <>
              <ResultsTable result={activeResult} onSelectPath={setSelectedPath} />
              <IncidentPanel
                buildingId={Number(buildingId)}
                nodes={nodes}
                preselectedNode={clickedNode}
                onIncidentChange={handleIncidentChange}
              />
            </>
          )}

          {tab === TAB.analysis && (
            <AnalysisPanel
              buildingId={Number(buildingId)}
              nodes={nodes}
              fireLocation={fireNode || (nodes[0]?.node_key) || ''}
              onHighlightBottlenecks={setBottleneckEdges}
              onShowMaxflowBadges={setMaxflowBadges}
            />
          )}
        </div>
      </div>
    </div>
  );
}
