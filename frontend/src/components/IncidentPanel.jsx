import React, { useEffect, useState, useCallback } from 'react';
import { http } from '../api/client';
import { useBuildingEvents } from '../api/realtime';

const TYPES = [
  { value: 'fire',  label: '🔥 ไฟไหม้',    color: '#ef4444' },
  { value: 'smoke', label: '💨 ควัน',       color: '#6b7280' },
  { value: 'crowd', label: '👥 คนแออัด',   color: '#f59e0b' },
];

const s = {
  container: { background: '#1e293b', borderTop: '1px solid #334155', padding: 14, maxHeight: 260, overflowY: 'auto' },
  title:  { fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  row:    { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 },
  field:  { display: 'flex', flexDirection: 'column', gap: 4 },
  label:  { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' },
  sel:    { padding: '6px 10px', borderRadius: 6, background: '#0f172a', border: '1px solid #475569', color: '#f1f5f9', fontSize: 13, cursor: 'pointer' },
  btn:    (bg) => ({ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: bg, color: '#fff' }),
  badge:  (color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 99,
    fontSize: 11, fontWeight: 600, background: color + '22', color: color, marginRight: 4,
  }),
  incRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, background: '#0f172a', marginBottom: 4 },
  incInfo: { fontSize: 12, color: '#cbd5e1' },
  resolveBtn: { fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer' },
};

export default function IncidentPanel({ buildingId, nodes = [], preselectedNode = null, onIncidentChange }) {
  const [incidents, setIncidents] = useState([]);
  const [nodeKey, setNodeKey]     = useState(preselectedNode || '');
  const [type, setType]           = useState('fire');
  const [severity, setSeverity]   = useState(0.8);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (preselectedNode) setNodeKey(preselectedNode);
  }, [preselectedNode]);

  const loadIncidents = useCallback(() => {
    if (!buildingId) return;
    http.get(`/buildings/${buildingId}/incidents`,
             { params: { active_only: true, limit: 200 } })
      .then(r => setIncidents(r.data.items ?? r.data))
      .catch(() => {});
  }, [buildingId]);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  // Live updates over WebSocket — refresh on any incident event.
  useBuildingEvents(buildingId, (ev) => {
    if (ev.type === 'incident.created' || ev.type === 'incident.resolved') {
      loadIncidents();
      onIncidentChange?.();
    }
  });

  const report = async () => {
    if (!nodeKey) { setError('กรุณาเลือก node'); return; }
    try {
      await http.post(`/buildings/${buildingId}/incidents`, {
        node_key: nodeKey, incident_type: type, severity,
      });
      setError(null);
      loadIncidents();
      onIncidentChange?.();
    } catch (e) {
      setError(e.response?.data?.detail || 'เกิดข้อผิดพลาด');
    }
  };

  const resolve = async (id) => {
    await http.patch(`/buildings/${buildingId}/incidents/${id}`);
    loadIncidents();
    onIncidentChange?.();
  };

  const typeInfo = TYPES.find(t => t.value === type) || TYPES[0];

  return (
    <div style={s.container}>
      <div style={s.title}>
        <span>⚠️ รายงานเหตุการณ์</span>
        {incidents.length > 0 && (
          <span style={{ fontSize: 12, color: '#f87171', background: '#450a0a', padding: '2px 8px', borderRadius: 99 }}>
            {incidents.length} เหตุการณ์ที่ยังเกิดอยู่
          </span>
        )}
      </div>

      {/* Report form */}
      <div style={s.row}>
        <div style={s.field}>
          <span style={s.label}>จุด / ห้อง</span>
          <select style={s.sel} value={nodeKey} onChange={e => setNodeKey(e.target.value)}>
            <option value="">-- เลือก node --</option>
            {nodes.map(n => (
              <option key={n.node_key} value={n.node_key}>{n.label || n.node_key} ({n.type})</option>
            ))}
          </select>
        </div>

        <div style={s.field}>
          <span style={s.label}>ประเภทเหตุการณ์</span>
          <select style={s.sel} value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div style={s.field}>
          <span style={s.label}>ระดับความรุนแรง ({Math.round(severity * 100)}%)</span>
          <input type="range" min={0.1} max={1} step={0.1} value={severity}
            onChange={e => setSeverity(Number(e.target.value))}
            style={{ width: 120, accentColor: typeInfo.color }} />
        </div>

        <button onClick={report} style={s.btn(typeInfo.color)}>รายงาน</button>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>}

      {/* Active incidents list */}
      {incidents.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>เหตุการณ์ที่ยังไม่ได้แก้ไข</div>
          {incidents.map(inc => {
            const t = TYPES.find(x => x.value === inc.incident_type) || TYPES[0];
            return (
              <div key={inc.id} style={s.incRow}>
                <div style={s.incInfo}>
                  <span style={s.badge(t.color)}>{t.label}</span>
                  <strong style={{ color: '#f1f5f9' }}>{inc.node_key}</strong>
                  <span style={{ color: '#64748b', marginLeft: 6 }}>
                    · ความรุนแรง {Math.round(inc.severity * 100)}%
                    · {new Date(inc.reported_at).toLocaleTimeString('th-TH')}
                  </span>
                </div>
                <button style={s.resolveBtn} onClick={() => resolve(inc.id)}>✓ แก้ไขแล้ว</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
