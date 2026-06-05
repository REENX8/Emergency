/**
 * ExperimentsPage — Sensitivity sweep UI (Phase 4).
 *
 * Lets an operator vary one parameter (wind_speed / fire_severity /
 * crowd_density / fire_location), compare Dijkstra vs A*, and download
 * the resulting trials as CSV/JSON.
 *
 * Synchronous: keep sweep size modest (≤ ~50 cells × 5 repeats) since
 * the backend runs it inline.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { http } from '../api/client';

const VARIABLES = [
  { value: 'wind_speed',    label: 'ความเร็วลม (m/s)',     defaultValues: '0, 2, 5, 8' },
  { value: 'fire_severity', label: 'ความรุนแรงไฟ (0-1)',   defaultValues: '0.3, 0.6, 1.0' },
  { value: 'crowd_density', label: 'ความหนาแน่นคน (0-1)', defaultValues: '0.2, 0.5, 0.8' },
  { value: 'fire_location', label: 'ตำแหน่งไฟ',            defaultValues: '0, 1, 2' },
];

function parseValues(input) {
  return input.split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => !Number.isNaN(n));
}

export default function ExperimentsPage() {
  const { buildingId } = useParams();
  const navigate = useNavigate();

  const [building,  setBuilding]  = useState(null);
  const [nodes,     setNodes]     = useState([]);
  const [fireLoc,   setFireLoc]   = useState('');
  const [variable,  setVariable]  = useState('wind_speed');
  const [valuesText, setValuesText] = useState('0, 2, 5, 8');
  const [algorithms, setAlgorithms] = useState({ dijkstra: true, astar: true });
  const [repeats,   setRepeats]   = useState(3);
  const [seed,      setSeed]      = useState(42);
  const [fireLocations, setFireLocations] = useState(''); // for fire_location sweep

  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      http.get(`/buildings/${buildingId}`),
      http.get(`/buildings/${buildingId}/nodes`, { params: { limit: 500 } }),
    ]).then(([bRes, nRes]) => {
      setBuilding(bRes.data);
      const items = nRes.data?.items ?? nRes.data ?? [];
      setNodes(items);
      const firstRoom = items.find(n => n.type === 'room');
      if (firstRoom) setFireLoc(firstRoom.node_key);
    }).catch(e => setError(e.message));
  }, [buildingId]);

  // Update default values when the variable changes
  useEffect(() => {
    const v = VARIABLES.find(x => x.value === variable);
    if (v) setValuesText(v.defaultValues);
  }, [variable]);

  const rooms = nodes.filter(n => n.type === 'room');

  const run = async () => {
    setError(null);
    setRunning(true);
    setResult(null);
    try {
      const algos = Object.entries(algorithms).filter(([_, on]) => on).map(([k]) => k);
      if (algos.length === 0) throw new Error('เลือกอัลกอริทึมอย่างน้อย 1 อย่าง');
      const values = parseValues(valuesText);
      if (values.length === 0) throw new Error('ใส่ values อย่างน้อย 1 ค่า');

      const body = {
        fire_location: fireLoc,
        variable,
        values,
        algorithms: algos,
        repeats: Number(repeats),
        seed: Number(seed),
      };
      if (variable === 'fire_location') {
        body.fire_locations = fireLocations.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        if (body.fire_locations.length === 0) {
          throw new Error('สำหรับ fire_location sweep ต้องใส่ node_key ใน "ตำแหน่งไฟทดสอบ"');
        }
      }
      const { data } = await http.post(`/buildings/${buildingId}/experiments/sweep`, body);
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = () => {
    if (!result?.csv) return;
    const blob = new Blob([result.csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sweep_b${buildingId}_${variable}.csv`;
    link.click();
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sweep_b${buildingId}_${variable}.json`;
    link.click();
  };

  return (
    <div className="page" style={{ padding: 20, color: 'var(--ink-1, #f1f5f9)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="ghost-btn mono small" onClick={() => navigate('/')}>← กลับ</button>
        <h2 style={{ margin: 0 }}>🧪 การทดลอง — Sensitivity Sweep</h2>
        {building && <span className="mono dim">— {building.name}</span>}
      </div>

      {/* Config form */}
      <div style={{ background: '#0f172a', padding: 16, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>ตัวแปรที่กวาด</span>
            <select value={variable} onChange={e => setVariable(e.target.value)}
                    style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }}>
              {VARIABLES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>ค่าที่จะลอง (คั่นด้วย comma)</span>
            <input value={valuesText} onChange={e => setValuesText(e.target.value)}
                   style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>ตำแหน่งไฟตั้งต้น</span>
            <select value={fireLoc} onChange={e => setFireLoc(e.target.value)}
                    style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }}>
              {rooms.map(n => <option key={n.node_key} value={n.node_key}>{n.label || n.node_key}</option>)}
            </select>
          </label>

          {variable === 'fire_location' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="mono dim" style={{ fontSize: 11 }}>ตำแหน่งไฟทดสอบ (node_key คั่น comma)</span>
              <input value={fireLocations} onChange={e => setFireLocations(e.target.value)}
                     placeholder="r101, r201, r301"
                     style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }} />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>Repeats (1–50)</span>
            <input type="number" min={1} max={50} value={repeats} onChange={e => setRepeats(e.target.value)}
                   style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>Seed (reproducibility)</span>
            <input type="number" min={0} value={seed} onChange={e => setSeed(e.target.value)}
                   style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }} />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>อัลกอริทึม</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={algorithms.dijkstra}
                       onChange={e => setAlgorithms(a => ({ ...a, dijkstra: e.target.checked }))} />
                Dijkstra
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={algorithms.astar}
                       onChange={e => setAlgorithms(a => ({ ...a, astar: e.target.checked }))} />
                A*
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button className="primary-btn" onClick={run} disabled={running || !fireLoc}>
            {running ? '⌛ กำลังรัน…' : '▶ รัน Sweep'}
          </button>
          {result && (
            <>
              <button className="ghost-btn mono small" onClick={downloadCsv}>⬇ CSV</button>
              <button className="ghost-btn mono small" onClick={downloadJson}>⬇ JSON</button>
              <span className="mono dim" style={{ fontSize: 11, marginLeft: 'auto' }}>
                {result.trials.length} trials · seed {result.request.seed}
              </span>
            </>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 10, padding: 8, background: '#7f1d1d', borderRadius: 4 }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Results — summary table */}
      {result && (
        <>
          <h3 style={{ marginTop: 0 }}>สรุปต่อช่อง (value × algorithm)</h3>
          <div style={{ overflowX: 'auto', background: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                  <th style={{ textAlign: 'left',  padding: '6px 10px' }}>Value</th>
                  <th style={{ textAlign: 'left',  padding: '6px 10px' }}>Algorithm</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>n</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>mean (s)</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>min (s)</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>max (s)</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>mean exec (ms)</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.per_cell.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '6px 10px' }}>{row.value}</td>
                    <td style={{ padding: '6px 10px' }}>{row.algorithm}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{row.n}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{row.mean_avg_time_s ?? '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{row.min_avg_time_s ?? '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{row.max_avg_time_s ?? '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{row.mean_exec_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tiny bar chart of mean times */}
          <h3 style={{ marginTop: 0 }}>Mean evacuation time vs {variable}</h3>
          <MeanTimeChart cells={result.summary.per_cell} />

          {/* Detailed trials (collapsible) */}
          <details style={{ marginTop: 16, background: '#0f172a', borderRadius: 8, padding: 12 }}>
            <summary className="mono dim" style={{ cursor: 'pointer' }}>
              ดู raw trials ทั้งหมด ({result.trials.length})
            </summary>
            <div style={{ overflowX: 'auto', maxHeight: 400, marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#0f172a', color: '#94a3b8' }}>
                    {['value', 'algorithm', 'repeat', 'avg_time_s', 'p50_time_s', 'p95_time_s',
                      'nodes_visited', 'best_path_hops', 'exec_time_ms', 'reachable_exits'].map(k => (
                      <th key={k} style={{ textAlign: 'left', padding: '4px 8px' }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trials.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      {['value', 'algorithm', 'repeat', 'avg_time_s', 'p50_time_s', 'p95_time_s',
                        'nodes_visited', 'best_path_hops', 'exec_time_ms', 'reachable_exits'].map(k => (
                        <td key={k} style={{ padding: '4px 8px' }}>{t[k] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}


/**
 * Tiny SVG bar chart — no extra deps. One bar per (value, algorithm) cell.
 */
function MeanTimeChart({ cells }) {
  const data = cells.filter(c => c.mean_avg_time_s != null);
  if (data.length === 0) {
    return <div className="mono dim" style={{ padding: 16 }}>ไม่มีข้อมูล mean time (อาจไม่มี exit ที่ไปได้)</div>;
  }
  const maxTime = Math.max(...data.map(d => d.mean_avg_time_s));
  const colorOf = (algo) => algo === 'dijkstra' ? '#38bdf8' : '#a78bfa';
  const W = Math.max(600, data.length * 60);
  const H = 220;
  const padX = 50, padY = 30;
  const barW = (W - padX * 2) / data.length;

  return (
    <div style={{ background: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 16, overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Axes */}
        <line x1={padX} y1={H - padY} x2={W - 10} y2={H - padY} stroke="#334155" />
        <line x1={padX} y1={10}      x2={padX}    y2={H - padY} stroke="#334155" />
        {/* Y ticks */}
        {[0, 0.5, 1].map((t, i) => (
          <g key={i}>
            <line x1={padX - 4} y1={H - padY - t * (H - padY - 20)} x2={padX} y2={H - padY - t * (H - padY - 20)} stroke="#334155" />
            <text x={padX - 8} y={H - padY - t * (H - padY - 20) + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {(maxTime * t).toFixed(1)}
            </text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const h = (d.mean_avg_time_s / maxTime) * (H - padY - 20);
          const x = padX + i * barW + 4;
          return (
            <g key={i}>
              <rect x={x} y={H - padY - h} width={barW - 8} height={h}
                    fill={colorOf(d.algorithm)} opacity={0.85}>
                <title>{`${d.algorithm} @ ${d.value} → ${d.mean_avg_time_s.toFixed(2)}s`}</title>
              </rect>
              <text x={x + (barW - 8) / 2} y={H - padY + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">
                {d.value}
              </text>
              <text x={x + (barW - 8) / 2} y={H - padY - h - 4} textAnchor="middle" fontSize="10" fill="#cbd5e1">
                {d.mean_avg_time_s.toFixed(1)}
              </text>
            </g>
          );
        })}
        {/* Legend */}
        <g transform={`translate(${W - 140}, 14)`}>
          <rect width="14" height="14" fill="#38bdf8" /><text x="20" y="11" fontSize="11" fill="#cbd5e1">Dijkstra</text>
          <rect y="20" width="14" height="14" fill="#a78bfa" /><text x="20" y="31" fontSize="11" fill="#cbd5e1">A*</text>
        </g>
      </svg>
    </div>
  );
}
