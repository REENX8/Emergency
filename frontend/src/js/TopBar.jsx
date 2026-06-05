/* TopBar — shared top navigation for all simulation screens */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/client';

function WindDial({ deg }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="wind-dial">
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line-2)" />
      <line x1="12" y1="3" x2="12" y2="5" stroke="var(--ink-3)" />
      <line x1="12" y1="19" x2="12" y2="21" stroke="var(--ink-3)" />
      <line x1="3" y1="12" x2="5" y2="12" stroke="var(--ink-3)" />
      <line x1="19" y1="12" x2="21" y2="12" stroke="var(--ink-3)" />
      <g transform={`rotate(${deg} 12 12)`}>
        <path d="M 12 4 L 14 11 L 12 9 L 10 11 Z" fill="var(--accent-cyan)" />
      </g>
    </svg>
  );
}

/* SimTopBar — used on /buildings/:id/simulate */
export function SimTopBar({ building, algorithm, setAlgorithm, weather, useWeather }) {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const tstr = time.toLocaleTimeString('en-GB');
  const w = weather || { wind_speed_ms: '—', wind_direction_deg: 0, temperature_c: '—', humidity_pct: '—' };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand" onClick={() => navigate('/')}>
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
              <line x1="2" y1="9" x2="22" y2="9" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
              <line x1="2" y1="16" x2="22" y2="16" stroke="var(--accent-cyan)" strokeWidth="1.5"/>
              <circle cx="17" cy="6" r="1.5" fill="var(--accent-red)">
                <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
              </circle>
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-title mono">EVAC<span style={{color:'var(--accent-cyan)'}}>·</span>OPS</div>
            <div className="brand-sub mono">v2.4 · NetworkX · TMD</div>
          </div>
        </div>

        <div className="separator-v" />

        {building && (
          <div className="building-pill">
            <span className="status-dot" />
            <div>
              <div className="building-name">{building.name}</div>
              <div className="building-sub mono small dim">B-{String(building.id).padStart(3,'0')} · {building.address || ''}</div>
            </div>
            <button className="iconbtn" title="เปลี่ยนอาคาร" onClick={() => navigate('/')}>⇄</button>
          </div>
        )}
      </div>

      <div className="topbar-center">
        <nav className="nav-tabs">
          <button className="navtab" onClick={() => navigate('/')}>อาคาร</button>
          {building && <button className="navtab" onClick={() => navigate(`/buildings/${building.id}/edit`)}>แก้ไขแปลน</button>}
          <button className="navtab on">จำลอง</button>
        </nav>
        {setAlgorithm && (
          <div style={{display:'flex',gap:2,marginLeft:8}}>
            {['dijkstra','astar','compare'].map(a => (
              <button key={a} className={`navtab ${algorithm === a ? 'on' : ''}`}
                onClick={() => setAlgorithm(a)} style={{fontSize:10}}>
                {a === 'dijkstra' ? 'Dijkstra' : a === 'astar' ? 'A*' : 'Compare'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div className="status-block">
          <span className="mono small dim">WIND</span>
          <span className="mono small accent-cyan">{w.wind_speed_ms} m/s · {w.wind_direction_deg}°</span>
          <WindDial deg={w.wind_direction_deg} />
          <span className={`badge ${useWeather ? 'badge-cyan' : 'badge-amber'}`}>
            {useWeather ? 'TMD LIVE' : 'MANUAL'}
          </span>
        </div>
        <div className="status-block">
          <span className="mono small dim">{tstr}</span>
          <span className="mono small">{w.temperature_c}°C</span>
          <span className="mono small dim">RH {w.humidity_pct}</span>
        </div>
        <UserPill onLogout={() => { logout(); navigate('/login'); }} />
      </div>
    </header>
  );
}

/* ManagerTopBar — used on / (BuildingManager) */
export function ManagerTopBar({ activeTab }) {
  const navigate = useNavigate();
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
          <button className={`navtab ${!activeTab || activeTab === 'manager' ? 'on' : ''}`} onClick={() => navigate('/')}>อาคาร</button>
        </nav>
      </div>
      <div className="topbar-right">
        <div className="status-block">
          <span className="mono small dim">SYSTEM</span>
          <span className="mono small tone-lime">● OPERATIONAL</span>
        </div>
        <UserPill onLogout={() => { logout(); navigate('/login'); }} />
      </div>
    </header>
  );
}

/* EditorTopBar — used on /buildings/:id/edit */
export function EditorTopBar({ building }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand" onClick={() => navigate('/')}>
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
        {building && (
          <>
            <div className="separator-v" />
            <div className="building-pill">
              <div className="building-name">{building.name}</div>
            </div>
          </>
        )}
      </div>
      <div className="topbar-center">
        <nav className="nav-tabs">
          <button className="navtab" onClick={() => navigate('/')}>อาคาร</button>
          <button className="navtab on">แก้ไขแปลน</button>
          {building && <button className="navtab" onClick={() => navigate(`/buildings/${building.id}/simulate`)}>จำลอง</button>}
        </nav>
      </div>
      <div className="topbar-right">
        <UserPill onLogout={() => { logout(); navigate('/login'); }} />
      </div>
    </header>
  );
}

function UserPill({ onLogout }) {
  const token = localStorage.getItem('auth_token');
  return (
    <div className="user-pill">
      <div className="avatar mono">OP</div>
      <div>
        <div className="user-name">{token ? 'Operator' : 'Guest'}</div>
        <div className="user-role mono small dim">OPERATOR · L3</div>
      </div>
      {token && (
        <button className="iconbtn" title="ออกจากระบบ" onClick={onLogout} style={{marginLeft:4}}>✕</button>
      )}
    </div>
  );
}

export function Legend({ smokeOn }) {
  return (
    <div className="legend">
      <div className="legend-row"><i className="sw" style={{background:'var(--accent-lime)'}}/><span className="mono small">เส้นทางดีที่สุด</span></div>
      <div className="legend-row"><i className="sw" style={{background:'var(--accent-amber)'}}/><span className="mono small">เส้นที่เลือก</span></div>
      <div className="legend-row"><i className="sw dashed" style={{background:'var(--accent-violet)'}}/><span className="mono small">A* compare</span></div>
      <div className="legend-row"><i className="sw" style={{background:'var(--accent-red)'}}/><span className="mono small">จุดเกิดเหตุ</span></div>
      {smokeOn && (
        <>
          <div className="legend-sep" />
          <div className="legend-row"><i className="grad-smoke"/><span className="mono small">ระดับควัน</span></div>
        </>
      )}
    </div>
  );
}
