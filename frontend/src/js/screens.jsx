/* Secondary screens: Manager, Editor, Login */
/* eslint-disable */

/* ── Building Manager ───────────────────────────────────────────── */
function ManagerScreen({ navigateTo }) {
  const [filter, setFilter] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const filtered = BUILDINGS.filter(b =>
    b.name.toLowerCase().includes(filter.toLowerCase()) ||
    b.address.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="screen-page">
      <ManagerTopBar navigateTo={navigateTo} />
      <div className="page-body">
        <header className="page-header">
          <div>
            <div className="mono micro dim">FACILITY OPS · BUILDINGS</div>
            <h1 className="page-title">อาคารทั้งหมด</h1>
            <div className="mono small dim">{BUILDINGS.length} อาคาร · 146 nodes · 156 edges total</div>
          </div>
          <div className="header-actions">
            <button className="ghost-btn mono small" onClick={() => setImportOpen(o => !o)}>
              {importOpen ? '▴ ปิด JSON' : '⬆ นำเข้า JSON'}
            </button>
            <button className="primary-btn small">+ เพิ่มอาคาร</button>
          </div>
        </header>

        <div className="filter-bar">
          <span className="mono micro dim">FILTER</span>
          <input className="filter-input" placeholder="ค้นหาด้วยชื่อ / ที่อยู่…"
            value={filter} onChange={e => setFilter(e.target.value)} />
          <span className="filter-sep" />
          {['ALL','A','B','C','D','F'].map(g => (
            <button key={g} className={`grade-pill ${g==='ALL' ? 'on' : ''}`}>{g}</button>
          ))}
        </div>

        {importOpen && (
          <div className="import-card">
            <div className="import-card-head">
              <span className="mono small">JSON IMPORT</span>
              <span className="mono micro dim">name, nodes[], edges[]</span>
            </div>
            <textarea className="json-area" rows="6" placeholder={`{
  "name": "อาคาร IT",
  "nodes": [{"node_key":"r101","type":"room","x":100,"y":480,"capacity":30,"floor_number":1},…],
  "edges": [{"u_key":"r101","v_key":"c1","distance_m":12,"width_m":2,"is_stair":false},…]
}`} />
            <div className="import-card-foot">
              <button className="ghost-btn mono small">📂 เลือกไฟล์</button>
              <span className="mono micro dim">หรือลากวางที่นี่</span>
              <span style={{marginLeft:'auto'}} />
              <button className="primary-btn small">⬆ Import อาคาร</button>
            </div>
          </div>
        )}

        <div className="building-grid">
          {filtered.map(b => (
            <BuildingCard key={b.id} b={b} navigateTo={navigateTo} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildingCard({ b, navigateTo }) {
  const grade = { A:'lime', B:'cyan', C:'amber', D:'amber', F:'red' }[b.grade];
  return (
    <div className="b-card">
      <div className="b-card-thumb">
        <BuildingMiniMap floors={Math.max(2, Math.min(5, Math.round(b.nodes/12)))} />
        <div className={`b-grade tone-${grade}`}>
          <span className="mono big-grade">{b.grade}</span>
          <span className="mono micro dim">SCORE {b.score}</span>
        </div>
      </div>
      <div className="b-card-body">
        <div className="b-card-name">{b.name}</div>
        <div className="b-card-sub mono small dim">📍 {b.address}</div>
        <div className="b-card-stats">
          <div><span className="mono small">{b.nodes}</span> <span className="mono micro dim">NODES</span></div>
          <div><span className="mono small">{b.edges}</span> <span className="mono micro dim">EDGES</span></div>
          <div><span className="mono small">{b.description.match(/\d+ ชั้น/)?.[0] || '—'}</span></div>
        </div>
        <div className="b-card-meta mono micro dim">
          📡 TMD · {b.station} <span style={{float:'right'}}>{b.created}</span>
        </div>
      </div>
      <div className="b-card-foot">
        <button className="ghost-btn mono small" onClick={() => navigateTo('editor')}>✎ EDIT</button>
        <button className="primary-btn small" onClick={() => navigateTo('simulate')}>▶ SIMULATE</button>
        <button className="icon-danger" title="ลบอาคาร">🗑</button>
      </div>
    </div>
  );
}

function BuildingMiniMap({ floors = 3 }) {
  return (
    <svg viewBox="0 0 220 120" preserveAspectRatio="xMidYMid meet" className="mini-map">
      <rect width="220" height="120" fill="var(--bg-1)" />
      {Array.from({length: floors}).map((_, i) => {
        const y = 14 + i * (90 / floors);
        const h = 80 / floors;
        return (
          <g key={i}>
            <rect x="14" y={y} width="192" height={h} fill="none" stroke="var(--line-1)" strokeDasharray="2 3" />
            {[0,1,2,3,4].map(j => (
              <rect key={j} x={28 + j*38} y={y + 4} width="24" height={Math.max(8, h - 8)} fill="var(--bg-3)" stroke="var(--line-2)" />
            ))}
            <line x1="14" y1={y + h/2} x2="206" y2={y + h/2} stroke="var(--accent-cyan)" strokeOpacity="0.35" strokeWidth="0.8" />
          </g>
        );
      })}
      <circle cx="10" cy="108" r="3" fill="var(--accent-lime)" />
      <circle cx="210" cy="108" r="3" fill="var(--accent-lime)" />
    </svg>
  );
}

function ManagerTopBar({ navigateTo }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
              <line x1="2" y1="9" x2="22" y2="9" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
              <line x1="2" y1="16" x2="22" y2="16" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
              <circle cx="17" cy="6" r="1.5" fill="var(--accent-lime)" />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-title mono">EVAC<span style={{color:'var(--accent-cyan)'}}>·</span>OPS</div>
            <div className="brand-sub mono">v2.4 · NetworkX · TMD</div>
          </div>
        </div>
      </div>
      <div className="topbar-center">
        <nav className="nav-tabs">
          {[['manager','อาคาร'],['editor','แก้ไขแปลน'],['simulate','จำลอง'],['analysis','วิเคราะห์'],['incidents','รายงานเหตุ']].map(([k, l]) => (
            <button key={k} className={`navtab ${k === 'manager' ? 'on' : ''}`} onClick={() => navigateTo(k)}>
              {l}
            </button>
          ))}
        </nav>
      </div>
      <div className="topbar-right">
        <div className="status-block">
          <span className="mono small dim">SYSTEM</span>
          <span className="mono small tone-lime">● OPERATIONAL</span>
        </div>
        <div className="user-pill">
          <div className="avatar mono">RX</div>
          <div>
            <div className="user-name">พ.ต.อ.ประสิทธิ์</div>
            <div className="user-role mono small dim">OPERATOR · L3</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Floor Editor ───────────────────────────────────────────────── */
function EditorScreen({ navigateTo }) {
  const [tool, setTool] = React.useState('select');
  const [selected, setSelected] = React.useState('r201');
  const [showGraph, setShowGraph] = React.useState(true);
  const sel = NODES.find(n => n.id === selected);

  return (
    <div className="screen-page">
      <ManagerTopBar navigateTo={navigateTo} />
      <div className="editor-body">
        <aside className="editor-rail">
          <div className="rail-head">
            <div className="rail-head-title">
              <span className="mono micro dim">FLOOR EDITOR · {BUILDING.name.split('—')[0].trim()}</span>
              <span>เครื่องมือ</span>
            </div>
          </div>
          <div className="tool-list">
            {[
              ['select','คัดเลือก','▱'],
              ['room','เพิ่มห้อง','▭'],
              ['corridor','เพิ่มทางเดิน','═'],
              ['stair','เพิ่มบันได','▤'],
              ['exit','เพิ่มทางออก','◖'],
              ['edge','เชื่อม edge','—'],
              ['erase','ลบ','✕'],
            ].map(([k,l,ic]) => (
              <button key={k} className={`tool-btn ${tool === k ? 'on' : ''}`} onClick={() => setTool(k)}>
                <span className="tool-icon mono">{ic}</span>
                <span>{l}</span>
                <span className="mono micro dim">{k[0].toUpperCase()}</span>
              </button>
            ))}
          </div>

          <Section title="เลเยอร์" sub="LAYERS">
            <div className="layer-row">
              <input type="checkbox" defaultChecked /> <span className="mono small">Floor plan image</span>
            </div>
            <div className="layer-row">
              <input type="checkbox" checked={showGraph} onChange={e => setShowGraph(e.target.checked)} />
              <span className="mono small">Graph (nodes + edges)</span>
            </div>
            <div className="layer-row">
              <input type="checkbox" defaultChecked /> <span className="mono small">Grid · 24px</span>
            </div>
            <div className="layer-row">
              <input type="checkbox" /> <span className="mono small">Edge weights</span>
            </div>
          </Section>

          <Section title="คุณสมบัติ" sub="PROPERTIES">
            {sel ? (
              <div className="prop-grid">
                <Prop k="ID" v={sel.id} />
                <Prop k="LABEL" v={sel.label} />
                <Prop k="TYPE" v={<span className={`type-pill t-${sel.type}`}>{sel.type}</span>} />
                <Prop k="FLOOR" v={sel.floor} />
                <Prop k="X" v={`${sel.x}px`} />
                <Prop k="Y" v={`${sel.y}px`} />
                <Prop k="CAPACITY" v={`${sel.cap} persons`} />
              </div>
            ) : <div className="mono micro dim">No selection</div>}
          </Section>

          <div className="rail-foot">
            <div className="save-state mono micro dim">
              <span className="status-dot dot-lime" /> SAVED · 2 mins ago
            </div>
            <button className="primary-btn small">⬆ บันทึก & ออก</button>
          </div>
        </aside>

        <div className="editor-canvas">
          <div className="canvas-toolbar">
            <div className="canvas-tool-group">
              <button className="iconbtn">◐</button>
              <button className="iconbtn">⤢</button>
              <button className="iconbtn">⊞</button>
              <span className="mono micro dim">100%</span>
            </div>
            <div className="canvas-status mono micro dim">
              {NODES.length} nodes · {EDGES.length} edges · cursor 480, 412
            </div>
            <div className="canvas-tool-group">
              <button className="ghost-btn mono small">↶ UNDO</button>
              <button className="ghost-btn mono small">↷ REDO</button>
            </div>
          </div>
          <div className="canvas-host">
            <FloorPlan
              nodes={showGraph ? NODES : []}
              edges={showGraph ? EDGES : []}
              fireNode={null}
              highlightedNode={selected}
              onNodeClick={setSelected}
              formulaOverlay={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Prop({ k, v }) {
  return (
    <div className="prop">
      <span className="mono micro dim">{k}</span>
      <span className="mono small">{v}</span>
    </div>
  );
}

/* ── Login ──────────────────────────────────────────────────────── */
function LoginScreen({ navigateTo }) {
  const [mode, setMode] = React.useState('login');
  return (
    <div className="login-screen">
      <div className="login-bg">
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 800 600">
          <defs>
            <pattern id="bg-dots" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--line-1)" />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="url(#bg-dots)" />
          {[60,180,300,420].map((y, i) => (
            <g key={i} opacity="0.4">
              <rect x="100" y={y} width="600" height="80" fill="none" stroke="var(--line-1)" strokeDasharray="2 4" />
              <line x1="100" y1={y+40} x2="700" y2={y+40} stroke="var(--accent-cyan)" strokeOpacity="0.18" />
            </g>
          ))}
        </svg>
      </div>
      <div className="login-card">
        <div className="login-brand">
          <svg viewBox="0 0 24 24" width="36" height="36">
            <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
            <line x1="2" y1="16" x2="22" y2="16" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
            <circle cx="17" cy="6" r="1.5" fill="var(--accent-red)">
              <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" />
            </circle>
          </svg>
          <div>
            <div className="login-title mono">EVAC<span style={{color:'var(--accent-cyan)'}}>·</span>OPS</div>
            <div className="mono small dim">Building Evacuation Simulation</div>
          </div>
        </div>

        <div className="login-tabs">
          <button className={`login-tab ${mode==='login'?'on':''}`} onClick={() => setMode('login')}>เข้าสู่ระบบ</button>
          <button className={`login-tab ${mode==='register'?'on':''}`} onClick={() => setMode('register')}>สมัครสมาชิก</button>
        </div>

        <div className="login-form">
          {mode === 'register' && (
            <div className="form-row">
              <label className="mono micro dim">ชื่อ-สกุล</label>
              <input className="input" placeholder="พ.ต.อ.ประสิทธิ์ ทรัพย์มี" />
            </div>
          )}
          <div className="form-row">
            <label className="mono micro dim">อีเมล / รหัสเจ้าหน้าที่</label>
            <input className="input" placeholder="operator@evacops.local" defaultValue="rx@evacops.local" />
          </div>
          <div className="form-row">
            <label className="mono micro dim">รหัสผ่าน</label>
            <input className="input" type="password" defaultValue="••••••••" />
          </div>
          {mode === 'login' && (
            <div className="form-row inline">
              <label className="mono small dim"><input type="checkbox" defaultChecked /> จดจำฉัน</label>
              <a className="mono small accent-cyan">ลืมรหัสผ่าน?</a>
            </div>
          )}
          <button className="primary-btn" onClick={() => navigateTo('manager')}>
            {mode === 'login' ? 'เข้าสู่ระบบ →' : 'สมัครสมาชิก →'}
          </button>
          <div className="login-foot mono micro dim">
            <span>API: <span className="accent-cyan">api.evacops.local</span></span>
            <span>·</span>
            <span>JWT 24h · TLS 1.3</span>
          </div>
        </div>
      </div>

      <div className="login-side">
        <div className="mono micro dim" style={{marginBottom: 8}}>SYSTEM STATUS · 14:08:42</div>
        {[
          ['API gateway', 'OPERATIONAL', 'lime'],
          ['NetworkX engine', 'OPERATIONAL', 'lime'],
          ['TMD weather feed', 'OPERATIONAL · 503201', 'lime'],
          ['Postgres pooler', 'OPERATIONAL · 12/30 conns', 'lime'],
          ['Render Singapore', 'OPERATIONAL · 42ms', 'lime'],
        ].map(([n, s, t]) => (
          <div key={n} className="status-line">
            <span className={`status-dot dot-${t}`} />
            <span className="mono small">{n}</span>
            <span className="mono micro dim grow right">{s}</span>
          </div>
        ))}
        <div className="mono micro dim" style={{marginTop:16}}>
          uptime 47d 12h · 114 tests passing · last deploy 2h ago
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ManagerScreen, EditorScreen, LoginScreen });
