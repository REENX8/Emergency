import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CytoscapeComponent from 'react-cytoscapejs';
import axios from 'axios';

import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const NODE_COLORS = { room: '#1d4ed8', corridor: '#0369a1', stair: '#7c3aed', exit: '#16a34a' };
const NODE_TYPES  = ['room', 'corridor', 'stair', 'exit'];

const STYLESHEET = [
  {
    selector: 'node',
    style: {
      label: 'data(label)', color: '#fff', 'font-size': 10,
      'background-color': 'data(color)', 'text-valign': 'center', 'text-halign': 'center',
      width: 64, height: 28, shape: 'round-rectangle',
      'border-width': 2, 'border-color': '#334155', 'text-wrap': 'wrap', 'text-max-width': 60,
    },
  },
  { selector: 'node[type="exit"]',     style: { 'border-color': '#22c55e', 'border-width': 3, width: 72, height: 32, 'font-weight': 'bold' } },
  { selector: 'node[type="stair"]',    style: { 'border-color': '#a78bfa' } },
  { selector: 'node[type="corridor"]', style: { 'border-color': '#38bdf8', width: 80 } },
  { selector: 'node.selected',         style: { 'border-color': '#f59e0b', 'border-width': 4 } },
  {
    selector: 'edge',
    style: {
      width: 2, 'line-color': '#475569', 'curve-style': 'bezier',
      label: 'data(label)', 'font-size': 8, color: '#64748b', 'text-rotation': 'autorotate',
    },
  },
  { selector: 'edge[is_stair="true"]', style: { 'line-style': 'dashed', 'line-color': '#6d28d9' } },
  { selector: 'edge.selected',         style: { 'line-color': '#f59e0b', width: 3 } },
];

// Modal component
function Modal({ title, children, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 24, minWidth: 340, maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9', marginBottom: 16 }}>{title}</div>
        {children}
        <button onClick={onClose} style={{ marginTop: 12, background: '#334155', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#cbd5e1', cursor: 'pointer' }}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  background: '#0f172a', border: '1px solid #475569', color: '#f1f5f9',
  fontSize: 14, boxSizing: 'border-box',
};
const sel = { ...inp, cursor: 'pointer' };
const btn = (extra = {}) => ({
  padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 13, ...extra,
});

export default function FloorEditor() {
  const { buildingId } = useParams();
  const navigate = useNavigate();

  const [building, setBuilding]     = useState(null);
  const [floors, setFloors]         = useState([]);
  const [nodes, setNodes]           = useState([]);
  const [edges, setEdges]           = useState([]);
  const [activeFloor, setActiveFloor] = useState(1);
  const [editMode, setEditMode]     = useState(false);
  const [pendingEdge, setPendingEdge] = useState(null); // first node selected for edge
  const [modal, setModal]           = useState(null);   // 'add-node' | 'edit-node' | 'add-edge' | 'upload'
  const [clickPos, setClickPos]     = useState({ x: 0, y: 0 });
  const [form, setForm]             = useState({});
  const [error, setError]           = useState(null);
  const [confirmState, setConfirmState] = useState(null); // { message, onConfirm }
  const [toast, setToast]           = useState(null);     // { kind, message }

  const showToast = useCallback((kind, message) => setToast({ kind, message }), []);
  const askConfirm = useCallback((message, onConfirm, opts = {}) =>
    setConfirmState({ message, onConfirm, ...opts }), []);
  const cyRef = useRef(null);

  const load = useCallback(async () => {
    const [bRes, nRes, eRes, fRes] = await Promise.all([
      axios.get(`${API}/buildings/${buildingId}`),
      axios.get(`${API}/buildings/${buildingId}/nodes`),
      axios.get(`${API}/buildings/${buildingId}/edges`),
      axios.get(`${API}/buildings/${buildingId}/floors`),
    ]);
    setBuilding(bRes.data);
    setNodes(nRes.data);
    setEdges(eRes.data);
    setFloors(fRes.data);
  }, [buildingId]);

  useEffect(() => { load(); }, [load]);

  // Cytoscape elements for current floor
  const cyElements = React.useMemo(() => {
    const floorNodes = nodes.filter(n => n.floor_number === activeFloor);
    const nodeKeys = new Set(floorNodes.map(n => n.node_key));

    const cyNodes = floorNodes.map(n => ({
      data: { id: n.node_key, label: n.label || n.node_key, type: n.type, color: NODE_COLORS[n.type] || '#1e293b' },
      position: { x: n.x, y: n.y },
    }));

    const cyEdges = edges
      .filter(e => nodeKeys.has(e.u_key) && nodeKeys.has(e.v_key))
      .map(e => ({
        data: {
          id: `e${e.id}`, source: e.u_key, target: e.v_key,
          label: `${e.distance_m}m`,
          is_stair: e.is_stair ? 'true' : 'false',
          dbId: e.id,
        },
      }));

    return [...cyNodes, ...cyEdges];
  }, [nodes, edges, activeFloor]);

  // Wire up Cytoscape events
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onTap = (evt) => {
      if (!editMode) return;
      if (evt.target === cy) {
        // Clicked empty canvas — add node
        const pos = evt.position;
        setClickPos({ x: Math.round(pos.x), y: Math.round(pos.y) });
        setForm({ type: 'room', label: '', node_key: '', capacity: 20, floor_number: activeFloor });
        setModal('add-node');
        setPendingEdge(null);
        cy.elements().removeClass('selected');
      }
    };

    const onNodeTap = (evt) => {
      if (!editMode) return;
      const nodeId = evt.target.id();
      if (pendingEdge === null) {
        // First click — select as edge source
        cy.elements().removeClass('selected');
        evt.target.addClass('selected');
        setPendingEdge(nodeId);
      } else if (pendingEdge === nodeId) {
        // Clicked same node — deselect + open edit
        cy.elements().removeClass('selected');
        setPendingEdge(null);
        const n = nodes.find(n => n.node_key === nodeId);
        if (n) { setForm({ ...n }); setModal('edit-node'); }
      } else {
        // Second click — create edge
        cy.elements().removeClass('selected');
        setForm({ u_key: pendingEdge, v_key: nodeId, distance_m: 10, width_m: 2, is_stair: false });
        setModal('add-edge');
        setPendingEdge(null);
      }
    };

    const onEdgeTap = (evt) => {
      if (!editMode) return;
      const edgeId = evt.target.data('dbId');
      askConfirm('ลบเส้นเชื่อมนี้ใช่หรือไม่?', async () => {
        try {
          await axios.delete(`${API}/buildings/${buildingId}/edges/${edgeId}`);
          load();
          showToast('success', 'ลบเส้นเชื่อมแล้ว');
        } catch (e) {
          showToast('error', e.response?.data?.detail || 'ลบไม่สำเร็จ');
        }
      }, { destructive: true });
    };

    cy.on('tap', onTap);
    cy.on('tap', 'node', onNodeTap);
    cy.on('tap', 'edge', onEdgeTap);
    return () => {
      cy.off('tap', onTap);
      cy.off('tap', 'node', onNodeTap);
      cy.off('tap', 'edge', onEdgeTap);
    };
  }, [editMode, pendingEdge, nodes, buildingId, load, activeFloor, askConfirm, showToast]);

  // Save node positions when dragged
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const onDragFree = (evt) => {
      const pos = evt.target.position();
      const key = evt.target.id();
      axios.put(`${API}/buildings/${buildingId}/nodes/${key}`, {
        x: Math.round(pos.x), y: Math.round(pos.y),
      }).catch(() => {});
    };
    cy.on('dragfree', 'node', onDragFree);
    return () => cy.off('dragfree', 'node', onDragFree);
  }, [buildingId]);

  const submitAddNode = async () => {
    if (!form.node_key?.trim()) { setError('กรุณาระบุ Node Key'); return; }
    try {
      await axios.post(`${API}/buildings/${buildingId}/nodes`, {
        node_key: form.node_key.trim(),
        type: form.type,
        label: form.label || form.node_key.trim(),
        x: clickPos.x, y: clickPos.y,
        capacity: Number(form.capacity) || 20,
        floor_number: activeFloor,
      });
      setModal(null); setError(null); load();
    } catch (e) { setError(e.response?.data?.detail || 'เกิดข้อผิดพลาด'); }
  };

  const submitEditNode = async () => {
    try {
      await axios.put(`${API}/buildings/${buildingId}/nodes/${form.node_key}`, {
        label: form.label, type: form.type, capacity: Number(form.capacity),
      });
      setModal(null); setError(null); load();
    } catch (e) { setError(e.response?.data?.detail || 'เกิดข้อผิดพลาด'); }
  };

  const deleteNode = () => {
    const key = form.node_key;
    askConfirm(
      `ลบ node "${key}"? เส้นเชื่อมที่ต่ออยู่จะถูกลบไปพร้อมกัน`,
      async () => {
        try {
          await axios.delete(`${API}/buildings/${buildingId}/nodes/${key}`);
          setModal(null);
          load();
          showToast('success', `ลบ node ${key} แล้ว`);
        } catch (e) {
          showToast('error', e.response?.data?.detail || 'ลบไม่สำเร็จ');
        }
      },
      { destructive: true },
    );
  };

  const submitAddEdge = async () => {
    try {
      await axios.post(`${API}/buildings/${buildingId}/edges`, {
        u_key: form.u_key, v_key: form.v_key,
        distance_m: Number(form.distance_m), width_m: Number(form.width_m),
        is_stair: !!form.is_stair,
      });
      setModal(null); setError(null); load();
    } catch (e) { setError(e.response?.data?.detail || 'เกิดข้อผิดพลาด'); }
  };

  const uploadFloor = async (file) => {
    const fd = new FormData();
    fd.append('floor_number', activeFloor);
    fd.append('scale_px_per_m', 6);
    fd.append('image', file);
    try {
      await axios.post(`${API}/buildings/${buildingId}/floors`, fd);
      load();
    } catch (e) { showToast('error', 'อัปโหลดล้มเหลว: ' + (e.response?.data?.detail || e.message)); }
  };

  const activeFloorData = floors.find(f => f.floor_number === activeFloor);
  const floorImageUrl = activeFloorData?.image_filename
    ? (activeFloorData.image_filename.startsWith('http')
        ? activeFloorData.image_filename
        : `${API}/uploads/${activeFloorData.image_filename}`)
    : null;

  if (!building) return <div style={{ padding: 40, color: '#94a3b8' }}>กำลังโหลด...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', color: '#f1f5f9' }}>
      {/* Top bar */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={btn({ background: '#334155', color: '#cbd5e1' })}>← กลับ</button>
        <span style={{ fontSize: 15, fontWeight: 700 }}>✏️ {building.name}</span>

        {/* Floor tabs */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {[1, 2, 3, 4, 5].map(f => (
            <button key={f} onClick={() => setActiveFloor(f)}
              style={btn({ background: activeFloor === f ? '#1d4ed8' : '#334155', color: '#fff', padding: '5px 12px' })}>
              ชั้น {f}
            </button>
          ))}
        </div>

        {/* Upload image */}
        <label style={{ ...btn({ background: '#0369a1', color: '#fff' }), cursor: 'pointer' }}>
          📷 อัปโหลดแปลน
          <input type="file" accept=".png,.jpg,.jpeg,.pdf" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && uploadFloor(e.target.files[0])} />
        </label>

        {/* Edit mode toggle */}
        <button
          onClick={() => { setEditMode(v => !v); setPendingEdge(null); }}
          style={btn({ background: editMode ? '#f59e0b' : '#334155', color: '#fff' })}>
          {editMode ? '✏️ กำลังแก้ไข (คลิกเพื่อออก)' : '✏️ เข้าสู่ Edit Mode'}
        </button>

        {editMode && pendingEdge && (
          <span style={{ fontSize: 13, color: '#fbbf24', background: '#422006', padding: '4px 10px', borderRadius: 6 }}>
            คลิก node อื่นเพื่อสร้าง edge จาก <strong>{pendingEdge}</strong> (หรือคลิกซ้ำเพื่อแก้ไข)
          </span>
        )}

        <button onClick={() => navigate(`/buildings/${buildingId}/simulate`)}
          style={{ ...btn({ background: '#ef4444', color: '#fff' }), marginLeft: 'auto' }}>
          🚨 จำลองอพยพ
        </button>
      </div>

      {/* Help bar */}
      {editMode && (
        <div style={{ background: '#422006', padding: '6px 20px', fontSize: 12, color: '#fcd34d' }}>
          ✏️ Edit Mode: คลิกพื้นที่ว่าง = เพิ่ม node · คลิก node ครั้งแรก = เลือกต้นทาง edge · คลิก node ที่สอง = สร้าง edge · คลิก node เดิมซ้ำ = แก้ไข · คลิก edge = ลบ edge
        </div>
      )}

      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Floor plan image as background */}
        {floorImageUrl && (
          <img
            src={floorImageUrl}
            alt={`Floor ${activeFloor}`}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              objectFit: 'contain', opacity: 0.35,
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}
        {!floorImageUrl && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            color: '#334155', fontSize: 13, zIndex: 5, pointerEvents: 'none',
          }}>
            อัปโหลดแปลนอาคารเพื่อใช้เป็น background
          </div>
        )}

        {cyElements.length > 0 || editMode ? (
          <CytoscapeComponent
            elements={cyElements}
            stylesheet={STYLESHEET}
            layout={{ name: 'preset' }}
            style={{ width: '100%', height: '100%', zIndex: 1, background: 'transparent' }}
            cy={cy => { cyRef.current = cy; }}
            zoom={1}
            pan={{ x: 20, y: 20 }}
            userZoomingEnabled
            userPanningEnabled
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#475569', fontSize: 15, flexDirection: 'column', gap: 8,
          }}>
            <div>ชั้น {activeFloor} ยังไม่มี node</div>
            <div style={{ fontSize: 13 }}>เข้า Edit Mode แล้วคลิกบน canvas เพื่อเพิ่มห้อง/ทางเดิน/บันได/ทางออก</div>
          </div>
        )}

        {/* Legend */}
        <div style={{
          position: 'absolute', top: 12, right: 12, background: '#1e293b',
          border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', zIndex: 10,
          fontSize: 12, color: '#94a3b8',
        }}>
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
              {type}
            </div>
          ))}
          <div style={{ borderTop: '1px solid #334155', marginTop: 6, paddingTop: 6, color: '#64748b' }}>
            Nodes: {nodes.filter(n => n.floor_number === activeFloor).length} · Edges: {edges.filter(e => {
              const keys = new Set(nodes.filter(n => n.floor_number === activeFloor).map(n => n.node_key));
              return keys.has(e.u_key) && keys.has(e.v_key);
            }).length}
          </div>
        </div>
      </div>

      {/* ─── Modals ─── */}

      {modal === 'add-node' && (
        <Modal title="เพิ่ม Node ใหม่" onClose={() => { setModal(null); setError(null); }}>
          <Field label="Node Key (ไม่ซ้ำในอาคาร เช่น r101)">
            <input style={inp} value={form.node_key || ''} onChange={e => setForm(p => ({ ...p, node_key: e.target.value }))} placeholder="r101" autoFocus />
          </Field>
          <Field label="ประเภท">
            <select style={sel} value={form.type || 'room'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ชื่อแสดงผล">
            <input style={inp} value={form.label || ''} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="ห้อง 101" />
          </Field>
          <Field label="ความจุ (คน)">
            <input style={inp} type="number" min={1} value={form.capacity || 20} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} />
          </Field>
          {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>}
          <button onClick={submitAddNode} style={{ ...btn({ background: '#3b82f6', color: '#fff' }), marginRight: 8 }}>เพิ่ม</button>
        </Modal>
      )}

      {modal === 'edit-node' && (
        <Modal title={`แก้ไข Node: ${form.node_key}`} onClose={() => { setModal(null); setError(null); }}>
          <Field label="ประเภท">
            <select style={sel} value={form.type || 'room'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ชื่อแสดงผล">
            <input style={inp} value={form.label || ''} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} autoFocus />
          </Field>
          <Field label="ความจุ (คน)">
            <input style={inp} type="number" min={1} value={form.capacity || 20} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} />
          </Field>
          {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>}
          <button onClick={submitEditNode} style={{ ...btn({ background: '#3b82f6', color: '#fff' }), marginRight: 8 }}>บันทึก</button>
          <button onClick={deleteNode}    style={{ ...btn({ background: '#ef4444', color: '#fff' }) }}>ลบ Node</button>
        </Modal>
      )}

      {modal === 'add-edge' && (
        <Modal title={`สร้าง Edge: ${form.u_key} ↔ ${form.v_key}`} onClose={() => { setModal(null); setError(null); }}>
          <Field label="ระยะทาง (เมตร)">
            <input style={inp} type="number" min={0.1} step={0.5} value={form.distance_m || 10}
              onChange={e => setForm(p => ({ ...p, distance_m: e.target.value }))} autoFocus />
          </Field>
          <Field label="ความกว้าง (เมตร)">
            <input style={inp} type="number" min={0.5} step={0.5} value={form.width_m || 2}
              onChange={e => setForm(p => ({ ...p, width_m: e.target.value }))} />
          </Field>
          <Field label="">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.is_stair} onChange={e => setForm(p => ({ ...p, is_stair: e.target.checked }))} />
              บันได (ช้ากว่าทางเดินแนวราบ)
            </label>
          </Field>
          {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>}
          <button onClick={submitAddEdge} style={btn({ background: '#3b82f6', color: '#fff' })}>สร้าง Edge</button>
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
