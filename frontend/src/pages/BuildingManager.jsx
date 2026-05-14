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

export default function BuildingManager() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);

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
