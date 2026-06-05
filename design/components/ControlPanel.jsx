import React from 'react';

const ALL_NODES = [
  'r101','r102','r103','c1','stair_a_f1','stair_b_f1',
  'r201','r202','r203','c2','stair_a_f2','stair_b_f2',
  'r301','r302','r303','c3','stair_a_f3','stair_b_f3',
];
const EXITS = ['exit1','exit2','exit3'];
const ROOMS = ALL_NODES.filter(n => n.startsWith('r'));

const s = {
  panel: {
    width: 320,
    background: '#1e293b',
    borderRight: '1px solid #334155',
    padding: 20,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  title: { fontSize: 18, fontWeight: 700, color: '#f8fafc', marginBottom: 4 },
  section: { background: '#0f172a', borderRadius: 8, padding: 14 },
  label: { fontSize: 12, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    background: '#1e293b', border: '1px solid #475569', color: '#f1f5f9',
    fontSize: 14, cursor: 'pointer',
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  toggle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' },
  checkbox: { width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' },
  btn: {
    width: '100%', padding: '10px 0', borderRadius: 8,
    background: '#ef4444', border: 'none', color: '#fff',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    transition: 'background 0.2s',
  },
  btnDisabled: { background: '#475569', cursor: 'not-allowed' },
  sliderRow: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 },
  sliderLabel: { fontSize: 12, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' },
  slider: { width: '100%', accentColor: '#3b82f6' },
  tag: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    background: '#1e3a5f', color: '#60a5fa', fontSize: 12, marginRight: 4, marginBottom: 4, cursor: 'pointer',
  },
  tagActive: { background: '#1d4ed8', color: '#fff' },
  weatherBox: { background: '#0f172a', borderRadius: 6, padding: 10, fontSize: 12, color: '#94a3b8', lineHeight: 1.7 },
};

export default function ControlPanel({ onEvacuate, loading, weather, nodes: dbNodes = null }) {
  // Support both hardcoded (legacy) and DB-backed nodes
  const dynamicNodes = dbNodes && dbNodes.length > 0 ? dbNodes.map(n => n.node_key) : ALL_NODES;
  const dynamicExits = dbNodes && dbNodes.length > 0
    ? dbNodes.filter(n => n.type === 'exit').map(n => n.node_key)
    : EXITS;
  const dynamicRooms = dbNodes && dbNodes.length > 0
    ? dbNodes.filter(n => n.type === 'room').map(n => n.node_key)
    : ROOMS;
  const dynamicCorridors = dbNodes && dbNodes.length > 0
    ? dbNodes.filter(n => n.type === 'corridor').map(n => n.node_key)
    : ['c1','c2','c3'];

  const [fireLocation, setFireLocation] = React.useState(dynamicNodes[0] || 'r201');
  const [algorithm, setAlgorithm] = React.useState('dijkstra');
  const [blockedExits, setBlockedExits] = React.useState([]);
  const [useWeather, setUseWeather] = React.useState(true);
  const [manualWind, setManualWind] = React.useState(135);
  const [manualWindSpeed, setManualWindSpeed] = React.useState(3.5);
  const [crowdDensities, setCrowdDensities] = React.useState({});
  const [compareAlgo, setCompareAlgo] = React.useState(true);
  const [occupiedRooms, setOccupiedRooms] = React.useState(['r101','r201','r301']);

  const toggleExit = (exit) => {
    setBlockedExits(prev =>
      prev.includes(exit) ? prev.filter(e => e !== exit) : [...prev, exit]
    );
  };

  const toggleRoom = (room) => {
    setOccupiedRooms(prev =>
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
  };

  const handleSubmit = () => {
    onEvacuate({
      fire_location: fireLocation,
      algorithm,
      blocked_exits: blockedExits,
      use_weather_wind: useWeather,
      manual_wind_direction: manualWind,
      manual_wind_speed: manualWindSpeed,
      crowd_densities: Object.entries(crowdDensities).map(([node_key, density]) => ({ node_key, density })),
      compare_algorithms: compareAlgo,
      occupied_rooms: occupiedRooms,
    });
  };

  return (
    <div style={s.panel}>
      <div>
        <div style={s.title}>🏢 ระบบจำลองการอพยพ</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {dynamicNodes.length} จุด · NetworkX · Dijkstra/A*
        </div>
      </div>

      {/* Fire location */}
      <div style={s.section}>
        <div style={s.label}>จุดเกิดเหตุไฟไหม้</div>
        <select style={s.select} value={fireLocation} onChange={e => setFireLocation(e.target.value)}>
          {dynamicNodes.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Algorithm */}
      <div style={s.section}>
        <div style={s.label}>อัลกอริทึมหลัก</div>
        <select style={s.select} value={algorithm} onChange={e => setAlgorithm(e.target.value)}>
          <option value="dijkstra">Dijkstra (รับประกันสั้นที่สุด)</option>
          <option value="astar">A* (ใช้ heuristic ช่วยค้น)</option>
        </select>
        <div style={{ ...s.toggle, marginTop: 10 }}>
          <input type="checkbox" style={s.checkbox} checked={compareAlgo}
            onChange={e => setCompareAlgo(e.target.checked)} id="cmpAlgo" />
          <label htmlFor="cmpAlgo">แสดงตารางเปรียบเทียบ</label>
        </div>
      </div>

      {/* Blocked exits */}
      <div style={s.section}>
        <div style={s.label}>ปิดทางออก (จำลองความเสียหาย)</div>
        <div>
          {dynamicExits.map(e => (
            <span key={e} style={{ ...s.tag, ...(blockedExits.includes(e) ? s.tagActive : {}) }}
              onClick={() => toggleExit(e)}>
              {blockedExits.includes(e) ? '✗ ' : ''}{e}
            </span>
          ))}
        </div>
      </div>

      {/* Crowd density */}
      <div style={s.section}>
        <div style={s.label}>ความหนาแน่นฝูงชน</div>
        {[
          { group: 'ทางเดิน', nodes: dynamicCorridors },
          { group: 'ห้อง',   nodes: dynamicRooms },
        ].filter(g => g.nodes.length > 0).map(({ group, nodes }) => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>{group}</div>
            {nodes.map(node => (
              <div key={node} style={s.sliderRow}>
                <div style={s.sliderLabel}>
                  <span>{node}</span>
                  <span>{Math.round((crowdDensities[node] || 0) * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} style={s.slider}
                  value={crowdDensities[node] || 0}
                  onChange={e => setCrowdDensities(prev => ({ ...prev, [node]: parseFloat(e.target.value) }))} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Occupied rooms */}
      <div style={s.section}>
        <div style={s.label}>ห้องที่มีคน (สำหรับประเมินเวลา)</div>
        <div>
          {dynamicRooms.map(r => (
            <span key={r} style={{ ...s.tag, ...(occupiedRooms.includes(r) ? s.tagActive : {}) }}
              onClick={() => toggleRoom(r)}>
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* Weather */}
      <div style={s.section}>
        <div style={s.label}>ลม / การลามของควัน</div>
        <div style={s.toggle}>
          <input type="checkbox" style={s.checkbox} checked={useWeather}
            onChange={e => setUseWeather(e.target.checked)} id="useWx" />
          <label htmlFor="useWx">ใช้ข้อมูลจริงจาก TMD</label>
        </div>
        {!useWeather && (
          <div style={{ marginTop: 10 }}>
            <div style={s.sliderRow}>
              <div style={s.sliderLabel}><span>ทิศทางลม</span><span>{manualWind}°</span></div>
              <input type="range" min={0} max={359} step={1} style={s.slider}
                value={manualWind} onChange={e => setManualWind(Number(e.target.value))} />
            </div>
            <div style={s.sliderRow}>
              <div style={s.sliderLabel}><span>ความเร็วลม</span><span>{manualWindSpeed} m/s</span></div>
              <input type="range" min={0} max={20} step={0.5} style={s.slider}
                value={manualWindSpeed} onChange={e => setManualWindSpeed(Number(e.target.value))} />
            </div>
          </div>
        )}
        {weather && (
          <div style={{ ...s.weatherBox, marginTop: 10 }}>
            <div>💨 ลม: {weather.wind_speed_ms} m/s ทิศ {weather.wind_direction_deg}°</div>
            <div>🌡️ อุณหภูมิ: {weather.temperature_c}°C · RH: {weather.humidity_pct}%</div>
            <div>📡 แหล่งข้อมูล: {weather.source} · สถานี {weather.station}</div>
            {weather.description && <div>☁️ {weather.description}</div>}
          </div>
        )}
      </div>

      <button
        style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'กำลังจำลอง…' : '🚨 เริ่มจำลองอพยพ'}
      </button>
    </div>
  );
}
