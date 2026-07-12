/* Control panel + results panel + bottom status strip */
import React, { useState, useEffect } from 'react';

export const Section = ({ title, sub, action, children }) => (
  <div className="panel-section">
    <div className="panel-section-head">
      <div className="panel-section-title">
        <span className="mono micro dim">{sub}</span>
        <span>{title}</span>
      </div>
      {action}
    </div>
    {children}
  </div>
);

/* ── Control Panel (left rail) ──────────────────────────────────── */
export function ControlPanel({
  nodes,
  fireLocation, setFireLocation,
  blockedExits, setBlockedExits,
  crowd, setCrowd, occupied, setOccupied,
  useWeather, setUseWeather, manualWind, setManualWind, weather,
}) {
  const EXIT_IDS = nodes.filter(n => n.type === 'exit').map(n => n.id);
  const CORRIDOR_IDS = nodes.filter(n => n.type === 'corridor').map(n => n.id);
  const ROOM_IDS = nodes.filter(n => n.type === 'room').map(n => n.id);

  const toggleExit = (e) =>
    setBlockedExits(p => p.includes(e) ? p.filter(x => x !== e) : [...p, e]);
  const toggleOcc = (r) =>
    setOccupied(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);

  const w = weather || { wind_direction_deg: 135, wind_speed_ms: 3.5, temperature_c: 28, humidity_pct: 72, station: '—' };

  return (
    <aside className="rail rail-left">
      <div className="rail-head">
        <div className="rail-head-title">
          <span className="mono micro dim">SCENARIO · 01</span>
          <span>ตัวแปรจำลอง</span>
        </div>
        <button className="ghost-btn mono small" onClick={() => {
          setFireLocation(nodes.find(n => n.type === 'room')?.id || '');
          setBlockedExits([]);
          setCrowd({});
          setOccupied(nodes.filter(n => n.type === 'room').map(n => n.id));
        }}>RESET</button>
      </div>

      <Section title="จุดเกิดเหตุไฟไหม้" sub="FIRE ORIGIN">
        <NodeSelector value={fireLocation} onChange={setFireLocation}
          options={nodes.filter(n => n.type !== 'exit')} />
        <div className="hint mono micro">
          <span className="dim">v_fire</span> = V_BASE × type_mult × width_factor × wind_factor
        </div>
      </Section>

      <Section title="ปิดทางออก" sub="BLOCKED EXITS"
        action={<span className="mono micro dim">{blockedExits.length}/{EXIT_IDS.length}</span>}>
        <div className="chip-row">
          {EXIT_IDS.map(e => {
            const off = blockedExits.includes(e);
            return (
              <button key={e} className={`chip ${off ? 'chip-off' : ''}`} onClick={() => toggleExit(e)}>
                <span className="chip-dot" />
                <span className="mono">{e}</span>
                {off && <span className="chip-x">✕</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="ความหนาแน่นฝูงชน" sub="CROWD DENSITY ρ ∈ [0,1)">
        {CORRIDOR_IDS.map(id => {
          const v = crowd[id] ?? 0;
          const nodeFloor = nodes.find(n => n.id === id)?.floor || '';
          return (
            <div key={id} className="density-row">
              <div className="density-row-head">
                <span className="mono small">{id}</span>
                {nodeFloor && <span className="mono small dim">F{nodeFloor}</span>}
                <span className="mono small accent-cyan">{Math.round(v*100)}%</span>
              </div>
              <div className="slider-track">
                <div className="slider-fill" style={{width: `${v*100}%`}} />
                <input type="range" min="0" max="0.95" step="0.05" value={v}
                  onChange={ev => setCrowd({...crowd, [id]: parseFloat(ev.target.value)})} />
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="ห้องที่มีคน" sub="OCCUPIED ROOMS · ประเมินเวลา"
        action={<span className="mono micro dim">{occupied.length}/{ROOM_IDS.length}</span>}>
        <div className="room-grid">
          {ROOM_IDS.map(r => {
            const cap = nodes.find(n => n.id === r)?.cap ?? nodes.find(n => n.id === r)?.capacity ?? 0;
            return (
              <button key={r} className={`room-cell ${occupied.includes(r) ? 'on' : ''}`}
                onClick={() => toggleOcc(r)}>
                <span className="mono small">{r}</span>
                <span className="mono micro dim">{cap}p</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="ลม" sub="WIND · SMOKE PROPAGATION">
        <div className="toggle-pair">
          <button className={`pair-btn ${useWeather ? 'on' : ''}`} onClick={() => setUseWeather(true)}>
            <span className="mono small">TMD LIVE</span>
            <span className="mono micro dim">{w.station.split('·')[0].trim()}</span>
          </button>
          <button className={`pair-btn ${!useWeather ? 'on' : ''}`} onClick={() => setUseWeather(false)}>
            <span className="mono small">MANUAL</span>
            <span className="mono micro dim">override</span>
          </button>
        </div>
        {useWeather ? (
          <div className="weather-card">
            <div className="kv"><span className="dim mono micro">ทิศทาง</span><span className="mono small">{w.wind_direction_deg}°</span></div>
            <div className="kv"><span className="dim mono micro">ความเร็ว</span><span className="mono small">{w.wind_speed_ms} m/s</span></div>
            <div className="kv"><span className="dim mono micro">อุณหภูมิ</span><span className="mono small">{w.temperature_c}°C</span></div>
            <div className="kv"><span className="dim mono micro">RH</span><span className="mono small">{w.humidity_pct}%</span></div>
            <div className="kv"><span className="dim mono micro">STATION</span><span className="mono small">{w.station}</span></div>
          </div>
        ) : (
          <div className="manual-wind">
            <div className="density-row">
              <div className="density-row-head">
                <span className="mono small">ทิศทาง</span>
                <span className="mono small accent-cyan">{manualWind.deg}°</span>
              </div>
              <input type="range" min="0" max="359" value={manualWind.deg}
                onChange={e => setManualWind({...manualWind, deg: Number(e.target.value)})} />
            </div>
            <div className="density-row">
              <div className="density-row-head">
                <span className="mono small">ความเร็ว</span>
                <span className="mono small accent-cyan">{manualWind.ms.toFixed(1)} m/s</span>
              </div>
              <input type="range" min="0" max="20" step="0.5" value={manualWind.ms}
                onChange={e => setManualWind({...manualWind, ms: parseFloat(e.target.value)})} />
            </div>
          </div>
        )}
      </Section>

      <div className="rail-foot">
        <div className="mono micro dim center">
          auto-rerun ทุก input change
        </div>
      </div>
    </aside>
  );
}

function NodeSelector({ value, onChange, options }) {
  const floors = [...new Set(options.map(n => n.floor))].filter(Boolean).sort((a, b) => b - a);
  const displayFloors = floors.length > 0 ? floors : [1];
  return (
    <div className="node-selector">
      <div className="node-selector-grid">
        {displayFloors.map(floor => (
          <div key={floor} className="ns-floor">
            <div className="mono micro dim">F{floor}</div>
            <div className="ns-cells">
              {options.filter(n => n.floor === floor).map(n => (
                <button key={n.id} className={`ns-cell t-${n.type} ${value === n.id ? 'on' : ''}`}
                  onClick={() => onChange(n.id)} title={n.label}>
                  <span className="mono micro">{n.id.replace(/_f\d/, '')}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {floors.length === 0 && (
          <select className="select" value={value} onChange={e => onChange(e.target.value)}
            style={{width:'100%',padding:'4px 8px',background:'var(--bg-3)',border:'1px solid var(--line-2)',borderRadius:4,color:'var(--ink-1)'}}>
            {options.map(n => <option key={n.id} value={n.id}>{n.id} · {n.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

/* ── Results Panel (right rail) ─────────────────────────────────── */
export function ResultsPanel({
  tab, setTab, routes, compareRoutes, algorithm,
  selectedRoute, setSelectedRoute, safety, bottlenecks,
  showBottleneck, setShowBottleneck, maxflowBadges,
  analysisOpen, setAnalysisOpen, stats, clickedNode,
  incidents,
}) {
  const activeCount = incidents ? incidents.filter(i => i.status === 'active').length : 0;
  return (
    <aside className="rail rail-right">
      <div className="tab-bar">
        {[
          ['results',  'ผลลัพธ์',    routes.length],
          ['analysis', 'วิเคราะห์',  safety.score],
          ['incidents','รายงานเหตุ', activeCount],
        ].map(([k, l, c]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <span>{l}</span>
            <span className="tab-count mono micro">{c}</span>
          </button>
        ))}
      </div>

      {tab === 'results' && (
        <ResultsTab routes={routes} compareRoutes={compareRoutes} algorithm={algorithm}
          selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} stats={stats} />
      )}
      {tab === 'analysis' && (
        <AnalysisTab safety={safety} bottlenecks={bottlenecks}
          showBottleneck={showBottleneck} setShowBottleneck={setShowBottleneck}
          maxflowBadges={maxflowBadges}
          open={analysisOpen} setOpen={setAnalysisOpen} />
      )}
      {tab === 'incidents' && (
        <IncidentsTab clickedNode={clickedNode} incidents={incidents} />
      )}
    </aside>
  );
}

function ResultsTab({ routes, compareRoutes, algorithm, selectedRoute, setSelectedRoute, stats }) {
  const fmt = (t) => isFinite(t) ? `${t.toFixed(1)}s` : '∞';
  return (
    <div className="tab-body">
      <div className="stat-row">
        <Stat label="AVG TIME"    value={fmt(stats.avgEvac)} tone="cyan" />
        <Stat label="TOTAL"       value={fmt(stats.totalEvac)} tone="ink" />
        <Stat label="MAX"         value={fmt(stats.slowest.time_s)} tone="amber" />
        <Stat label="UNREACHABLE" value={stats.unreachable} tone={stats.unreachable ? 'red' : 'ink'} />
      </div>

      <div className="route-table-head">
        <span className="mono micro dim">SRC</span>
        <span className="mono micro dim">EXIT</span>
        <span className="mono micro dim">PATH</span>
        <span className="mono micro dim">HOPS</span>
        <span className="mono micro dim right">TIME</span>
      </div>
      <div className="route-table">
        {routes.map(r => {
          const isSel = selectedRoute?.source === r.source;
          const cmp = compareRoutes?.find(c => c.source === r.source);
          const diff = cmp && cmp.reachable && r.reachable ? cmp.time_s - r.time_s : null;
          return (
            <button key={r.source} className={`route-row ${isSel ? 'on' : ''} ${!r.reachable ? 'fail' : ''}`}
              onClick={() => setSelectedRoute(isSel ? null : r)}>
              <span className="mono small">{r.source}</span>
              <span className="mono small">
                {r.reachable ? r.exit : <span style={{color:'var(--accent-red)'}}>BLOCKED</span>}
              </span>
              <span className="mono micro path-mini">
                {r.reachable ? r.path.map(p => p.replace(/_f\d/,'').replace('stair_','S')).join(' → ') : '—'}
              </span>
              <span className="mono small">{r.reachable ? r.hops : '—'}</span>
              <span className="mono small right">
                {fmt(r.time_s)}
                {diff != null && (
                  <span className={`diff ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}`}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {algorithm === 'compare' && (
        <div className="compare-card">
          <div className="compare-head">
            <span className="mono small">DIJKSTRA <span style={{color:'var(--accent-lime)'}}>vs</span> A*</span>
          </div>
          <div className="compare-grid">
            <div className="compare-cell">
              <div className="mono micro dim">DIJKSTRA</div>
              <div className="mono big">{(routes.reduce((s,r)=>s+(r.time_s||0),0) / Math.max(1, routes.filter(r=>r.reachable).length)).toFixed(1)}s</div>
              <div className="mono micro dim">avg · O((V+E)log V)</div>
            </div>
            <div className="compare-cell">
              <div className="mono micro dim">A*</div>
              <div className="mono big">{(compareRoutes?.reduce((s,r)=>s+(r.time_s||0),0) / Math.max(1, compareRoutes?.filter(r=>r.reachable).length||1)).toFixed(1)}s</div>
              <div className="mono micro dim">avg · admissible h</div>
            </div>
            <div className="compare-cell">
              <div className="mono micro dim">PATHS DIFFER</div>
              <div className="mono big">
                {compareRoutes ? routes.filter((r,i) => JSON.stringify(r.path) !== JSON.stringify(compareRoutes[i]?.path)).length : 0}
              </div>
              <div className="mono micro dim">routes</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'ink' }) {
  return (
    <div className={`stat tone-${tone}`}>
      <div className="mono micro dim">{label}</div>
      <div className="mono stat-val">{value}</div>
    </div>
  );
}

function AnalysisTab({ safety, bottlenecks, showBottleneck, setShowBottleneck,
                     maxflowBadges, open, setOpen }) {
  const gradeColor = { A: 'lime', B: 'cyan', C: 'amber', D: 'amber', F: 'red' }[safety.grade] || 'cyan';
  return (
    <div className="tab-body">
      <div className="safety-card">
        <div className="safety-head">
          <span className="mono micro dim">SAFETY SCORE · S = 40·exits + 30·minCut + 30·λ(G)</span>
        </div>
        <div className="safety-body">
          <div>
            <div className={`safety-score tone-${gradeColor}`}>{safety.score}</div>
            <div className="mono small dim">/ 100</div>
          </div>
          <div className={`safety-grade tone-${gradeColor}`}>
            <div className="mono big-grade">{safety.grade}</div>
            <div className="mono micro dim">GRADE</div>
          </div>
          <div className="safety-bars">
            <Bar label="EXIT RATIO"    value={safety.factors?.exit_ratio ?? 0} />
            <Bar label="CONNECTIVITY"  value={safety.factors?.connectivity ?? 0} />
            <Bar label="BRIDGE-FREE"   value={safety.factors?.bottleneck_resilience ?? 0} />
          </div>
        </div>
      </div>

      <Collapsible title="CONNECTIVITY" sub="Graph integrity" open={open.connectivity}
        onToggle={() => setOpen({...open, connectivity: !open.connectivity})}>
        <div className="grid-2">
          <Kv k="STATUS" v={<span className="tone-lime mono">✓ Connected</span>} />
          <Kv k="COMPONENTS" v="1" />
          <Kv k="DIAMETER" v="—" />
          <Kv k="UNREACHABLE" v="0" />
        </div>
      </Collapsible>

      <Collapsible title="BOTTLENECK" sub="Bridge edges"
        action={
          <button className={`small-btn ${showBottleneck ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setShowBottleneck(!showBottleneck);}}>
            {showBottleneck ? 'HIDE' : 'HIGHLIGHT'}
          </button>
        }
        open={open.bottleneck}
        onToggle={() => setOpen({...open, bottleneck: !open.bottleneck})}>
        <div className="bridge-rows">
          {bottlenecks.map(([u,v], i) => (
            <div key={i} className="bridge-row">
              <span className="mono small accent-amber">⚠</span>
              <span className="mono small">{u}</span>
              <span className="mono small dim">↔</span>
              <span className="mono small">{v}</span>
              <span className="mono micro dim right">single point</span>
            </div>
          ))}
          {bottlenecks.length === 0 && <div className="mono micro dim">ไม่พบ bridge edge</div>}
        </div>
      </Collapsible>

      <Collapsible title="MAX-FLOW" sub="Persons per exit · Ford-Fulkerson"
        open={open.maxflow} onToggle={() => setOpen({...open, maxflow: !open.maxflow})}>
        {Object.keys(maxflowBadges).length > 0 ? (
          <div className="flow-bar">
            {Object.entries(maxflowBadges).map(([exit, flow], i) => (
              <div key={exit} className="flow-seg" style={{flex: flow, background: i === 0 ? 'var(--accent-cyan)' : 'var(--accent-violet)'}}>
                <span className="mono small">{exit}</span><span className="mono small">{flow}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mono micro dim">รันด้วย MAX-FLOW algorithm เพื่อดูข้อมูล</div>
        )}
      </Collapsible>

      <div className="export-row">
        <button className="ghost-btn mono small">⬇ EXPORT CSV</button>
        <button className="ghost-btn mono small">⬇ EXPORT JSON</button>
      </div>
    </div>
  );
}

function Bar({ label, value }) {
  return (
    <div className="bar">
      <div className="bar-head">
        <span className="mono micro dim">{label}</span>
        <span className="mono micro">{Math.round(Math.min(1,value||0)*100)}%</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{width: `${Math.min(100, (value||0)*100)}%`}} />
      </div>
    </div>
  );
}

function Kv({ k, v }) {
  return (
    <div className="kv-row">
      <span className="mono micro dim">{k}</span>
      <span className="mono small">{v}</span>
    </div>
  );
}

function Collapsible({ title, sub, open, onToggle, action, children }) {
  return (
    <div className={`collapsible ${open ? 'open' : ''}`}>
      <button className="collapsible-head" onClick={onToggle}>
        <span className="caret mono">{open ? '▾' : '▸'}</span>
        <span className="mono small">{title}</span>
        <span className="mono micro dim">{sub}</span>
        {action && <span style={{marginLeft:'auto'}}>{action}</span>}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

function IncidentsTab({ clickedNode, incidents }) {
  const [sev, setSev] = useState('high');
  const [type, setType] = useState('fire');
  const [node, setNode] = useState(clickedNode || '');
  useEffect(() => { if (clickedNode) setNode(clickedNode); }, [clickedNode]);

  const log = incidents || [];
  return (
    <div className="tab-body">
      <div className="incident-form">
        <div className="if-row">
          <div className="if-label mono micro dim">TYPE</div>
          <div className="seg">
            {[['fire','🔥','red'],['smoke','◌','amber'],['crowd','◉','cyan']].map(([k,ic,t]) => (
              <button key={k} className={`seg-btn tone-${t} ${type===k?'on':''}`} onClick={() => setType(k)}>
                <span>{ic}</span><span className="mono small">{k}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="if-row">
          <div className="if-label mono micro dim">SEVERITY</div>
          <div className="seg">
            {['low','medium','high','critical'].map(s => (
              <button key={s} className={`seg-btn sev-${s} ${sev===s?'on':''}`} onClick={() => setSev(s)}>
                <span className="mono small">{s.slice(0,3).toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="if-row">
          <div className="if-label mono micro dim">NODE</div>
          <input className="input" value={node} onChange={e => setNode(e.target.value)} placeholder="node key" />
        </div>
        <div className="if-row">
          <div className="if-label mono micro dim">NOTE</div>
          <textarea className="textarea" placeholder="รายละเอียดเหตุการณ์ (optional)…" rows="2" />
        </div>
        <div className="if-actions">
          <button className="primary-btn small">⬆ ส่งรายงาน</button>
          <button className="ghost-btn mono small">CANCEL</button>
        </div>
      </div>

      <div className="log-head mono micro dim">INCIDENT LOG</div>
      <div className="log">
        {log.map((inc, ix) => (
          <div key={ix} className={`log-row sev-${inc.sev || inc.severity || 'low'}`}>
            <span className="mono micro dim">{inc.t || inc.created_at || ''}</span>
            <span className={`log-pill type-${inc.type || inc.incident_type || 'fire'}`}>{(inc.type || inc.incident_type || 'fire').toUpperCase()}</span>
            <span className="mono small">{inc.node || inc.node_key || ''}</span>
            <span className="mono micro dim grow">{inc.by || inc.description || ''}</span>
            <span className={`log-status status-${inc.status || 'active'}`}>
              <span className="dot" />{inc.status || 'active'}
            </span>
          </div>
        ))}
        {log.length === 0 && <div className="mono micro dim" style={{padding:'12px 0'}}>ไม่มีรายการ</div>}
      </div>
    </div>
  );
}

/* ── Bottom status strip ─────────────────────────────────────────── */
export function StatusStrip({ fireSpread, fireTime, playing, setPlaying, setFireTime, wind, smoke }) {
  const max = fireSpread ? Math.ceil(fireSpread.max_time) : 60;
  const ignited = fireSpread ? fireSpread.nodes.filter(n => n.reach_time <= fireTime).length : 0;
  const total = fireSpread ? fireSpread.nodes.length : 0;
  const pct = max > 0 ? (fireTime / max) * 100 : 0;
  const smokeCount = Object.values(smoke).filter(v => v > 0.05).length;
  const blockedCount = Object.values(smoke).filter(v => v >= 0.9).length;
  return (
    <div className="status-strip">
      <button className={`play-btn ${playing ? 'on' : ''}`}
        aria-label={playing ? 'หยุดจำลองตามเวลา' : 'เล่นจำลองตามเวลา'}
        onClick={() => {
          if (fireTime >= max) setFireTime(0);
          setPlaying(!playing);
        }}>
        <span className="mono">{playing ? '⏸' : '▶'}</span>
      </button>
      <div className="strip-block">
        <span className="mono micro dim">FIRE T</span>
        <span className="mono small">{fireTime.toFixed(1)}s / {max}s</span>
      </div>
      <div className="timeline">
        <div className="timeline-fill" style={{width: `${pct}%`}} />
        <div className="timeline-head" style={{left: `${pct}%`}} />
        {fireSpread && fireSpread.nodes.slice().sort((a,b)=>a.reach_time-b.reach_time).map((n) => (
          <div key={n.node} className="timeline-tick mono micro"
            style={{left: `${(n.reach_time/max)*100}%`}}
            title={`${n.node} @ ${n.reach_time.toFixed(1)}s`}
          />
        ))}
        <input type="range" min="0" max={max} step="0.1" value={fireTime}
          aria-label="เลื่อนเวลาจำลองไฟ"
          onChange={e => { setPlaying(false); setFireTime(parseFloat(e.target.value)); }} />
      </div>
      <div className="strip-block">
        <span className="mono micro dim">IGNITED</span>
        <span className="mono small accent-red">{ignited}<span className="dim">/{total}</span></span>
      </div>
      <div className="strip-block">
        <span className="mono micro dim">SMOKE EDGES</span>
        <span className="mono small accent-amber">{smokeCount}</span>
      </div>
      <div className="strip-block">
        <span className="mono micro dim">BLOCKED</span>
        <span className="mono small" style={{color: blockedCount > 0 ? 'var(--accent-red)' : 'var(--ink-2)'}}>{blockedCount}</span>
      </div>
      <div className="strip-block">
        <span className="mono micro dim">WIND</span>
        <span className="mono small">{wind.deg}° · {wind.ms}m/s</span>
      </div>
    </div>
  );
}
