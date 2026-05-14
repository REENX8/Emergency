import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import ControlPanel from './components/ControlPanel';
import BuildingMap from './components/BuildingMap';
import ResultsTable from './components/ResultsTable';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function App() {
  const [building, setBuilding] = useState(null);     // base graph for initial render
  const [result, setResult] = useState(null);         // /evacuate response
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [weather, setWeather] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);

  // Load base building graph and weather on mount
  useEffect(() => {
    axios.get(`${API}/building`).then(r => setBuilding(r.data.graph)).catch(() => {});
    axios.get(`${API}/weather`).then(r => setWeather(r.data)).catch(() => {});
  }, []);

  const runEvacuation = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/evacuate`, params);
      setResult(data);
      setWeather(data.weather);
      setSelectedPath(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'API error');
    } finally {
      setLoading(false);
    }
  }, []);

  // The displayed graph: use simulation state if available, else base building
  const displayGraph = result?.graph_state || building;
  const fireNode = result?.fire_location || null;
  const smokeEdges = result?.smoke_blocked_edges || [];

  // Best reachable route path (highlighted green)
  const bestPath = result?.primary_routes?.find(r => r.reachable)?.path || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
          🚨 Building Evacuation Simulation
        </span>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Graph-based · Dijkstra / A* · Dynamic smoke &amp; crowd · TMD Weather
        </span>
        {error && (
          <span style={{ marginLeft: 'auto', color: '#f87171', fontSize: 13, background: '#450a0a', padding: '4px 10px', borderRadius: 6 }}>
            ⚠ {error}
          </span>
        )}
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ControlPanel onEvacuate={runEvacuation} loading={loading} weather={weather} />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <BuildingMap
            elements={displayGraph}
            fireNode={fireNode}
            smokeEdges={smokeEdges}
            selectedPath={selectedPath}
            bestPath={bestPath}
          />
          <ResultsTable result={result} onSelectPath={setSelectedPath} />
        </div>
      </div>
    </div>
  );
}
