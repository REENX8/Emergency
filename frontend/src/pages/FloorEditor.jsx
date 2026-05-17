/**
 * FloorEditor — EVAC·OPS hi-fi design, wired to real API.
 * Route: /buildings/:buildingId/edit
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { http } from '../api/client';
import FloorPlan from '../js/FloorPlan';
import { EditorTopBar } from '../js/TopBar';
import { Section } from '../js/Panels';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import '../styles.css';

const NODE_TYPES = ['room', 'corridor', 'stair', 'exit'];

function Prop({ k, v }) {
  return (
    <div className="prop">
      <span className="mono micro dim">{k}</span>
      <span className="mono small">{v}</span>
    </div>
  );
}

/* Simple modal overlay */
function Modal({ title, children, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 10,
        padding: 24, minWidth: 340, maxWidth: 480,
      }}>
        <div className="mono small" style={{fontWeight:700, marginBottom:16, color:'var(--ink-0)'}}>{title}</div>
        {children}
        <button onClick={onClose} className="ghost-btn mono small" style={{marginTop:12}}>ยกเลิก</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{marginBottom:10}}>
      <label className="mono micro dim" style={{display:'block',marginBottom:4}}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width:'100%', padding:'7px 10px', borderRadius:6,
  background:'var(--bg-0)', border:'1px solid var(--line-2)', color:'var(--ink-0)',
  fontSize:13, boxSizing:'border-box',
};
const selectStyle = { ...inputStyle, cursor:'pointer' };

export default function FloorEditor() {
  const { buildingId } = useParams();
  const navigate = useNavigate();

  const [building, setBuilding] = useState(null);
  const [nodes,    setNodes]    = useState([]);
  const [edges,    setEdges]    = useState([]);
  const [tool,     setTool]     = useState('select');
  const [selected, setSelected] = useState(null);
  const [showGraph, setShowGraph] = useState(true);
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState({});
  const [formErr,  setFormErr]  = useState(null);
  const [pendingEdge, setPendingEdge] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((kind, message) => setToast({ kind, message }), []);
  const askConfirm = useCallback((message, onConfirm, opts = {}) =>
    setConfirmState({ message, onConfirm, ...opts }), []);

  const load = useCallback(async () => {
    try {
      const [bRes, nRes, eRes] = await Promise.all([
        http.get(`/buildings/${buildingId}`),
        http.get(`/buildings/${buildingId}/nodes`),
        http.get(`/buildings/${buildingId}/edges`),
      ]);
      setBuilding(bRes.data);
      const rawNodes = nRes.data || [];
      const normalized = rawNodes.map(n => ({
        id: n.node_key || n.id,
        type: n.type,
        label: n.label || n.node_key,
        x: n.x || 0,
        y: n.y || 0,
        floor: n.floor_number || n.floor || 1,
        cap: n.capacity || 0,
        capacity: n.capacity || 0,
        node_key: n.node_key || n.id,
      }));
      setNodes(normalized);
      const normEdges = (eRes.data || []).map(e => ({
        u: e.u_key || e.u,
        v: e.v_key || e.v,
        distance_m: e.distance_m || 10,
        width_m: e.width_m || 2,
        is_stair: e.is_stair || false,
        id: e.id,
      }));
      setEdges(normEdges);
      if (normalized.length > 0 && !selected) {
        setSelected(normalized[0].id);
      }
    } catch (e) {
      console.error('Load failed:', e);
    }
  }, [buildingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const sel = nodes.find(n => n.id === selected);

  const handleNodeClick = useCallback((nodeId) => {
    if (tool === 'select') {
      setSelected(nodeId);
    } else if (tool === 'edge') {
      if (!pendingEdge) {
        setPendingEdge(nodeId);
      } else if (pendingEdge === nodeId) {
        setPendingEdge(null);
        const n = nodes.find(n => n.id === nodeId);
        if (n) { setForm({ ...n, node_key: n.node_key || n.id }); setModal('edit-node'); }
      } else {
        setForm({ u_key: pendingEdge, v_key: nodeId, distance_m: 10, width_m: 2, is_stair: false });
        setModal('add-edge');
        setPendingEdge(null);
      }
    } else if (tool === 'erase') {
      const n = nodes.find(n => n.id === nodeId);
      if (!n) return;
      askConfirm(
        `ลบ node "${nodeId}"? เส้นเชื่อมที่ต่ออยู่จะถูกลบด้วย`,
        async () => {
          try {
            await http.delete(`/buildings/${buildingId}/nodes/${n.node_key || n.id}`);
            setSelected(null);
            load();
            showToast('success', `ลบ node ${nodeId} แล้ว`);
          } catch (e) {
            showToast('error', e.response?.data?.detail || 'ลบไม่สำเร็จ');
          }
        },
        { destructive: true },
      );
    } else {
      setSelected(nodeId);
    }
  }, [tool, pendingEdge, nodes, buildingId, load, askConfirm, showToast]);

  const submitAddNode = async () => {
    if (!form.node_key?.trim()) { setFormErr('กรุณาระบุ Node Key'); return; }
    try {
      await http.post(`/buildings/${buildingId}/nodes`, {
        node_key: form.node_key.trim(),
        type: form.type || 'room',
        label: form.label || form.node_key.trim(),
        x: form.x || 200, y: form.y || 200,
        capacity: Number(form.capacity) || 20,
        floor_number: form.floor || 1,
      });
      setModal(null); setFormErr(null); load();
      showToast('success', `เพิ่ม node ${form.node_key} แล้ว`);
    } catch (e) { setFormErr(e.response?.data?.detail || 'เกิดข้อผิดพลาด'); }
  };

  const submitEditNode = async () => {
    const key = form.node_key || sel?.id;
    if (!key) return;
    try {
      await http.put(`/buildings/${buildingId}/nodes/${key}`, {
        label: form.label, type: form.type, capacity: Number(form.capacity),
      });
      setModal(null); setFormErr(null); load();
      showToast('success', 'บันทึกแล้ว');
    } catch (e) { setFormErr(e.response?.data?.detail || 'เกิดข้อผิดพลาด'); }
  };

  const submitAddEdge = async () => {
    try {
      await http.post(`/buildings/${buildingId}/edges`, {
        u_key: form.u_key, v_key: form.v_key,
        distance_m: Number(form.distance_m) || 10,
        width_m: Number(form.width_m) || 2,
        is_stair: !!form.is_stair,
      });
      setModal(null); setFormErr(null); load();
      showToast('success', `เพิ่ม edge ${form.u_key}↔${form.v_key} แล้ว`);
    } catch (e) { setFormErr(e.response?.data?.detail || 'เกิดข้อผิดพลาด'); }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      showToast('success', 'บันทึกสำเร็จ');
      navigate('/');
    } finally {
      setSaving(false);
    }
  };

  const tools = [
    ['select', 'คัดเลือก', '▱'],
    ['room',   'เพิ่มห้อง', '▭'],
    ['edge',   'เชื่อม edge', '—'],
    ['erase',  'ลบ', '✕'],
  ];

  return (
    <div className="screen-page">
      <EditorTopBar building={building} />

      <div className="editor-body">
        <aside className="editor-rail">
          <div className="rail-head">
            <div className="rail-head-title">
              <span className="mono micro dim">FLOOR EDITOR {building ? `· ${building.name}` : ''}</span>
              <span>เครื่องมือ</span>
            </div>
          </div>

          <div className="tool-list">
            {tools.map(([k,l,ic]) => (
              <button key={k} className={`tool-btn ${tool === k ? 'on' : ''}`} onClick={() => { setTool(k); setPendingEdge(null); }}>
                <span className="tool-icon mono">{ic}</span>
                <span>{l}</span>
                <span className="mono micro dim">{k[0].toUpperCase()}</span>
              </button>
            ))}
          </div>

          {tool === 'edge' && pendingEdge && (
            <div style={{padding:'8px 16px',background:'var(--bg-3)',margin:'0',borderBottom:'1px solid var(--line-1)'}}>
              <div className="mono micro dim" style={{marginBottom:4}}>ต้นทาง edge:</div>
              <div className="mono small accent-amber">{pendingEdge}</div>
              <div className="mono micro dim">คลิก node ปลายทาง หรือคลิกซ้ำเพื่อยกเลิก</div>
            </div>
          )}

          {tool === 'room' && (
            <div style={{padding:'14px 16px',borderBottom:'1px solid var(--line-1)'}}>
              <button className="primary-btn small" onClick={() => {
                setForm({ type:'room', node_key:'', label:'', capacity:20, floor:1, x:480, y:400 });
                setModal('add-node');
              }}>+ เพิ่ม Node ใหม่</button>
            </div>
          )}

          <Section title="เลเยอร์" sub="LAYERS">
            <div className="layer-row">
              <input type="checkbox" checked={showGraph} onChange={e => setShowGraph(e.target.checked)} />
              <span className="mono small">Graph (nodes + edges)</span>
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
                <Prop k="CAPACITY" v={`${sel.cap || sel.capacity} persons`} />
              </div>
            ) : (
              <>
                <div className="mono micro dim">ไม่มี selection</div>
                <div className="mono micro dim" style={{marginTop:6}}>คลิก node บน floor plan เพื่อเลือก</div>
              </>
            )}
            {sel && (
              <div style={{marginTop:10,display:'flex',gap:6}}>
                <button className="ghost-btn mono small" onClick={() => {
                  setForm({ ...sel, node_key: sel.node_key || sel.id });
                  setModal('edit-node');
                }}>✎ แก้ไข</button>
                <button className="ghost-btn mono small" style={{borderColor:'var(--accent-red)',color:'var(--accent-red)'}}
                  onClick={() => {
                    askConfirm(`ลบ node "${sel.id}"?`, async () => {
                      try {
                        await http.delete(`/buildings/${buildingId}/nodes/${sel.node_key || sel.id}`);
                        setSelected(null);
                        load();
                        showToast('success', `ลบ node ${sel.id} แล้ว`);
                      } catch (e) {
                        showToast('error', e.response?.data?.detail || 'ลบไม่สำเร็จ');
                      }
                    }, { destructive: true });
                  }}>🗑 ลบ</button>
              </div>
            )}
          </Section>

          <div className="rail-foot">
            <div className="save-state mono micro dim">
              <span className="status-dot dot-lime" /> {nodes.length} nodes · {edges.length} edges
            </div>
            <button className="primary-btn small" onClick={handleSaveAndExit} disabled={saving}>
              {saving ? '...' : '⬆ บันทึก & ออก'}
            </button>
            <button className="ghost-btn mono small" onClick={() => navigate(`/buildings/${buildingId}/simulate`)}>
              ▶ จำลองอพยพ
            </button>
          </div>
        </aside>

        <div className="editor-canvas">
          <div className="canvas-toolbar">
            <div className="canvas-status mono micro dim">
              {nodes.length} nodes · {edges.length} edges
              {tool === 'edge' && pendingEdge ? ` · เชื่อม edge จาก: ${pendingEdge}` : ''}
            </div>
            <div className="canvas-tool-group">
              <button className="ghost-btn mono small" onClick={load}>↻ REFRESH</button>
            </div>
          </div>
          <div className="canvas-host">
            {nodes.length > 0 ? (
              <FloorPlan
                nodes={showGraph ? nodes : []}
                edges={showGraph ? edges : []}
                fireNode={null}
                highlightedNode={selected}
                onNodeClick={handleNodeClick}
                formulaOverlay={false}
              />
            ) : (
              <div style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center',
                flexDirection:'column', gap:8, color:'var(--ink-3)',
              }}>
                <div className="mono small">ยังไม่มี node</div>
                <div className="mono micro dim">เลือกเครื่องมือ "เพิ่มห้อง" แล้วคลิก "+ เพิ่ม Node ใหม่"</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'add-node' && (
        <Modal title="เพิ่ม Node ใหม่" onClose={() => { setModal(null); setFormErr(null); }}>
          <Field label="Node Key (ไม่ซ้ำในอาคาร เช่น r101)">
            <input style={inputStyle} value={form.node_key || ''} autoFocus
              onChange={e => setForm(p => ({ ...p, node_key: e.target.value }))} placeholder="r101" />
          </Field>
          <Field label="ประเภท">
            <select style={selectStyle} value={form.type || 'room'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ชื่อแสดงผล">
            <input style={inputStyle} value={form.label || ''} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="ห้อง 101" />
          </Field>
          <Field label="ความจุ (คน)">
            <input style={inputStyle} type="number" min={0} value={form.capacity || 20} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} />
          </Field>
          <Field label="ชั้น">
            <input style={inputStyle} type="number" min={1} value={form.floor || 1} onChange={e => setForm(p => ({ ...p, floor: Number(e.target.value) }))} />
          </Field>
          {formErr && <div className="mono small" style={{color:'var(--accent-red)',marginBottom:8}}>⚠ {formErr}</div>}
          <button onClick={submitAddNode} className="primary-btn small">เพิ่ม</button>
        </Modal>
      )}

      {modal === 'edit-node' && (
        <Modal title={`แก้ไข Node: ${form.node_key || form.id}`} onClose={() => { setModal(null); setFormErr(null); }}>
          <Field label="ประเภท">
            <select style={selectStyle} value={form.type || 'room'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ชื่อแสดงผล">
            <input style={inputStyle} value={form.label || ''} autoFocus onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
          </Field>
          <Field label="ความจุ (คน)">
            <input style={inputStyle} type="number" min={0} value={form.capacity || form.cap || 0} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} />
          </Field>
          {formErr && <div className="mono small" style={{color:'var(--accent-red)',marginBottom:8}}>⚠ {formErr}</div>}
          <button onClick={submitEditNode} className="primary-btn small">บันทึก</button>
        </Modal>
      )}

      {modal === 'add-edge' && (
        <Modal title={`สร้าง Edge: ${form.u_key} ↔ ${form.v_key}`} onClose={() => { setModal(null); setFormErr(null); }}>
          <Field label="ระยะทาง (เมตร)">
            <input style={inputStyle} type="number" min={0.1} step={0.5} value={form.distance_m || 10} autoFocus
              onChange={e => setForm(p => ({ ...p, distance_m: e.target.value }))} />
          </Field>
          <Field label="ความกว้าง (เมตร)">
            <input style={inputStyle} type="number" min={0.5} step={0.5} value={form.width_m || 2}
              onChange={e => setForm(p => ({ ...p, width_m: e.target.value }))} />
          </Field>
          <Field label="">
            <label style={{display:'flex',alignItems:'center',gap:8,color:'var(--ink-1)',cursor:'pointer'}}>
              <input type="checkbox" checked={!!form.is_stair} onChange={e => setForm(p => ({ ...p, is_stair: e.target.checked }))} />
              บันได (ช้ากว่าทางเดินแนวราบ)
            </label>
          </Field>
          {formErr && <div className="mono small" style={{color:'var(--accent-red)',marginBottom:8}}>⚠ {formErr}</div>}
          <button onClick={submitAddEdge} className="primary-btn small">สร้าง Edge</button>
        </Modal>
      )}

      <ConfirmModal
        open={confirmState !== null}
        message={confirmState?.message || ''}
        destructive={!!confirmState?.destructive}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const fn = confirmState?.onConfirm;
          setConfirmState(null);
          if (fn) fn();
        }}
      />

      <Toast
        open={toast !== null}
        kind={toast?.kind || 'info'}
        message={toast?.message || ''}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
