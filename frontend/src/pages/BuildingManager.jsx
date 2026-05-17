/**
 * BuildingManager — EVAC·OPS hi-fi design.
 * Route: /
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../api/client';
import { ManagerTopBar } from '../js/TopBar';
import '../styles.css';

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

function BuildingCard({ b, onEdit, onSimulate, onDelete }) {
  const nodeCount = b.node_count || b.nodes || 0;
  const edgeCount = b.edge_count || b.edges || 0;
  const score = b.safety_score ?? b.score ?? '—';
  const grade = b.safety_grade || b.grade || '—';
  const gradeColor = { A: 'lime', B: 'cyan', C: 'amber', D: 'amber', F: 'red' }[grade] || 'ink';
  const floors = Math.max(2, Math.min(5, Math.round(nodeCount / 12)));

  return (
    <div className="b-card">
      <div className="b-card-thumb">
        <BuildingMiniMap floors={floors} />
        <div className={`b-grade tone-${gradeColor}`}>
          <span className="mono big-grade">{grade}</span>
          <span className="mono micro dim">SCORE {score}</span>
        </div>
      </div>
      <div className="b-card-body">
        <div className="b-card-name">{b.name}</div>
        {b.address && <div className="b-card-sub mono small dim">📍 {b.address}</div>}
        <div className="b-card-stats">
          <div><span className="mono small">{nodeCount}</span> <span className="mono micro dim">NODES</span></div>
          <div><span className="mono small">{edgeCount}</span> <span className="mono micro dim">EDGES</span></div>
          <div><span className="mono small">{b.description?.match(/\d+ ชั้น/)?.[0] || '—'}</span></div>
        </div>
        <div className="b-card-meta mono micro dim">
          สร้าง: {b.created_at ? new Date(b.created_at).toLocaleDateString('th-TH') : '—'}
        </div>
      </div>
      <div className="b-card-foot">
        <button className="ghost-btn mono small" onClick={onEdit}>✎ EDIT</button>
        <button className="primary-btn small" onClick={onSimulate}>▶ SIMULATE</button>
        <button className="icon-danger" title="ลบอาคาร" onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}

const JSON_PLACEHOLDER = `{
  "name": "อาคาร IT",
  "address": "คณะวิทยาศาสตร์และเทคโนโลยี",
  "description": "3 ชั้น 90 คน",
  "nodes": [
    {"node_key": "r101", "type": "room", "label": "ห้อง 101", "x": 220, "y": 610, "capacity": 30, "floor_number": 1},
    {"node_key": "c1",   "type": "corridor", "label": "ทางเดิน 1", "x": 480, "y": 700, "capacity": 0,  "floor_number": 1},
    {"node_key": "e1",   "type": "exit",     "label": "ทางออก 1",  "x": 30,  "y": 700, "capacity": 0,  "floor_number": 1}
  ],
  "edges": [
    {"u_key": "r101", "v_key": "c1", "distance_m": 12, "width_m": 2, "is_stair": false},
    {"u_key": "c1",   "v_key": "e1", "distance_m": 15, "width_m": 3, "is_stair": false}
  ]
}`;

export default function BuildingManager() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [filter, setFilter]       = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText]   = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [jsonSuccess, setJsonSuccess] = useState(null);
  const [addOpen, setAddOpen]     = useState(false);
  const [newName, setNewName]     = useState('');
  const [newAddr, setNewAddr]     = useState('');
  const [newDesc, setNewDesc]     = useState('');
  const [addError, setAddError]   = useState(null);

  const load = () =>
    http.get('/buildings', { params: { limit: 500 } })
        .then(r => setBuildings(r.data.items ?? r.data))
        .catch(() => {});

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!newName.trim()) { setAddError('กรุณากรอกชื่ออาคาร'); return; }
    try {
      await http.post('/buildings', { name: newName.trim(), address: newAddr, description: newDesc });
      setNewName(''); setNewAddr(''); setNewDesc(''); setAddError(null); setAddOpen(false);
      load();
    } catch (e) {
      setAddError(e.response?.data?.detail || 'เกิดข้อผิดพลาด');
    }
  };

  const importJson = async () => {
    setJsonError(null); setJsonSuccess(null);
    let payload;
    try { payload = JSON.parse(jsonText); }
    catch { setJsonError('JSON ไม่ถูกต้อง — ตรวจสอบ syntax อีกครั้ง'); return; }
    try {
      const { data } = await http.post('/buildings/import', payload);
      setJsonSuccess(`✓ นำเข้าสำเร็จ: "${data.name}" (${data.nodes_created} nodes, ${data.edges_created} edges)`);
      setJsonText('');
      setImportOpen(false);
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
    await http.delete(`/buildings/${id}`);
    load();
  };

  const filtered = buildings.filter(b =>
    b.name.toLowerCase().includes(filter.toLowerCase()) ||
    (b.address || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="screen-page">
      <ManagerTopBar activeTab="manager" />

      <div className="page-body">
        <header className="page-header">
          <div>
            <div className="mono micro dim">FACILITY OPS · BUILDINGS</div>
            <h1 className="page-title">อาคารทั้งหมด</h1>
            <div className="mono small dim">{buildings.length} อาคาร</div>
          </div>
          <div className="header-actions">
            <button className="ghost-btn mono small" onClick={() => { setImportOpen(o => !o); setJsonError(null); setJsonSuccess(null); }}>
              {importOpen ? '▴ ปิด JSON' : '⬆ นำเข้า JSON'}
            </button>
            <button className="primary-btn small" onClick={() => setAddOpen(o => !o)}>+ เพิ่มอาคาร</button>
          </div>
        </header>

        <div className="filter-bar">
          <span className="mono micro dim">FILTER</span>
          <input className="filter-input" placeholder="ค้นหาด้วยชื่อ / ที่อยู่…"
            value={filter} onChange={e => setFilter(e.target.value)} />
        </div>

        {addOpen && (
          <div className="import-card">
            <div className="import-card-head">
              <span className="mono small">เพิ่มอาคารใหม่</span>
              <span className="mono micro dim">กรอกข้อมูลเพื่อเพิ่มอาคาร</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,padding:'0 0 8px'}}>
              <input className="input" placeholder="ชื่ออาคาร *" value={newName} onChange={e => setNewName(e.target.value)} />
              <input className="input" placeholder="ที่อยู่" value={newAddr} onChange={e => setNewAddr(e.target.value)} />
              <input className="input" placeholder="รายละเอียด เช่น 3 ชั้น 90 คน" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              {addError && <div className="mono small" style={{color:'var(--accent-red)'}}>⚠ {addError}</div>}
            </div>
            <div className="import-card-foot">
              <button className="ghost-btn mono small" onClick={() => setAddOpen(false)}>ยกเลิก</button>
              <span style={{marginLeft:'auto'}} />
              <button className="primary-btn small" onClick={create}>+ เพิ่มอาคาร</button>
            </div>
          </div>
        )}

        {importOpen && (
          <div className="import-card">
            <div className="import-card-head">
              <span className="mono small">JSON IMPORT</span>
              <span className="mono micro dim">name, nodes[], edges[]</span>
            </div>
            <textarea className="json-area" rows="6"
              placeholder={JSON_PLACEHOLDER}
              value={jsonText}
              onChange={e => setJsonText(e.target.value)} />
            {jsonError   && <div className="mono small" style={{color:'var(--accent-red)',padding:'4px 0'}}>⚠ {jsonError}</div>}
            {jsonSuccess && <div className="mono small" style={{color:'var(--accent-lime)',padding:'4px 0'}}>{jsonSuccess}</div>}
            <div className="import-card-foot">
              <label className="ghost-btn mono small" style={{cursor:'pointer'}}>
                📂 เลือกไฟล์
                <input type="file" accept=".json,application/json" style={{display:'none'}} onChange={loadJsonFile} />
              </label>
              <span className="mono micro dim">หรือลากวางที่นี่</span>
              <span style={{marginLeft:'auto'}} />
              <button className="primary-btn small" onClick={importJson} disabled={!jsonText.trim()}>⬆ Import อาคาร</button>
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--ink-3)'}}>
            <div className="mono small dim">ยังไม่มีอาคาร — เพิ่มอาคารแรกได้เลย</div>
          </div>
        )}

        <div className="building-grid">
          {filtered.map(b => (
            <BuildingCard
              key={b.id} b={b}
              onEdit={() => navigate(`/buildings/${b.id}/edit`)}
              onSimulate={() => navigate(`/buildings/${b.id}/simulate`)}
              onDelete={() => remove(b.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
