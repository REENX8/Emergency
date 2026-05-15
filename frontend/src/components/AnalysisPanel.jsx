/**
 * AnalysisPanel — Graph analysis display:
 *   - Safety score (big number with grade and colour)
 *   - Connectivity status + unreachable nodes
 *   - Bottleneck (bridge) edges with highlight toggle
 *   - Max-flow distribution per exit
 *   - Experiment export button
 */
import React, { useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const GRADE_COLOR = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

const s = {
  container: {
    background: '#1e293b', borderTop: '1px solid #334155',
    padding: 14, overflowY: 'auto', maxHeight: 320,
  },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' },
  card: {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
    padding: 12, flex: 1, minWidth: 140,
  },
  label: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  val:   { fontSize: 22, fontWeight: 800 },
  sub:   { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  btn:   (bg = '#334155') => ({
    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: 12, background: bg, color: '#fff', whiteSpace: 'nowrap',
  }),
  chip: (ok) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 99,
    fontSize: 11, fontWeight: 600,
    background: ok ? '#14532d' : '#450a0a',
    color: ok ? '#22c55e' : '#f87171',
    marginLeft: 6,
  }),
  bridgeRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 8px', background: '#0f172a', borderRadius: 4, marginBottom: 3, fontSize: 12,
  },
  flowBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 99,
    fontSize: 11, background: '#1d4ed8', color: '#fff', marginLeft: 6,
  },
};

export default function AnalysisPanel({
  buildingId,
  nodes = [],
  fireLocation = '',
  onHighlightBottlenecks,    // (edges: [[u,v], ...]) => void
  onShowMaxflowBadges,       // (flowPerExit: {exit: persons}) => void
}) {
  const [safety,       setSafety]       = useState(null);
  const [connectivity, setConnectivity] = useState(null);
  const [bottleneck,   setBottleneck]   = useState(null);
  const [maxflow,      setMaxflow]      = useState(null);
  const [loading,      setLoading]      = useState('');
  const [error,        setError]        = useState(null);
  const [highlighted,  setHighlighted]  = useState(false);

  const call = async (fn, key) => {
    setLoading(key);
    setError(null);
    try { await fn(); } catch (e) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(''); }
  };

  const loadSafety = () => call(async () => {
    const r = await axios.get(`${API}/buildings/${buildingId}/analysis/safety`);
    setSafety(r.data);
  }, 'safety');

  const loadConnectivity = () => call(async () => {
    const r = await axios.post(`${API}/buildings/${buildingId}/analysis/connectivity`,
      { blocked_edges: [] });
    setConnectivity(r.data);
  }, 'connectivity');

  const loadBottleneck = () => call(async () => {
    const r = await axios.post(`${API}/buildings/${buildingId}/analysis/bottleneck`);
    setBottleneck(r.data);
  }, 'bottleneck');

  const toggleBottleneckHighlight = () => {
    if (!bottleneck) return;
    const next = !highlighted;
    setHighlighted(next);
    onHighlightBottlenecks?.(next ? bottleneck.bridge_edges : []);
  };

  const loadMaxflow = () => call(async () => {
    const rooms = nodes.filter(n => n.type === 'room').map(n => n.node_key);
    const r = await axios.post(`${API}/buildings/${buildingId}/evacuate/maxflow`,
      { occupied_rooms: rooms });
    setMaxflow(r.data);
    onShowMaxflowBadges?.(r.data.flow_per_exit);
  }, 'maxflow');

  const exportCsv = async () => {
    if (!fireLocation) { setError('กรุณาเลือก fire location ก่อน Export'); return; }
    const url = `${API}/buildings/${buildingId}/experiments/run?fire_location=${encodeURIComponent(fireLocation)}&format=csv`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiments_b${buildingId}.csv`;
    link.click();
  };

  const exportJson = async () => {
    if (!fireLocation) { setError('กรุณาเลือก fire location ก่อน Export'); return; }
    const r = await axios.get(`${API}/buildings/${buildingId}/experiments/run`,
      { params: { fire_location: fireLocation, format: 'json' } });
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `experiments_b${buildingId}.json`;
    link.click();
  };

  return (
    <div style={s.container}>
      {/* Header row with action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginRight: 4 }}>
          📊 Graph Analysis
        </span>
        <button onClick={loadSafety}      style={s.btn()} disabled={loading === 'safety'}>
          {loading === 'safety' ? '...' : 'Safety Score'}
        </button>
        <button onClick={loadConnectivity} style={s.btn()} disabled={loading === 'connectivity'}>
          {loading === 'connectivity' ? '...' : 'Connectivity'}
        </button>
        <button onClick={loadBottleneck}  style={s.btn()} disabled={loading === 'bottleneck'}>
          {loading === 'bottleneck' ? '...' : 'Bottleneck'}
        </button>
        <button onClick={loadMaxflow}     style={s.btn()} disabled={loading === 'maxflow'}>
          {loading === 'maxflow' ? '...' : 'Max-Flow'}
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={exportCsv}  style={s.btn('#0369a1')}>⬇ CSV</button>
          <button onClick={exportJson} style={s.btn('#0369a1')}>⬇ JSON</button>
        </span>
      </div>

      {error && (
        <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>
      )}

      <div style={s.row}>
        {/* Safety Score */}
        {safety && (
          <div style={s.card}>
            <div style={s.label}>Safety Score</div>
            <div style={{ ...s.val, color: GRADE_COLOR[safety.grade] }}>
              {safety.score} <span style={{ fontSize: 14 }}>/ 100</span>
            </div>
            <div style={{ ...s.sub, marginTop: 6 }}>
              Grade: <strong style={{ color: GRADE_COLOR[safety.grade] }}>{safety.grade}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 6, lineHeight: 1.5 }}>
              Exits: {Math.round(safety.factors.exit_ratio * 100)}% ·{' '}
              Connect: {Math.round(safety.factors.connectivity * 100)}% ·{' '}
              Bridge-free: {Math.round(safety.factors.bottleneck_resilience * 100)}%
            </div>
          </div>
        )}

        {/* Connectivity */}
        {connectivity && (
          <div style={s.card}>
            <div style={s.label}>Connectivity</div>
            <div style={{ ...s.val, fontSize: 14, marginTop: 4 }}>
              {connectivity.is_connected
                ? <span style={{ color: '#22c55e' }}>✓ Connected</span>
                : <span style={{ color: '#ef4444' }}>✗ Disconnected</span>}
            </div>
            <div style={s.sub}>{connectivity.num_components} component(s)</div>
            {connectivity.unreachable_nodes.length > 0 && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>
                Unreachable: {connectivity.unreachable_nodes.join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Bottleneck */}
        {bottleneck && (
          <div style={{ ...s.card, minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={s.label}>Bottleneck Edges</div>
              <button
                onClick={toggleBottleneckHighlight}
                style={s.btn(highlighted ? '#f59e0b' : '#334155')}
              >
                {highlighted ? '⬛ Hide' : '🟠 Highlight'}
              </button>
            </div>
            <div style={{ ...s.val, fontSize: 16 }}>
              {bottleneck.bridge_edges.length} bridge{bottleneck.bridge_edges.length !== 1 ? 's' : ''}
            </div>
            <div style={s.sub}>
              Min-cut: {bottleneck.min_edge_cut_size} edge(s) ·
              Severity: {Math.round(bottleneck.severity * 100)}%
            </div>
            {bottleneck.bridge_edges.slice(0, 3).map(([u, v], i) => (
              <div key={i} style={{ ...s.bridgeRow, marginTop: 4 }}>
                <span style={{ color: '#f97316' }}>{u} ↔ {v}</span>
              </div>
            ))}
            {bottleneck.bridge_edges.length > 3 && (
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                +{bottleneck.bridge_edges.length - 3} more…
              </div>
            )}
          </div>
        )}

        {/* Max-flow */}
        {maxflow && (
          <div style={s.card}>
            <div style={s.label}>Max-Flow (persons)</div>
            <div style={{ ...s.val, fontSize: 16 }}>{maxflow.total_flow} total</div>
            <div style={{ marginTop: 6 }}>
              {Object.entries(maxflow.flow_per_exit).map(([exit, flow]) => (
                <div key={exit} style={s.bridgeRow}>
                  <span style={{ color: '#f1f5f9' }}>{exit}</span>
                  <span style={s.flowBadge}>{flow}</span>
                </div>
              ))}
            </div>
            {maxflow.bottleneck_edges.length > 0 && (
              <div style={{ fontSize: 11, color: '#f97316', marginTop: 6 }}>
                ⚠ {maxflow.bottleneck_edges.length} bottleneck edge(s) at ≥ 90% capacity
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
