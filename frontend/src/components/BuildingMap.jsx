import React, { useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

const NODE_COLORS = {
  room:     '#1d4ed8',
  corridor: '#0369a1',
  stair:    '#7c3aed',
  exit:     '#16a34a',
};

const STYLESHEET = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'background-color': 'data(color)',
      color: '#fff',
      'font-size': 10,
      'text-valign': 'center',
      'text-halign': 'center',
      width: 60,
      height: 28,
      shape: 'round-rectangle',
      'border-width': 2,
      'border-color': '#334155',
      'text-wrap': 'wrap',
      'text-max-width': 58,
    },
  },
  {
    selector: 'node[type="exit"]',
    style: { 'background-color': '#16a34a', 'border-color': '#22c55e', 'border-width': 3, width: 70, height: 32, 'font-weight': 'bold' },
  },
  { selector: 'node[type="stair"]',    style: { 'background-color': '#7c3aed', 'border-color': '#a78bfa' } },
  { selector: 'node[type="corridor"]', style: { 'background-color': '#0369a1', 'border-color': '#38bdf8', width: 80 } },
  { selector: 'node.fire',     style: { 'background-color': '#ef4444', 'border-color': '#fca5a5', 'border-width': 4 } },
  { selector: 'node.incident-smoke',  style: { 'background-color': '#6b7280', 'border-color': '#9ca3af', 'border-width': 3 } },
  { selector: 'node.incident-crowd',  style: { 'background-color': '#b45309', 'border-color': '#fbbf24', 'border-width': 3 } },
  { selector: 'node.on-path',  style: { 'background-color': '#f59e0b', 'border-color': '#fbbf24', 'border-width': 3 } },
  { selector: 'node.clickable', style: { cursor: 'pointer' } },
  {
    selector: 'edge',
    style: {
      width: 2, 'line-color': '#334155', 'curve-style': 'bezier',
      label: 'data(weightLabel)', 'font-size': 8, color: '#64748b', 'text-rotation': 'autorotate',
    },
  },
  { selector: 'edge[is_stair="true"]', style: { 'line-style': 'dashed', 'line-color': '#6d28d9' } },
  { selector: 'edge.smoke',     style: { 'line-color': '#6b7280', 'line-style': 'dotted', width: 1, opacity: 0.5 } },
  { selector: 'edge.on-path',   style: { 'line-color': '#f59e0b', width: 4, 'z-index': 10 } },
  { selector: 'edge.best-path', style: { 'line-color': '#22c55e', width: 5, 'z-index': 20 } },
];

export default function BuildingMap({
  elements,
  fireNode,
  smokeEdges,
  selectedPath,
  bestPath,
  floorImageUrl = null,      // floor plan image shown as background
  onNodeClick   = null,      // (nodeId) => void — for incident reporting
  incidentNodes = {},        // {nodeId: 'fire'|'smoke'|'crowd'} for colouring
}) {
  const cyRef = useRef(null);

  // Apply dynamic classes whenever inputs change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass('fire on-path best-path smoke incident-smoke incident-crowd');

    if (fireNode) cy.getElementById(fireNode).addClass('fire');

    // Colour nodes with active incidents
    Object.entries(incidentNodes).forEach(([nid, type]) => {
      if (type === 'smoke') cy.getElementById(nid).addClass('incident-smoke');
      if (type === 'crowd') cy.getElementById(nid).addClass('incident-crowd');
    });

    if (smokeEdges) {
      smokeEdges.forEach(([u, v]) => {
        cy.getElementById(`${u}__${v}`).addClass('smoke');
        cy.getElementById(`${v}__${u}`).addClass('smoke');
      });
    }

    if (selectedPath && selectedPath.length > 1) {
      selectedPath.forEach(nid => cy.getElementById(nid).addClass('on-path'));
      for (let i = 0; i < selectedPath.length - 1; i++) {
        const u = selectedPath[i], v = selectedPath[i + 1];
        cy.getElementById(`${u}__${v}`).addClass('on-path');
        cy.getElementById(`${v}__${u}`).addClass('on-path');
      }
    }

    if (bestPath && bestPath.length > 1) {
      bestPath.forEach(nid => cy.getElementById(nid).addClass('best-path'));
      for (let i = 0; i < bestPath.length - 1; i++) {
        const u = bestPath[i], v = bestPath[i + 1];
        cy.getElementById(`${u}__${v}`).addClass('best-path');
        cy.getElementById(`${v}__${u}`).addClass('best-path');
      }
    }
  }, [fireNode, smokeEdges, selectedPath, bestPath, elements, incidentNodes]);

  // Click-to-report: wire up node tap
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !onNodeClick) return;
    const handler = (evt) => onNodeClick(evt.target.id());
    cy.on('tap', 'node', handler);
    return () => cy.off('tap', 'node', handler);
  }, [onNodeClick]);

  const cyElements = React.useMemo(() => {
    if (!elements) return [];
    const nodes = (elements.nodes || []).map(n => ({
      data: {
        ...n.data,
        color: NODE_COLORS[n.data.type] || '#1e293b',
        label: n.data.label,
      },
      position: n.position,
    }));
    const edges = (elements.edges || []).map(e => ({
      data: {
        ...e.data,
        is_stair:    e.data.is_stair ? 'true' : 'false',
        weightLabel: `${e.data.weight}s`,
      },
    }));
    return [...nodes, ...edges];
  }, [elements]);

  // Floor labels (only shown for hardcoded 3-floor building, not DB buildings)
  const showFloorLabels = !floorImageUrl && cyElements.some(el => el.position?.y > 400);
  const FLOOR_LABELS = [
    { label: 'Floor 1', y: '27%' },
    { label: 'Floor 2', y: '57%' },
    { label: 'Floor 3', y: '83%' },
  ];

  return (
    <div style={{ flex: 1, position: 'relative', background: '#0f172a', overflow: 'hidden' }}>
      {/* Floor plan image background */}
      {floorImageUrl && (
        <img
          src={floorImageUrl}
          alt="Floor plan"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'contain', opacity: 0.3,
            pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}

      {/* Floor number labels (hardcoded building only) */}
      {showFloorLabels && FLOOR_LABELS.map(({ label, y }) => (
        <div key={label} style={{
          position: 'absolute', left: 12, top: y, zIndex: 10,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 4, padding: '2px 8px',
          fontSize: 11, color: '#475569', fontWeight: 600, letterSpacing: '0.05em',
        }}>
          {label}
        </div>
      ))}

      {/* Click-to-report hint */}
      {onNodeClick && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, fontSize: 11, color: '#475569', background: '#1e293b',
          padding: '3px 10px', borderRadius: 99, border: '1px solid #334155',
          pointerEvents: 'none',
        }}>
          คลิกที่ node เพื่อรายงานเหตุการณ์
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 12, right: 12, background: '#1e293b',
        borderRadius: 8, padding: '10px 14px', zIndex: 10, fontSize: 12, color: '#94a3b8',
        border: '1px solid #334155',
      }}>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
            {type}
          </div>
        ))}
        <div style={{ borderTop: '1px solid #334155', marginTop: 6, paddingTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 12, height: 3, background: '#f59e0b', borderRadius: 2 }} /> selected
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 12, height: 3, background: '#22c55e', borderRadius: 2 }} /> best route
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 3, background: '#ef4444', borderRadius: 2 }} /> fire
          </div>
        </div>
      </div>

      {cyElements.length > 0 ? (
        <CytoscapeComponent
          elements={cyElements}
          stylesheet={STYLESHEET}
          layout={{ name: 'preset' }}
          style={{ width: '100%', height: '100%', zIndex: 1, background: 'transparent' }}
          cy={cy => { cyRef.current = cy; }}
          zoom={0.85}
          pan={{ x: 20, y: 20 }}
        />
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: '#475569', fontSize: 16,
        }}>
          Configure conditions and click <strong style={{ marginLeft: 6 }}>Run Evacuation</strong>
        </div>
      )}
    </div>
  );
}
