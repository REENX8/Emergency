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
      label: 'data(label)', 'background-color': 'data(color)', color: '#fff',
      'font-size': 10, 'text-valign': 'center', 'text-halign': 'center',
      width: 60, height: 28, shape: 'round-rectangle',
      'border-width': 2, 'border-color': '#334155',
      'text-wrap': 'wrap', 'text-max-width': 58,
    },
  },
  { selector: 'node[type="exit"]',    style: { 'background-color': '#16a34a', 'border-color': '#22c55e', 'border-width': 3, width: 72, height: 32, 'font-weight': 'bold' } },
  { selector: 'node[type="stair"]',   style: { 'background-color': '#7c3aed', 'border-color': '#a78bfa' } },
  { selector: 'node[type="corridor"]',style: { 'background-color': '#0369a1', 'border-color': '#38bdf8', width: 80 } },
  { selector: 'node.fire',            style: { 'background-color': '#ef4444', 'border-color': '#fca5a5', 'border-width': 4 } },
  { selector: 'node.incident-smoke',  style: { 'background-color': '#6b7280', 'border-color': '#9ca3af', 'border-width': 3 } },
  { selector: 'node.incident-crowd',  style: { 'background-color': '#b45309', 'border-color': '#fbbf24', 'border-width': 3 } },
  { selector: 'node.on-path',         style: { 'background-color': '#f59e0b', 'border-color': '#fbbf24', 'border-width': 3 } },
  // Max-flow badge: exit node selected by flow
  { selector: 'node.maxflow',         style: { 'border-color': '#22d3ee', 'border-width': 4 } },
  {
    selector: 'edge',
    style: {
      width: 2, 'line-color': '#334155', 'curve-style': 'bezier',
      label: 'data(weightLabel)', 'font-size': 8, color: '#64748b', 'text-rotation': 'autorotate',
    },
  },
  { selector: 'edge[is_stair="true"]', style: { 'line-style': 'dashed', 'line-color': '#6d28d9' } },
  { selector: 'edge.smoke',            style: { 'line-color': '#6b7280', 'line-style': 'dotted', width: 1, opacity: 0.4 } },
  // Smoke levels: light→dark grey based on smoke_level (applied via data)
  { selector: 'edge.smoke-low',        style: { 'line-color': '#78716c', width: 2, opacity: 0.6 } },
  { selector: 'edge.smoke-mid',        style: { 'line-color': '#b45309', width: 3, opacity: 0.8 } },
  { selector: 'edge.smoke-high',       style: { 'line-color': '#ef4444', width: 3, opacity: 0.9 } },
  { selector: 'edge.smoke-blocked',    style: { 'line-color': '#7f1d1d', 'line-style': 'dotted', width: 2, opacity: 0.5 } },
  { selector: 'edge.on-path',          style: { 'line-color': '#f59e0b', width: 4, 'z-index': 10 } },
  { selector: 'edge.best-path',        style: { 'line-color': '#22c55e', width: 5, 'z-index': 20 } },
  // Bottleneck edges (bridges) — orange highlight
  { selector: 'edge.bottleneck',       style: { 'line-color': '#f97316', width: 4, 'border-opacity': 0.9, 'z-index': 15 } },
  // Compare mode: second algorithm path
  { selector: 'edge.compare-path',     style: { 'line-color': '#a78bfa', width: 3, 'line-style': 'dashed', 'z-index': 12 } },
  { selector: 'node.compare-path',     style: { 'border-color': '#a78bfa', 'border-width': 3 } },
  // Smooth fire-intensity gradient (0 = just ignited yellow, 1 = fully burning deep red).
  // Driven by `data('fireIntensity', number)` written via cy.batch() in the effect below.
  { selector: 'node[fireIntensity]', style: {
      'background-color': 'mapData(fireIntensity, 0, 1, #fbbf24, #7f1d1d)',
      'border-color':     'mapData(fireIntensity, 0, 1, #fed7aa, #fca5a5)',
      'border-width':     'mapData(fireIntensity, 0, 1, 3, 6)',
  }},
  // Continuous smoke heatmap on edges (preferred over discrete classes when level is known).
  { selector: 'edge[smokeIntensity]', style: {
      'line-color': 'mapData(smokeIntensity, 0, 1, #78716c, #7f1d1d)',
      'width':      'mapData(smokeIntensity, 0, 1, 2, 4)',
      'opacity':    'mapData(smokeIntensity, 0, 1, 0.55, 0.95)',
  }},
];


export default function BuildingMap({
  elements,
  fireNode,
  smokeEdges        = [],      // [[u,v], ...] binary blocked (legacy)
  selectedPath,
  bestPath,
  floorImageUrl     = null,
  onNodeClick       = null,
  incidentNodes     = {},      // {nodeId: 'fire'|'smoke'|'crowd'}
  smokeAnnotations  = [],      // [{source, target, smoke_level, blocked}] — new model
  bottleneckEdges   = [],      // [[u,v], ...] to highlight orange
  maxflowBadges     = {},      // {exit_id: persons}
  compareResult     = null,    // {dijkstra: routes, astar: routes} for Compare mode
  fireSpreadNodes   = [],      // node ids currently on fire (at slider time)
  fireSpreadData    = [],      // [{node, reach_time}] full data for intensity
  fireSpreadTime    = 0,       // current slider time
}) {
  const cyRef = useRef(null);
  // Track which nodes were on fire on the previous render so we can tween
  // newly-ignited ones (instead of snapping every node every frame).
  const prevIgnitedRef = useRef(new Set());

  // Apply all visual classes whenever inputs change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass(
      'fire on-path best-path smoke smoke-low smoke-mid smoke-high smoke-blocked ' +
      'incident-smoke incident-crowd bottleneck maxflow compare-path ' +
      'fire-spread fire-spread-hot'
    );
    // Clear continuous data attributes for a clean redraw — nodes/edges
    // that should remain coloured are repopulated below in the same effect.
    cy.batch(() => {
      cy.nodes('[fireIntensity]').forEach(n => n.removeData('fireIntensity'));
      cy.edges('[smokeIntensity]').forEach(e => e.removeData('smokeIntensity'));
    });

    if (fireNode) cy.getElementById(fireNode).addClass('fire');

    // Incident colours
    Object.entries(incidentNodes).forEach(([nid, type]) => {
      if (type === 'smoke') cy.getElementById(nid).addClass('incident-smoke');
      if (type === 'crowd') cy.getElementById(nid).addClass('incident-crowd');
    });

    // Continuous smoke annotations — write smoke_level into edge data so the
    // `edge[smokeIntensity]` mapData selector renders a smooth gradient.
    // Blocked edges stay as a discrete dotted-line class for unmistakable
    // contrast against the gradient.
    cy.batch(() => {
      smokeAnnotations.forEach(({ source, target, smoke_level, blocked }) => {
        const e1 = cy.getElementById(`${source}__${target}`);
        const e2 = cy.getElementById(`${target}__${source}`);
        const edge = e1.length ? e1 : e2;
        if (!edge.length) return;
        if (blocked) {
          edge.addClass('smoke-blocked');
          return;
        }
        if (smoke_level > 0.05) {
          edge.data('smokeIntensity', Math.min(1, smoke_level));
        }
      });
    });

    // Legacy binary smoke edges (when no smokeAnnotations)
    if (smokeAnnotations.length === 0 && smokeEdges.length > 0) {
      smokeEdges.forEach(([u, v]) => {
        cy.getElementById(`${u}__${v}`).addClass('smoke');
        cy.getElementById(`${v}__${u}`).addClass('smoke');
      });
    }

    // Bottleneck edges (orange)
    bottleneckEdges.forEach(([u, v]) => {
      cy.getElementById(`${u}__${v}`).addClass('bottleneck');
      cy.getElementById(`${v}__${u}`).addClass('bottleneck');
    });

    // Max-flow badges on exit nodes
    Object.keys(maxflowBadges).forEach(nid => {
      cy.getElementById(nid).addClass('maxflow');
    });

    // Selected path (yellow)
    if (selectedPath?.length > 1) {
      selectedPath.forEach(nid => cy.getElementById(nid).addClass('on-path'));
      for (let i = 0; i < selectedPath.length - 1; i++) {
        const u = selectedPath[i], v = selectedPath[i + 1];
        cy.getElementById(`${u}__${v}`).addClass('on-path');
        cy.getElementById(`${v}__${u}`).addClass('on-path');
      }
    }

    // Best path (green)
    if (bestPath?.length > 1) {
      bestPath.forEach(nid => cy.getElementById(nid).addClass('best-path'));
      for (let i = 0; i < bestPath.length - 1; i++) {
        const u = bestPath[i], v = bestPath[i + 1];
        cy.getElementById(`${u}__${v}`).addClass('best-path');
        cy.getElementById(`${v}__${u}`).addClass('best-path');
      }
    }

    // Compare mode: draw A* path in purple dashed
    if (compareResult?.astar) {
      const astarBest = compareResult.astar.find(r => r.reachable);
      if (astarBest?.path?.length > 1) {
        astarBest.path.forEach(nid => cy.getElementById(nid).addClass('compare-path'));
        for (let i = 0; i < astarBest.path.length - 1; i++) {
          const u = astarBest.path[i], v = astarBest.path[i + 1];
          cy.getElementById(`${u}__${v}`).addClass('compare-path');
          cy.getElementById(`${v}__${u}`).addClass('compare-path');
        }
      }
    }
    // Fire spread nodes — render as a smooth intensity gradient via mapData.
    // Intensity ramps from 0 (just ignited) to 1 (fully burning after 60s).
    // Newly-ignited nodes since the last render get a short tween for an
    // attention-grabbing "catches fire" cue; nodes already burning just
    // get their intensity updated in a single batched paint.
    const currentIgnited = new Set();
    cy.batch(() => {
      fireSpreadNodes.forEach(nodeId => {
        const nodeData = fireSpreadData.find(n => n.node === nodeId);
        const reachTime = nodeData ? nodeData.reach_time : 0;
        const intensity = Math.max(0, Math.min(1, (fireSpreadTime - reachTime) / 60));
        cy.getElementById(nodeId).data('fireIntensity', intensity);
        currentIgnited.add(nodeId);
      });
    });
    // Tween nodes that crossed the ignition threshold since the previous render.
    const newlyIgnited = [...currentIgnited].filter(id => !prevIgnitedRef.current.has(id));
    newlyIgnited.forEach(id => {
      const node = cy.getElementById(id);
      if (!node.length) return;
      node.animation({
        style: { 'border-width': 8 },
        duration: 250,
      }).play().promise().then(() => {
        node.animation({ style: { 'border-width': 4 }, duration: 250 }).play();
      });
    });
    prevIgnitedRef.current = currentIgnited;
  }, [fireNode, smokeEdges, smokeAnnotations, selectedPath, bestPath,
      elements, incidentNodes, bottleneckEdges, maxflowBadges, compareResult,
      fireSpreadNodes, fireSpreadData, fireSpreadTime]);

  // Click-to-report
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
        label: (maxflowBadges[n.data.id] != null)
          ? `${n.data.label}\n[${maxflowBadges[n.data.id]}p]`
          : n.data.label,
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
  }, [elements, maxflowBadges]);

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
        <img src={floorImageUrl} alt="Floor plan"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%', objectFit: 'contain',
            opacity: 0.3, pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}

      {showFloorLabels && FLOOR_LABELS.map(({ label, y }) => (
        <div key={label} style={{
          position: 'absolute', left: 12, top: y, zIndex: 10,
          background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
          padding: '2px 8px', fontSize: 11, color: '#475569', fontWeight: 600,
        }}>{label}</div>
      ))}

      {/* Hint: click to report */}
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
        borderRadius: 8, padding: '10px 14px', zIndex: 10,
        fontSize: 12, color: '#94a3b8', border: '1px solid #334155',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 12, height: 3, background: '#a78bfa', borderRadius: 2, borderTop: '1px dashed #a78bfa' }} /> A* route
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 12, height: 3, background: '#f97316', borderRadius: 2 }} /> bottleneck
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 12, height: 3, background: '#ef4444', borderRadius: 2 }} /> fire
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#f97316' }} /> ไฟเพิ่งถึง
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#dc2626' }} /> ไฟลุกแรง
          </div>
        </div>

        {/* Smoke level legend */}
        {smokeAnnotations.length > 0 && (
          <div style={{ borderTop: '1px solid #334155', marginTop: 6, paddingTop: 6 }}>
            <div style={{ marginBottom: 4, color: '#64748b', fontSize: 11 }}>Smoke level</div>
            {[
              { label: 'blocked', color: '#7f1d1d' },
              { label: 'high',    color: '#ef4444' },
              { label: 'medium',  color: '#b45309' },
              { label: 'low',     color: '#78716c' },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 12, height: 3, background: color, borderRadius: 2 }} /> {label}
              </div>
            ))}
          </div>
        )}
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
