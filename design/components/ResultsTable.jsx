import React from 'react';

const s = {
  container: {
    background: '#1e293b', borderTop: '1px solid #334155',
    padding: 16, maxHeight: 280, overflowY: 'auto',
  },
  header: { fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 },
  table:  { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:     { textAlign: 'left', padding: '6px 10px', background: '#0f172a', color: '#64748b', borderBottom: '1px solid #334155' },
  td:     { padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#cbd5e1', verticalAlign: 'top' },
  tdBest:    { padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#22c55e', fontWeight: 700, verticalAlign: 'top' },
  tdBlocked: { padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#ef4444', verticalAlign: 'top' },
  badge:  { display: 'inline-block', padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 600, marginLeft: 6 },
  tabs:   { display: 'flex', gap: 4, marginBottom: 12 },
  tab:    { padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#0f172a', color: '#64748b', border: '1px solid #334155' },
  tabActive: { background: '#1d4ed8', color: '#fff', border: '1px solid #3b82f6' },
  pathCell: { fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' },
  evac:   { background: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 },
  statRow: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8', marginBottom: 10 },
  statBox: { background: '#0f172a', borderRadius: 6, padding: '6px 12px' },
};

function RouteRow({ route, isBest, onClick, isSelected }) {
  const tdStyle = isBest ? s.tdBest : (route.reachable ? s.td : s.tdBlocked);
  return (
    <tr style={{ background: isSelected ? '#1e3a5f' : undefined, cursor: 'pointer' }}
      onClick={() => onClick(route)}>
      <td style={tdStyle}>
        {route.exit}
        {isBest && <span style={{ ...s.badge, background: '#14532d', color: '#4ade80' }}>BEST</span>}
      </td>
      <td style={tdStyle}>
        {route.reachable
          ? <span style={{ color: '#4ade80' }}>✓ {route.cost_seconds}s ({(route.cost_seconds / 60).toFixed(1)} min)</span>
          : <span style={{ color: '#f87171' }}>✗ Unreachable</span>}
      </td>
      <td style={{ ...tdStyle, ...s.pathCell }}>{route.path.join(' → ') || '—'}</td>
      <td style={tdStyle}>{route.path.length - 1} hops</td>
      {route.nodes_visited != null && (
        <td style={{ ...tdStyle, color: '#60a5fa' }}>{route.nodes_visited}</td>
      )}
    </tr>
  );
}

export default function ResultsTable({ result, onSelectPath }) {
  const [activeTab,     setActiveTab]     = React.useState('primary');
  const [selectedRoute, setSelectedRoute] = React.useState(null);

  React.useEffect(() => {
    if (result?.primary_routes?.length > 0) {
      const best = result.primary_routes.find(r => r.reachable);
      if (best) { setSelectedRoute(best); onSelectPath?.(best.path); }
    }
  }, [result, onSelectPath]);

  if (!result) return null;

  const handleSelect = (route) => { setSelectedRoute(route); onSelectPath?.(route.path); };

  const primaryRoutes  = result.primary_routes || [];
  const hasNodesVisited = primaryRoutes.some(r => r.nodes_visited != null);
  const dijkstraRoutes = result.comparison?.dijkstra || [];
  const astarRoutes    = result.comparison?.astar    || [];
  const timing         = result.comparison?.timing_ms || {};
  const nodesVisited   = result.comparison?.nodes_visited || {};
  const evac           = result.evacuation_estimate;

  const tabs = [
    { key: 'primary', label: `เส้นทาง ${primaryRoutes[0]?.algorithm?.toUpperCase() || 'หลัก'}` },
    ...(result.comparison ? [{ key: 'compare', label: 'เปรียบเทียบอัลกอริทึม' }] : []),
    ...(evac ? [{ key: 'evac', label: 'ประมาณเวลาอพยพ' }] : []),
  ];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span>ผลการจำลอง</span>
        {result.smoke_blocked_edges?.length > 0 && (
          <span style={{ ...s.badge, background: '#422006', color: '#fbbf24' }}>
            💨 มี {result.smoke_blocked_edges.length} เส้นถูกควันปิดกั้น
          </span>
        )}
        {result.removed_exits?.length > 0 && (
          <span style={{ ...s.badge, background: '#450a0a', color: '#f87171' }}>
            ✗ ปิดทางออก {result.removed_exits.join(', ')}
          </span>
        )}
      </div>

      <div style={s.tabs}>
        {tabs.map(t => (
          <button key={t.key}
            style={{ ...s.tab, ...(activeTab === t.key ? s.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Primary Routes */}
      {activeTab === 'primary' && (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>ทางออก</th>
              <th style={s.th}>เวลา</th>
              <th style={s.th}>เส้นทาง</th>
              <th style={s.th}>จำนวนช่วง</th>
              {hasNodesVisited && <th style={s.th}>node ที่สำรวจ</th>}
            </tr>
          </thead>
          <tbody>
            {primaryRoutes.map((r, i) => (
              <RouteRow key={r.exit} route={r}
                isBest={i === 0 && r.reachable}
                onClick={handleSelect}
                isSelected={selectedRoute?.exit === r.exit} />
            ))}
          </tbody>
        </table>
      )}

      {/* Algorithm Comparison — includes nodes_visited (Feature 1) */}
      {activeTab === 'compare' && result.comparison && (
        <div>
          <div style={s.statRow}>
            <div style={s.statBox}>
              <span style={{ color: '#60a5fa' }}>Dijkstra</span>
              {' '}{timing.dijkstra?.toFixed(2)} ms · {nodesVisited.dijkstra ?? '—'} nodes visited
            </div>
            <div style={s.statBox}>
              <span style={{ color: '#a78bfa' }}>A*</span>
              {' '}{timing.astar?.toFixed(2)} ms · {nodesVisited.astar ?? '—'} nodes visited
            </div>
            {nodesVisited.dijkstra != null && nodesVisited.astar != null && (
              <div style={s.statBox}>
                A* สำรวจน้อยกว่า{' '}
                <strong style={{ color: '#4ade80' }}>
                  {Math.round((1 - nodesVisited.astar / Math.max(nodesVisited.dijkstra, 1)) * 100)}%
                </strong>
              </div>
            )}
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>ทางออก</th>
                <th style={{ ...s.th, color: '#60a5fa' }}>เวลา Dijkstra</th>
                <th style={{ ...s.th, color: '#60a5fa' }}>D nodes</th>
                <th style={{ ...s.th, color: '#a78bfa' }}>เวลา A*</th>
                <th style={{ ...s.th, color: '#a78bfa' }}>A* nodes</th>
                <th style={s.th}>Δ เวลา</th>
              </tr>
            </thead>
            <tbody>
              {dijkstraRoutes.map((dr) => {
                const ar    = astarRoutes.find(r => r.exit === dr.exit);
                const delta = dr.cost_seconds != null && ar?.cost_seconds != null
                  ? (dr.cost_seconds - ar.cost_seconds).toFixed(2)
                  : '—';
                return (
                  <tr key={dr.exit} style={{ cursor: 'pointer' }} onClick={() => handleSelect(dr)}>
                    <td style={s.td}>{dr.exit}</td>
                    <td style={{ ...s.td, color: '#60a5fa' }}>
                      {dr.reachable ? `${dr.cost_seconds}s` : <span style={{ color: '#f87171' }}>✗</span>}
                    </td>
                    <td style={{ ...s.td, color: '#60a5fa' }}>{dr.nodes_visited ?? '—'}</td>
                    <td style={{ ...s.td, color: '#a78bfa' }}>
                      {ar?.reachable ? `${ar.cost_seconds}s` : <span style={{ color: '#f87171' }}>✗</span>}
                    </td>
                    <td style={{ ...s.td, color: '#a78bfa' }}>{ar?.nodes_visited ?? '—'}</td>
                    <td style={s.td}>{delta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Evacuation estimate */}
      {activeTab === 'evac' && evac && (
        <div>
          <div style={s.evac}>
            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 15 }}>
              ⏱ เวลาอพยพรวม: {evac.overall_seconds} วินาที
              ({(evac.overall_seconds / 60).toFixed(1)} นาที)
            </div>
            <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 11 }}>
              อัลกอริทึม: {evac.algorithm} · กรณีคนสุดท้ายที่ออกได้
            </div>
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>ห้อง</th>
                <th style={s.th}>ทางออกที่ดีที่สุด</th>
                <th style={s.th}>เวลา (วินาที)</th>
                <th style={s.th}>จำนวนช่วง</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(evac.per_room).map(([room, route]) => (
                <tr key={room}>
                  <td style={s.td}>{room}</td>
                  <td style={s.td}>{route?.exit || '—'}</td>
                  <td style={route?.reachable ? s.td : s.tdBlocked}>
                    {route?.reachable ? route.cost_seconds : '✗'}
                  </td>
                  <td style={s.td}>{route?.path?.length ? route.path.length - 1 : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
