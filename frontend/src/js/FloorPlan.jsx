/* SVG floor plan — control-room rendering of the building graph */
import React, { useMemo } from 'react';

/* Render an SVG floor plan with edges, nodes, smoke heatmap, fire state, routes */
export default function FloorPlan({
  nodes, edges, fireNode, smoke = {}, fireSpread = null, fireTime = 0,
  selectedPath = null, bestPath = null, comparePath = null,
  bottleneckEdges = [], maxflowBadges = {}, highlightedNode = null,
  onNodeClick, formulaOverlay = false, evacuees = [],
}) {
  const W = 1080, H = 740;
  const nodeIndex = useMemo(() => {
    const m = {}; nodes.forEach(n => { m[n.id] = n; }); return m;
  }, [nodes]);

  const fireIntensity = useMemo(() => {
    if (!fireSpread) return {};
    const map = {};
    fireSpread.nodes.forEach(({ node, reach_time }) => {
      if (reach_time <= fireTime) {
        map[node] = Math.max(0, Math.min(1, (fireTime - reach_time) / 60));
      }
    });
    return map;
  }, [fireSpread, fireTime]);

  const pathSet = useMemo(() => {
    const s = new Set();
    if (selectedPath) for (let i = 0; i < selectedPath.length - 1; i++) {
      s.add(`${selectedPath[i]}__${selectedPath[i+1]}`);
      s.add(`${selectedPath[i+1]}__${selectedPath[i]}`);
    }
    return s;
  }, [selectedPath]);

  const bestSet = useMemo(() => {
    const s = new Set();
    if (bestPath) for (let i = 0; i < bestPath.length - 1; i++) {
      s.add(`${bestPath[i]}__${bestPath[i+1]}`);
      s.add(`${bestPath[i+1]}__${bestPath[i]}`);
    }
    return s;
  }, [bestPath]);

  const compareSet = useMemo(() => {
    const s = new Set();
    if (comparePath) for (let i = 0; i < comparePath.length - 1; i++) {
      s.add(`${comparePath[i]}__${comparePath[i+1]}`);
      s.add(`${comparePath[i+1]}__${comparePath[i]}`);
    }
    return s;
  }, [comparePath]);

  const bottleneckSet = useMemo(() => {
    const s = new Set();
    bottleneckEdges.forEach(([u, v]) => { s.add(`${u}__${v}`); s.add(`${v}__${u}`); });
    return s;
  }, [bottleneckEdges]);

  const nodeOnPath = useMemo(() => {
    const s = new Set([...(selectedPath || []), ...(bestPath || []), ...(comparePath || [])]);
    return s;
  }, [selectedPath, bestPath, comparePath]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="floorplan" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="dotgrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.5" fill="var(--line-1)" />
        </pattern>
        <radialGradient id="firelow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-amber)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--accent-amber)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="firehigh" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-red)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--accent-red)" stopOpacity="0" />
        </radialGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-amber)" />
        </marker>
        <marker id="arrow-best" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-lime)" />
        </marker>
      </defs>

      <rect width={W} height={H} fill="var(--bg-0)" />
      <rect width={W} height={H} fill="url(#dotgrid)" opacity="0.7" />

      {[3,2,1].map((floor) => {
        const y = floor === 3 ? 60 : floor === 2 ? 310 : 560;
        return (
          <g key={floor}>
            <rect x="14" y={y} width={W-28} height={170} rx="8"
              fill="none" stroke="var(--line-1)" strokeDasharray="2 4" />
            <text x="28" y={y + 22} className="floor-label">
              ชั้น {floor}
            </text>
            <text x="28" y={y + 38} className="floor-label-sub">
              FLOOR {String(floor).padStart(2,'0')} · {floor === 1 ? 'GROUND · EXITS' : floor === 3 ? 'TOP' : 'MID'}
            </text>
          </g>
        );
      })}

      <g>
        {edges.map(e => {
          const u = nodeIndex[e.u], v = nodeIndex[e.v];
          if (!u || !v) return null;
          const key = `${e.u}__${e.v}`;
          const s = smoke[key] ?? smoke[`${e.v}__${e.u}`] ?? 0;
          const isPath = pathSet.has(key);
          const isBest = bestSet.has(key);
          const isCmp = compareSet.has(key);
          const isBot = bottleneckSet.has(key);
          const blocked = s >= 0.9;
          let stroke = 'var(--line-2)';
          let strokeWidth = 1.5;
          let dash = '';
          if (s > 0.05 && !blocked) {
            stroke = `oklch(${0.62 - s * 0.15} ${0.06 + s * 0.16} ${50 - s * 30})`;
            strokeWidth = 2 + s * 2;
          }
          if (blocked) {
            stroke = 'var(--accent-red-d)';
            dash = '3 4';
            strokeWidth = 1.5;
          }
          if (e.is_stair) dash = dash || '6 4';

          return (
            <g key={key}>
              <line x1={u.x} y1={u.y} x2={v.x} y2={v.y}
                stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash}
                opacity={blocked ? 0.45 : 0.9} />
              {isBot && (
                <line x1={u.x} y1={u.y} x2={v.x} y2={v.y}
                  stroke="var(--accent-amber)" strokeWidth="6" opacity="0.25" />
              )}
              {isCmp && (
                <line x1={u.x} y1={u.y} x2={v.x} y2={v.y}
                  stroke="var(--accent-violet)" strokeWidth="2.5" strokeDasharray="4 3" opacity="0.95" />
              )}
              {isPath && !isBest && (
                <line x1={u.x} y1={u.y} x2={v.x} y2={v.y}
                  stroke="var(--accent-amber)" strokeWidth="3.5" opacity="1" />
              )}
              {isBest && (
                <line x1={u.x} y1={u.y} x2={v.x} y2={v.y}
                  stroke="var(--accent-lime)" strokeWidth="4" opacity="1" />
              )}
              {formulaOverlay && (
                <text x={(u.x+v.x)/2} y={(u.y+v.y)/2 - 4} className="edge-w"
                  textAnchor="middle">
                  {e.distance_m}m
                </text>
              )}
            </g>
          );
        })}
      </g>

      {Object.entries(fireIntensity).map(([id, intensity]) => {
        const n = nodeIndex[id]; if (!n) return null;
        const isFire = id === fireNode;
        const r = isFire ? 90 : 55;
        return (
          <circle key={`glow-${id}`} cx={n.x} cy={n.y} r={r}
            fill={`url(#${intensity > 0.5 || isFire ? 'firehigh' : 'firelow'})`} />
        );
      })}

      {nodes.map(n => {
        const intensity = fireIntensity[n.id];
        const isFire = n.id === fireNode;
        const isMax = maxflowBadges[n.id] != null;
        const isHL = highlightedNode === n.id;
        const onPath = nodeOnPath.has(n.id);

        let fill = 'var(--bg-3)';
        let stroke = 'var(--line-3)';
        let strokeW = 1.5;
        if (n.type === 'exit') { fill = 'var(--bg-3)'; stroke = 'var(--accent-lime)'; strokeW = 2; }
        if (n.type === 'stair') { fill = 'var(--bg-3)'; stroke = 'var(--accent-violet)'; strokeW = 1.5; }
        if (n.type === 'corridor') { fill = 'var(--bg-2)'; stroke = 'var(--line-3)'; }
        if (n.type === 'room') { fill = 'var(--bg-3)'; stroke = 'var(--line-3)'; }
        if (intensity != null) {
          fill = `oklch(${0.62 - intensity * 0.18} ${0.16 + intensity * 0.04} ${75 - intensity * 50})`;
          stroke = `oklch(${0.78 - intensity * 0.10} 0.15 ${60 - intensity * 40})`;
          strokeW = 2 + intensity * 2;
        }
        if (isFire) {
          fill = 'var(--accent-red)';
          stroke = 'oklch(0.85 0.16 25)';
          strokeW = 3;
        }
        if (onPath && !isFire && intensity == null) {
          stroke = 'var(--accent-amber)';
          strokeW = 2.5;
        }
        if (isHL && !isFire) {
          stroke = 'var(--accent-cyan)';
          strokeW = 2.5;
        }

        const w = n.type === 'corridor' ? 80 : n.type === 'room' ? 60 : 44;
        const h = n.type === 'corridor' ? 26 : n.type === 'room' ? 38 : 32;
        const cap = n.cap ?? n.capacity ?? 0;
        return (
          <g key={n.id} className="node"
            onClick={() => onNodeClick && onNodeClick(n.id)}
            style={{ cursor: onNodeClick ? 'pointer' : 'default' }}>
            {isFire && (
              <circle cx={n.x} cy={n.y} r="34">
                <animate attributeName="r" values="22;38;22" dur="1.6s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite"/>
                <set attributeName="fill" to="var(--accent-red)" />
              </circle>
            )}
            <rect x={n.x - w/2} y={n.y - h/2} width={w} height={h} rx="4"
              fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <text x={n.x} y={n.y - 2} className={`node-id ${n.type}`} textAnchor="middle">
              {n.id}
            </text>
            <text x={n.x} y={n.y + 11} className="node-cap" textAnchor="middle">
              {n.type === 'room' ? `${cap}p` : n.type === 'exit' ? 'EXIT' : n.type === 'stair' ? '↕' : '═'}
            </text>
            {isMax && (
              <g>
                <rect x={n.x + w/2 + 4} y={n.y - 14} width="44" height="18" rx="3"
                  fill="var(--bg-1)" stroke="var(--accent-cyan)" />
                <text x={n.x + w/2 + 26} y={n.y - 1} className="badge-text" textAnchor="middle">
                  {maxflowBadges[n.id]}p
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Evacuees — one dot per occupied room, moving along its route as
          the fire timeline plays. Arrived dots fade at their exit. */}
      <g>
        {evacuees.map(p => (
          <g key={`evac-${p.source}`} opacity={p.arrived ? 0.45 : 1}>
            <circle cx={p.x} cy={p.y} r={p.arrived ? 5 : 7}
              fill="var(--accent-cyan)" stroke="var(--bg-0)" strokeWidth="1.5" />
            {!p.arrived && (
              <circle cx={p.x} cy={p.y} r="11" fill="none"
                stroke="var(--accent-cyan)" strokeWidth="1" opacity="0.5">
                <animate attributeName="r" values="8;13;8" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0.15;0.6" dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
            {p.arrived && (
              <text x={p.x} y={p.y - 9} textAnchor="middle" className="evac-ok">✓</text>
            )}
          </g>
        ))}
      </g>

      <style>{`
        .evac-ok { fill: var(--accent-lime); font-size: 11px; font-weight: 700; }
        .floor-label { fill: var(--ink-3); font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; }
        .floor-label-sub { fill: var(--ink-4); font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; }
        .node-id { font-family: var(--font-mono); font-size: 10px; font-weight: 600; fill: var(--ink-0); letter-spacing: 0.04em; }
        .node-cap { font-family: var(--font-mono); font-size: 8px; fill: var(--ink-2); letter-spacing: 0.06em; }
        .edge-w { fill: var(--ink-3); font-family: var(--font-mono); font-size: 9px; }
        .badge-text { fill: var(--accent-cyan); font-family: var(--font-mono); font-size: 9px; font-weight: 700; }
      `}</style>
    </svg>
  );
}
