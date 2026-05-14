/**
 * SimulationPage — evacuation simulation for a DB-backed building.
 *
 * New features (v2):
 *   - Algorithm toggle: Dijkstra / A* / Compare
 *   - Auto smoke propagation when fire incident is reported
 *   - Analysis tab (safety, connectivity, bottleneck, max-flow, experiments)
 *   - Max-flow: person count badge on exit nodes
 *   - Bottleneck highlight on BuildingMap
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

import BuildingMap    from '../components/BuildingMap';
import ControlPanel   from '../components/ControlPanel';
import ResultsTable   from '../components/ResultsTable';
import IncidentPanel  from '../components/IncidentPanel';
import AnalysisPanel  from '../components/AnalysisPanel';

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
  const [compareResult, setCompareResult] = useState(null);   // dedicated compare mode
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [weather,       setWeather]       = useState(null);
  const [selectedPath,  setSelectedPath]  = useState(null);
  const [clickedNode,   setClickedNode]   = useState(null);
  const [tab,           setTab]           = useState(TAB.results);
  const [algorithm,     setAlgorithm]     = useState('dijkstra'); // 'dijkstra' | 'astar' | 'compare'

  // Visual overlays from Analysis tab
  const [bottleneckEdges, setBottleneckEdges] = useState([]);
  const [maxflowBadges,   setMaxflowBadges]   = useState({});  // {exit_node: persons}

  // Smoke annotations from new model (per edge)
  const [smokeAnnotations, setSmokeAnnotations] = useState([]);

  // Fire spread simulation
  const [fireSpread, setFireSpread] = useState(null);   // API response
  const [fireTime,   setFireTime]   = useState(0);       // slider value (seconds)

  const loadGraph = useCallback(async () => {
    try {
      const [gRes, nRes] = await Promise.all([
        axios.get(`${API}/buildings/${buildingId}/graph`),
        axios.get(`${API}/buildings/${buildingId}/nodes`),
      ]);
      setGraph(gRes.data);
      setNodes(nRes.data);
    } catch { /* ignore network errors */ }
  }, [buildingId]);

  useEffect(() => {
    axios.get(`${API}/buildings/${buildingId}`).then(r => setBuilding(r.data)).catch(() => {});
    axios.get(`${API}/weather`).then(r => setWeather(r.data)).catch(() => {});
    loadGraph();
  }, [buildingId, loadGraph]);

  // ---------------------------------------------------------------------------
  // Evacuate
  // ---------------------------------------------------------------------------
  const runEvacuation = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    setCompareResult(null);

    const algo = algorithm === 'compare' ? 'dijkstra' : algorithm;

    try {
      if (algorithm === 'compare') {
        // Use dedicated compare endpoint
        const { data } = await axios.post(
          `${API}/buildings/${buildingId}/evacuate/compare`,
          {
            fire_location:         params.fire_location,
            crowd_densities:       (params.crowd_densities || []).map(cd => ({
              node_key: cd.node_id || cd.node_key, density: cd.density,
            })),
            use_weather_wind:      params.use_weather_wind,
            manual_wind_direction: params.manual_wind_direction,
            manual_wind_speed:     params.manual_wind_speed,
          }
        );
        setCompareResult(data);
        setSmokeAnnotations(data.smoke_annotations || []);
        setWeather(data.weather);
        setResult(null);
        setSelectedPath(null);
      } else {
        const { data } = await axios.post(
          `${API}/buildings/${buildingId}/evacuate`,
          { ...params, algorithm: algo, compare_algorithms: true }
        );
        setResult(data);
        setWeather(data.weather);
        setSelectedPath(null);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'API error');
    } finally {
      setLoading(false);
    }
  }, [buildingId, algorithm]);

  // ---------------------------------------------------------------------------
  // Auto smoke propagation when fire incident is reported
  // ---------------------------------------------------------------------------
  const handleIncidentChange = useCallback(async (newIncident) => {
    setResult(null);
    loadGraph();

    // Auto-propagate smoke if it's a fire incident
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

  // ---------------------------------------------------------------------------
  // Fire spread simulation
  // ---------------------------------------------------------------------------
  const runFireSpread = async () => {
    if (!fireNode) return;
    try {
      const { data } = await axios.post(`${API}/buildings/${buildingId}/fire/spread`, {
        fire_node: fireNode,
        use_weather_wind: true,
      });
      setFireSpread(data);
      setFireTime(0);
    } catch { /* ignore */ }
  };

  // ---------------------------------------------------------------------------
  // Derived display data
  // ---------------------------------------------------------------------------
  const activeResult   = result || (compareResult ? {
    fire_location:       compareResult.fire_location,
    primary_routes:      compareResult.comparison?.dijkstra || [],
    comparison:          compareResult.comparison,
    smoke_blocked_edges: (compareResult.smoke_annotations || [])
      .filter(a => a.blocked).map(a => [a.source, a.target]),
    graph_state:         compareResult.graph_state,
    weather:             compareResult.weather,
  } : null);

  const displayGraph  = activeResult?.graph_state || (graph ? { nodes: graph.nodes, edges: graph.edges } : null);
  const fireNode      = activeResult?.fire_location || null;
  const smokeEdges    = activeResult?.smoke_blocked_edges || [];
  const bestPath      = activeResult?.primary_routes?.find(r => r.reachable)?.path || null;

  const floors         = result?.floors || graph?.floors || [];
  const activeFloor    = floors.find(f => f.image_filename);
  const floorImageUrl  = activeFloor?.image_filename
    ? (activeFloor.image_filename.startsWith('http')
        ? activeFloor.image_filename
        : `${API}/uploads/${activeFloor.image_filename}`)
    : null;

  if (!building) return <div style={{ padding: 40, color: '#94a3b8' }}>กำลังโหลด...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
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

        {/* Algorithm toggle (Feature 1) */}
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

        {/* Fire spread button */}
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

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ControlPanel
          onEvacuate={runEvacuation}
          loading={loading}
          weather={weather}
          nodes={nodes}
        />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Map */}
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

          {/* Fire spread timeline slider */}
          {fireSpread && (
            <div style={{ background: '#1e293b', padding: '8px 16px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#f97316', fontSize: 12, fontWeight: 700 }}>🔥 ไฟลาม</span>
              <input type="range" min={0} max={Math.ceil(fireSpread.max_time)} value={fireTime}
                onChange={e => setFireTime(Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ color: '#f1f5f9', fontSize: 12, minWidth: 60 }}>{fireTime}s / {Math.ceil(fireSpread.max_time)}s</span>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                🔥 {fireSpread.nodes.filter(n => n.reach_time <= fireTime).length} nodes
              </span>
              <button onClick={() => setFireSpread(null)} style={{ background: '#334155', border: 'none', borderRadius: 4, color: '#94a3b8', padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          )}

          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: 0, borderBottom: '1px solid #334155',
            paddingLeft: 14, paddingTop: 8, background: '#0f172a',
          }}>
            <button style={tabStyle(tab === TAB.results)} onClick={() => setTab(TAB.results)}>
              📋 Results
            </button>
            <button style={tabStyle(tab === TAB.analysis)} onClick={() => setTab(TAB.analysis)}>
              📊 Analysis
            </button>
          </div>

          {/* Tab content */}
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
