/**
 * SimulationPage — evacuation simulation for a DB-backed building.
 * Replaces the old single-building App.jsx flow for multi-building use.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

import BuildingMap    from '../components/BuildingMap';
import ControlPanel   from '../components/ControlPanel';
import ResultsTable   from '../components/ResultsTable';
import IncidentPanel  from '../components/IncidentPanel';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function SimulationPage() {
  const { buildingId } = useParams();
  const navigate = useNavigate();

  const [building, setBuilding]   = useState(null);
  const [graph, setGraph]         = useState(null);   // {nodes, edges, floors}
  const [nodes, setNodes]         = useState([]);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [weather, setWeather]     = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [clickedNode, setClickedNode]   = useState(null); // for quick incident report

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
    try {
      const { data } = await axios.post(`${API}/buildings/${buildingId}/evacuate`, params);
      setResult(data);
      setWeather(data.weather);
      setSelectedPath(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'API error');
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  const displayGraph = result?.graph_state || (graph ? { nodes: graph.nodes, edges: graph.edges } : null);
  const fireNode     = result?.fire_location || null;
  const smokeEdges   = result?.smoke_blocked_edges || [];
  const bestPath     = result?.primary_routes?.find(r => r.reachable)?.path || null;

  // Active incidents affect node colours — reload graph after reporting
  const handleIncidentChange = () => {
    setResult(null);
    loadGraph();
  };

  // Floor images (use first floor with an image, or show by floor)
  const floors = result?.floors || graph?.floors || [];
  const activeFloorData = floors.find(f => f.image_filename);
  const floorImageUrl = activeFloorData?.image_filename
    ? `${API}/uploads/${activeFloorData.image_filename}`
    : null;

  if (!building) return <div style={{ padding: 40, color: '#94a3b8' }}>กำลังโหลด...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button onClick={() => navigate('/')} style={{
          background: '#334155', border: 'none', borderRadius: 6,
          padding: '5px 12px', color: '#cbd5e1', cursor: 'pointer', fontSize: 13,
        }}>← กลับ</button>

        <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
          🚨 {building.name}
        </span>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Dijkstra / A* · Dynamic smoke &amp; crowd · TMD Weather
        </span>
        <button onClick={() => navigate(`/buildings/${buildingId}/edit`)} style={{
          marginLeft: 'auto', background: '#334155', border: 'none', borderRadius: 6,
          padding: '5px 12px', color: '#cbd5e1', cursor: 'pointer', fontSize: 13,
        }}>✏️ แก้ไขแปลน</button>

        {error && (
          <span style={{ color: '#f87171', fontSize: 13, background: '#450a0a', padding: '4px 10px', borderRadius: 6 }}>
            ⚠ {error}
          </span>
        )}
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
          <BuildingMap
            elements={displayGraph}
            fireNode={fireNode}
            smokeEdges={smokeEdges}
            selectedPath={selectedPath}
            bestPath={bestPath}
            floorImageUrl={floorImageUrl}
            onNodeClick={(nodeId) => setClickedNode(nodeId)}
          />
          <ResultsTable result={result} onSelectPath={setSelectedPath} />
          <IncidentPanel
            buildingId={Number(buildingId)}
            nodes={nodes}
            preselectedNode={clickedNode}
            onIncidentChange={handleIncidentChange}
          />
        </div>
      </div>
    </div>
  );
}
