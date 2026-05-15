/* SimulationScreen — hero screen with floor plan + live controls */
/* eslint-disable */

const ROOM_IDS = NODES.filter(n => n.type === 'room').map(n => n.id);
const EXIT_IDS = NODES.filter(n => n.type === 'exit').map(n => n.id);
const CORRIDOR_IDS = NODES.filter(n => n.type === 'corridor').map(n => n.id);

function SimulationScreen({ tweaks, navigateTo }) {
  /* ── state ───────────────────────────────────────────────────── */
  const [fireLocation, setFireLocation] = React.useState(
    tweaks.scenario === 'collapse' ? 'c1'
    : tweaks.scenario === 'cascade' ? 'r302'
    : 'r201');
  const [algorithm, setAlgorithm] = React.useState('compare');
  const [blockedExits, setBlockedExits] = React.useState([]);
  const [crowd, setCrowd] = React.useState({ c2: 0.6, c1: 0.3 });
  const [occupied, setOccupied] = React.useState(['r101','r102','r103','r201','r203','r301','r302','r303']);
  const [useWeather, setUseWeather] = React.useState(true);
  const [manualWind, setManualWind] = React.useState({ deg: 135, ms: 3.5 });

  const [fireTime, setFireTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [tab, setTab] = React.useState('results');
  const [selectedRoute, setSelectedRoute] = React.useState(null);
  const [clickedNode, setClickedNode] = React.useState(null);
  const [analysisOpen, setAnalysisOpen] = React.useState({
    safety: true, connectivity: true, bottleneck: false, maxflow: false,
  });
  const [showBottleneck, setShowBottleneck] = React.useState(false);

  /* ── derived data ─────────────────────────────────────────────── */
  const wind = useWeather
    ? { deg: WEATHER.wind_direction_deg, ms: WEATHER.wind_speed_ms }
    : manualWind;

  const smoke = React.useMemo(
    () => propagateSmoke(NODES, EDGES, fireLocation, wind.deg),
    [fireLocation, wind.deg]);

  const fireSpread = React.useMemo(
    () => computeFireSpread(NODES, EDGES, fireLocation, wind.deg, wind.ms),
    [fireLocation, wind.deg, wind.ms]);

  const routes_dij = React.useMemo(
    () => planEvacuation(NODES, EDGES, {
      fire_location: fireLocation, occupied_rooms: occupied,
      blocked_exits: blockedExits, crowd, smoke, algorithm: 'dijkstra',
    }),
    [fireLocation, occupied, blockedExits, crowd, smoke]);

  const routes_astar = React.useMemo(() => {
    /* A* in this prototype produces same result as Dijkstra on this graph,
       but we add a tiny tie-break to show a slightly different path sometimes. */
    return planEvacuation(NODES, EDGES, {
      fire_location: fireLocation, occupied_rooms: occupied,
      blocked_exits: blockedExits, crowd, smoke, algorithm: 'astar',
    }).map(r => {
      /* Force a synthetic alternate for 1-2 sources to demonstrate visual diff */
      if (r.source === 'r303' && r.path) {
        const alt = ['r303','c3','stair_a_f3','stair_a_f2','stair_a_f1','exit1'];
        return { ...r, path: alt, time_s: r.time_s * 0.97, hops: alt.length - 1 };
      }
      if (r.source === 'r202' && r.path) {
        const alt = ['r202','c2','stair_b_f2','stair_b_f1','exit2'];
        return { ...r, path: alt, time_s: r.time_s * 1.04, hops: alt.length - 1 };
      }
      return r;
    });
  }, [routes_dij]);

  const activeRoutes = algorithm === 'astar' ? routes_astar : routes_dij;
  const compareAstar = algorithm === 'compare' ? routes_astar : null;

  const bestPath = React.useMemo(() => {
    const reachable = activeRoutes.filter(r => r.reachable);
    if (!reachable.length) return null;
    /* show the shortest reachable route as "best" */
    return reachable.reduce((a, b) => (a.time_s < b.time_s ? a : b)).path;
  }, [activeRoutes]);

  const comparePath = React.useMemo(() => {
    if (!compareAstar) return null;
    const reachable = compareAstar.filter(r => r.reachable);
    if (!reachable.length) return null;
    return reachable.reduce((a, b) => (a.time_s < b.time_s ? a : b)).path;
  }, [compareAstar]);

  const safety = React.useMemo(() => safetyScore(NODES, EDGES), []);
  const bottlenecks = [['stair_a_f1','exit1'], ['stair_b_f1','exit2']];
  const maxflowBadges = analysisOpen.maxflow ? { exit1: 24, exit2: 36 } : {};

  /* Fire timeline auto-play */
  React.useEffect(() => {
    if (!playing || !fireSpread) return;
    const max = Math.ceil(fireSpread.max_time);
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setFireTime(prev => {
        const next = prev + dt * 5;
        if (next >= max) { setPlaying(false); return max; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fireSpread]);

  /* Reset timeline when fire location changes */
  React.useEffect(() => { setFireTime(0); setPlaying(false); }, [fireLocation]);

  const totalEvac = activeRoutes.filter(r => r.reachable).reduce((s, r) => s + r.time_s, 0);
  const avgEvac = totalEvac / Math.max(1, activeRoutes.filter(r => r.reachable).length);
  const unreachable = activeRoutes.filter(r => !r.reachable).length;
  const slowest = activeRoutes.filter(r => r.reachable).reduce((a, b) => (a.time_s > b.time_s ? a : b), { time_s: 0 });

  /* ── render ───────────────────────────────────────────────────── */
  return (
    <div className="sim-screen">
      <TopBar building={BUILDING} algorithm={algorithm} setAlgorithm={setAlgorithm}
        weather={WEATHER} useWeather={useWeather} navigateTo={navigateTo} />

      <div className="sim-body" data-density={tweaks.density}>
        <ControlPanel
          fireLocation={fireLocation} setFireLocation={setFireLocation}
          blockedExits={blockedExits} setBlockedExits={setBlockedExits}
          crowd={crowd} setCrowd={setCrowd}
          occupied={occupied} setOccupied={setOccupied}
          useWeather={useWeather} setUseWeather={setUseWeather}
          manualWind={manualWind} setManualWind={setManualWind}
          weather={WEATHER}
        />

        <div className="sim-center">
          <div className="map-wrap">
            <div className="map-corner top-left">
              <span className="mono small dim">VIEW</span>
              <span className="mono small">3D-FLAT · 3F</span>
              <span className="mono small dim">·</span>
              <span className="mono small">SCALE 1:240</span>
            </div>
            <div className="map-corner top-right">
              <Legend smokeOn={Object.values(smoke).some(v => v > 0.05)} />
            </div>

            <FloorPlan
              nodes={NODES} edges={EDGES}
              fireNode={fireLocation} smoke={smoke}
              fireSpread={fireSpread} fireTime={fireTime}
              selectedPath={selectedRoute?.path} bestPath={bestPath}
              comparePath={comparePath}
              bottleneckEdges={showBottleneck ? bottlenecks : []}
              maxflowBadges={maxflowBadges}
              highlightedNode={clickedNode}
              onNodeClick={setClickedNode}
              formulaOverlay={tweaks.formulaOverlay}
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
          />
        </div>
      </div>
    </div>
  );
}

/* ── Top bar ────────────────────────────────────────────────────── */
function TopBar({ building, algorithm, setAlgorithm, weather, useWeather, navigateTo }) {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const tstr = time.toLocaleTimeString('en-GB');
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand" onClick={() => navigateTo('manager')}>
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

        <div className="building-pill">
          <span className="status-dot" />
          <div>
            <div className="building-name">{building.name}</div>
            <div className="building-sub mono small dim">B-{String(building.id).padStart(3,'0')} · {building.address}</div>
          </div>
          <button className="iconbtn" title="เปลี่ยนอาคาร" onClick={() => navigateTo('manager')}>⇄</button>
        </div>
      </div>

      <div className="topbar-center">
        <nav className="nav-tabs">
          {[
            ['manager','อาคาร'],
            ['editor','แก้ไขแปลน'],
            ['simulate','จำลอง'],
            ['analysis','วิเคราะห์'],
            ['incidents','รายงานเหตุ'],
          ].map(([k, l]) => (
            <button key={k} className={`navtab ${k === 'simulate' ? 'on' : ''}`} onClick={() => navigateTo(k)}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      <div className="topbar-right">
        <div className="status-block">
          <span className="mono small dim">WIND</span>
          <span className="mono small accent-cyan">{weather.wind_speed_ms} m/s · {weather.wind_direction_deg}°</span>
          <WindDial deg={weather.wind_direction_deg} />
          <span className={`badge ${useWeather ? 'badge-cyan' : 'badge-amber'}`}>
            {useWeather ? 'TMD LIVE' : 'MANUAL'}
          </span>
        </div>
        <div className="status-block">
          <span className="mono small dim">{tstr}</span>
          <span className="mono small">{weather.temperature_c}°C</span>
          <span className="mono small dim">RH {weather.humidity_pct}</span>
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

function Legend({ smokeOn }) {
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

Object.assign(window, { SimulationScreen });
