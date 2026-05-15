import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const s = {
  page:    { minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'sans-serif' },
  header:  { background: '#1e293b', borderBottom: '1px solid #334155', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16 },
  title:   { fontSize: 18, fontWeight: 700, color: '#f8fafc' },
  content: { padding: 28, maxWidth: 900, margin: '0 auto' },
  section: { background: '#1e293b', borderRadius: 10, padding: 20, marginBottom: 24 },
  label:   { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' },
  input:   { width: '100%', padding: '8px 12px', borderRadius: 6, background: '#0f172a', border: '1px solid #475569', color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 },
  btn:     { padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnPrimary: { background: '#3b82f6', color: '#fff' },
  btnDanger:  { background: '#ef4444', color: '#fff' },
  btnGhost:   { background: '#334155', color: '#cbd5e1' },
  card:    { background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #334155' },
  cardName: { fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 2 },
  cardSub:  { fontSize: 12, color: '#64748b' },
  error:   { color: '#f87171', fontSize: 13, marginTop: 8 },
  actions: { display: 'flex', gap: 8 },
};

const JSON_PLACEHOLDER = `{
  "name": "อาคาร IT",
  "address": "คณะวิทยาศาสตร์และเทคโนโลยี",
  "description": "3 ชั้น 90 คน",
  "nodes": [
    {"node_key": "r101", "type": "room",     "label": "ห้อง 101",   "x": 100, "y": 480, "capacity": 30, "floor_number": 1},
    {"node_key": "c1",   "type": "corridor", "label": "ทางเดิน 1", "x": 280, "y": 500, "capacity": 0,  "floor_number": 1},
    {"node_key": "e1",   "type": "exit",     "label": "ทางออก 1",  "x": 480, "y": 500, "capacity": 0,  "floor_number": 1}
  ],
  "edges": [
    {"u_key": "r101", "v_key": "c1", "distance_m": 12, "width_m": 2, "is_stair": false},
    {"u_key": "c1",   "v_key": "e1", "distance_m": 15, "width_m": 3, "is_stair": false}
  ]
}`;

export default function BuildingManager() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [jsonSuccess, setJsonSuccess] = useState(null);
  const [jsonOpen, setJsonOpen] = useState(false);

  const load = () =>
    axios.get(`${API}/buildings`).then(r => setBuildings(r.data)).catch(() => {});

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { setError('กรุณากรอกชื่ออาคาร'); return; }
    try {
      await axios.post(`${API}/buildings`, { name: name.trim(), address, description });
      setName(''); setAddress(''); setDescription(''); setError(null);
      load();
    } catch (e) {
      setError(e.response?.data?.detail || 'เกิดข้อผิดพลาด');
    }
  };

  const importJson = async () => {
    setJsonError(null); setJsonSuccess(null);
    let payload;
    try { payload = JSON.parse(jsonText); }
    catch { setJsonError('JSON ไม่ถูกต้อง — ตรวจสอบ syntax อีกครั้ง'); return; }
    try {
      const { data } = await axios.post(`${API}/buildings/import`, payload);
      setJsonSuccess(`✓ นำเข้าสำเร็จ: "${data.name}" (${data.nodes_created} nodes, ${data.edges_created} edges)`);
      setJsonText('');
      load();
    } catch (e) {
      setJsonError(e.response?.data?.detail || 'นำเข้าไม่สำเร็จ');
    }
  };

  const loadJsonFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setJsonText(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  };

  const remove = async (id) => {
    if (!window.confirm('ลบอาคารนี้? ข้อมูลทั้งหมดจะหายถาวร')) return;
    await axios.delete(`${API}/buildings/${id}`);
    load();
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.title}>🏢 ระบบแผนผังอาคาร</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>Building Evacuation Simulation v2</span>
      </div>

      <div style={s.content}>
        {/* Create form */}
        <div style={s.section}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#f1f5f9' }}>เพิ่มอาคารใหม่</div>
          <label style={s.label}>ชื่ออาคาร *</label>
          <input style={s.input} placeholder="เช่น อาคาร A, ตึก IT" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()} />
          <label style={s.label}>ที่อยู่</label>
          <input style={s.input} placeholder="เช่น 123 ถ.พหลโยธิน กรุงเทพ" value={address}
            onChange={e => setAddress(e.target.value)} />
          <label style={s.label}>รายละเอียด</label>
          <input style={s.input} placeholder="เช่น 3 ชั้น 90 คน" value={description}
            onChange={e => setDescription(e.target.value)} />
          {error && <div style={s.error}>⚠ {error}</div>}
          <button style={{ ...s.btn, ...s.btnPrimary, marginTop: 8 }} onClick={create}>+ เพิ่มอาคาร</button>
        </div>

        {/* JSON Import */}
        <div style={s.section}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: jsonOpen ? 14 : 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>📥 นำเข้าจาก JSON</div>
            <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12 }} onClick={() => { setJsonOpen(o => !o); setJsonError(null); setJsonSuccess(null); }}>
              {jsonOpen ? '▲ ซ่อน' : '▼ เปิด'}
            </button>
          </div>

          {jsonOpen && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <label style={{ ...s.btn, ...s.btnGhost, fontSize: 12, cursor: 'pointer' }}>
                  📂 เลือกไฟล์ .json
                  <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={loadJsonFile} />
                </label>
                <span style={{ fontSize: 12, color: '#475569' }}>หรือวาง JSON ด้านล่าง</span>
              </div>
              <textarea
                style={{
                  ...s.input, fontFamily: 'monospace', fontSize: 12,
                  height: 220, resize: 'vertical', marginBottom: 4,
                }}
                placeholder={JSON_PLACEHOLDER}
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
              />
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>
                fields ที่ต้องการ: <code style={{ color: '#94a3b8' }}>name</code>,{' '}
                <code style={{ color: '#94a3b8' }}>nodes[]</code> (node_key, type, label, x, y, capacity, floor_number),{' '}
                <code style={{ color: '#94a3b8' }}>edges[]</code> (u_key, v_key, distance_m, width_m, is_stair)
              </div>
              {jsonError   && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>⚠ {jsonError}</div>}
              {jsonSuccess && <div style={{ color: '#4ade80', fontSize: 13, marginBottom: 8 }}>{jsonSuccess}</div>}
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={importJson} disabled={!jsonText.trim()}>
                ⬆ Import อาคาร
              </button>
            </>
          )}
        </div>

        {/* Building list */}
        <div style={s.section}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#f1f5f9' }}>
            อาคารทั้งหมด ({buildings.length})
          </div>
          {buildings.length === 0 && (
            <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>ยังไม่มีอาคาร — เพิ่มอาคารแรกได้เลย</div>
          )}
          {buildings.map(b => (
            <div key={b.id} style={s.card}>
              <div>
                <div style={s.cardName}>{b.name}</div>
                {b.address && <div style={s.cardSub}>📍 {b.address}</div>}
                {b.description && <div style={s.cardSub}>📝 {b.description}</div>}
                <div style={{ ...s.cardSub, marginTop: 2 }}>
                  สร้าง: {new Date(b.created_at).toLocaleDateString('th-TH')}
                </div>
              </div>
              <div style={s.actions}>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => navigate(`/buildings/${b.id}/edit`)}>
                  ✏️ แก้ไขแปลน
                </button>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => navigate(`/buildings/${b.id}/simulate`)}>
                  🚨 จำลองอพยพ
                </button>
                <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => remove(b.id)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
