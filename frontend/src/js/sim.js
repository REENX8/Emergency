/* Client-side sim engine — faithful to README formulas */

/* ── Adjacency ─────────────────────────────────────────────── */
export const adjacency = (nodes, edges) => {
  const adj = {};
  nodes.forEach(n => { adj[n.id] = []; });
  edges.forEach(e => {
    if (!adj[e.u] || !adj[e.v]) return;
    adj[e.u].push(e);
    adj[e.v].push(e);
  });
  return adj;
};

/* ── Weight formula: w = d / (v_base × (1−ρ) × (1−R)) ─────── */
export const edgeWeight = (e, smoke = 0, density = 0) => {
  const v_base = e.is_stair ? 0.6 : 1.4;
  const dens = Math.min(0.95, density);
  const risk = Math.min(0.99, smoke);
  if (risk >= 0.9) return Infinity;
  return e.distance_m / (v_base * (1 - dens) * (1 - risk));
};

/* ── Smoke propagation:
   s(e) = s_fire × exp(−λ × dist(e, fire)) × φ(θ_wind)        */
export const propagateSmoke = (nodes, edges, fireNodeId, windDeg = 135) => {
  if (!fireNodeId) return {};
  const fire = nodes.find(n => n.id === fireNodeId);
  if (!fire) return {};
  const out = {};
  const lambda = 0.015;
  const windRad = (windDeg * Math.PI) / 180;
  const windVec = { x: Math.sin(windRad), y: -Math.cos(windRad) };
  edges.forEach(e => {
    const u = nodes.find(n => n.id === e.u);
    const v = nodes.find(n => n.id === e.v);
    if (!u || !v) return;
    const midX = (u.x + v.x) / 2;
    const midY = (u.y + v.y) / 2;
    let dist = Math.hypot(midX - fire.x, midY - fire.y);
    if (u.floor !== fire.floor && v.floor !== fire.floor) dist *= 2.6;
    const edx = v.x - u.x, edy = v.y - u.y;
    const mag = Math.hypot(edx, edy) || 1;
    const dot = (edx * windVec.x + edy * windVec.y) / mag;
    const phi = 1 + 0.5 * dot;
    const s = Math.exp(-lambda * dist) * phi;
    out[`${e.u}__${e.v}`] = Math.max(0, Math.min(1, s));
  });
  return out;
};

/* ── Dijkstra single-source ──────────────────────────────────── */
export const dijkstra = (nodes, edges, adj, source, smoke, density) => {
  const dist = {}, prev = {};
  nodes.forEach(n => { dist[n.id] = Infinity; prev[n.id] = null; });
  dist[source] = 0;
  const visited = new Set();
  while (visited.size < nodes.length) {
    let u = null, best = Infinity;
    for (const n of nodes) {
      if (!visited.has(n.id) && dist[n.id] < best) { best = dist[n.id]; u = n.id; }
    }
    if (u == null) break;
    visited.add(u);
    for (const e of adj[u] || []) {
      const v = e.u === u ? e.v : e.u;
      const s = smoke[`${e.u}__${e.v}`] ?? smoke[`${e.v}__${e.u}`] ?? 0;
      const d = density[e.u === u ? e.v : e.u] ?? 0;
      const w = edgeWeight(e, s, d);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  return { dist, prev };
};

export const reconstructPath = (prev, target) => {
  const path = [];
  let cur = target;
  while (cur != null) { path.unshift(cur); cur = prev[cur]; }
  return path.length > 1 ? path : null;
};

/* ── Plan evacuation: for each occupied room, find best exit ─ */
export const planEvacuation = (nodes, edges, opts) => {
  const {
    occupied_rooms = [], blocked_exits = [],
    crowd = {}, smoke = {}, algorithm = 'dijkstra',
  } = opts;
  const adj = adjacency(nodes, edges);
  const exits = nodes.filter(n => n.type === 'exit' && !blocked_exits.includes(n.id)).map(n => n.id);
  const routes = [];
  occupied_rooms.forEach(roomId => {
    const { dist, prev } = dijkstra(nodes, edges, adj, roomId, smoke, crowd);
    let best = null;
    exits.forEach(exitId => {
      if (dist[exitId] < Infinity && (!best || dist[exitId] < best.t)) {
        best = { t: dist[exitId], exit: exitId, path: reconstructPath(prev, exitId) };
      }
    });
    if (best && best.path) {
      routes.push({
        source: roomId, exit: best.exit, path: best.path,
        time_s: best.t, reachable: true,
        algorithm,
        hops: best.path.length - 1,
      });
    } else {
      routes.push({ source: roomId, exit: null, path: null, time_s: Infinity, reachable: false, algorithm });
    }
  });
  return routes;
};

/* ── Fire spread (Dijkstra-based reach-time per node) ────────── */
export const computeFireSpread = (nodes, edges, fireNodeId, windDeg = 135, windSpeed = 3.5) => {
  if (!fireNodeId) return null;
  const adj = adjacency(nodes, edges);
  const fire = nodes.find(n => n.id === fireNodeId);
  if (!fire) return null;
  const V_BASE = 0.02;
  const typeMult = { room: 1.0, corridor: 1.5, stair: 2.5, exit: 0.5 };
  const windRad = (windDeg * Math.PI) / 180;
  const windVec = { x: Math.sin(windRad), y: -Math.cos(windRad) };
  const dist = {};
  nodes.forEach(n => { dist[n.id] = Infinity; });
  dist[fireNodeId] = 0;
  const visited = new Set();
  while (visited.size < nodes.length) {
    let u = null, best = Infinity;
    for (const n of nodes) {
      if (!visited.has(n.id) && dist[n.id] < best) { best = dist[n.id]; u = n.id; }
    }
    if (u == null) break;
    visited.add(u);
    for (const e of adj[u] || []) {
      const otherId = e.u === u ? e.v : e.u;
      const other = nodes.find(n => n.id === otherId);
      const widthF = Math.min(1, e.width_m / 2);
      const dx = other.x - nodes.find(n => n.id === u).x;
      const dy = other.y - nodes.find(n => n.id === u).y;
      const mag = Math.hypot(dx, dy) || 1;
      const cosA = Math.max(0, (dx * windVec.x + dy * windVec.y) / mag);
      const windF = 1 + 0.8 * cosA * (windSpeed / 5);
      const v_fire = V_BASE * (typeMult[other.type] || 1) * widthF * windF;
      const t = e.distance_m / v_fire;
      if (dist[u] + t < dist[otherId]) dist[otherId] = dist[u] + t;
    }
  }
  const nodesArr = Object.entries(dist)
    .filter(([, v]) => isFinite(v))
    .map(([node, reach_time]) => ({ node, reach_time }));
  const max_time = Math.max(...nodesArr.map(n => n.reach_time));
  return { source: fireNodeId, nodes: nodesArr, max_time };
};

/* ── Safety score (README formula, with stub min-cut) ─────── */
export const safetyScore = (nodes, edges) => {
  const V = nodes.length;
  const exits = nodes.filter(n => n.type === 'exit').length;
  const nonExitCap = nodes.filter(n => n.type !== 'exit').reduce((s, n) => s + (n.cap || n.capacity || 0), 0);
  const minCut = 2;
  const edgeConn = 1;
  const k = 1;
  const s1 = 40 * Math.min(1, exits / (V / 5));
  const s2 = 30 * Math.min(1, minCut / (Math.max(1, nonExitCap) / 10));
  const s3 = 30 * (edgeConn / (k + 1));
  const score = Math.round(s1 + s2 + s3);
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  return {
    score, grade,
    factors: {
      exit_ratio: exits / (V / 5),
      connectivity: minCut / (Math.max(1, nonExitCap) / 10),
      bottleneck_resilience: edgeConn / (k + 1),
    },
  };
};

/* ── Evacuee animation: where is each person at time t? ──────
   Walks each route's path edge-by-edge using the same weighted
   edge times as the router, so the dot arrives exactly when the
   route's time_s elapses. Returns [{source, x, y, arrived, progress}]. */
export const evacueePositions = (nodes, edges, routes, elapsedS, smoke = {}, crowd = {}) => {
  if (!elapsedS || elapsedS <= 0) return [];
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const edgeByKey = {};
  edges.forEach(e => { edgeByKey[`${e.u}__${e.v}`] = e; edgeByKey[`${e.v}__${e.u}`] = e; });

  const out = [];
  routes.forEach(r => {
    if (!r.reachable || !r.path || r.path.length < 2) return;
    let t = elapsedS;
    let total = 0;
    let placed = false;
    for (let i = 0; i < r.path.length - 1; i++) {
      const a = byId[r.path[i]], b = byId[r.path[i + 1]];
      const e = edgeByKey[`${r.path[i]}__${r.path[i + 1]}`];
      if (!a || !b || !e) return;
      const s = smoke[`${e.u}__${e.v}`] ?? smoke[`${e.v}__${e.u}`] ?? 0;
      const d = ((crowd[e.u] ?? 0) + (crowd[e.v] ?? 0)) / 2;
      const w = edgeWeight(e, s, d);
      if (!isFinite(w)) return; // blocked mid-path — treat as not animatable
      total += w;
      if (!placed && t <= w) {
        const f = w > 0 ? t / w : 1;
        out.push({
          source: r.source,
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          arrived: false,
          progress: 0, // filled below once total is known
        });
        placed = true;
      }
      if (!placed) t -= w;
    }
    if (!placed) {
      const exitNode = byId[r.path[r.path.length - 1]];
      out.push({ source: r.source, x: exitNode.x, y: exitNode.y, arrived: true, progress: 1 });
    } else {
      out[out.length - 1].progress = Math.min(1, elapsedS / (total || 1));
    }
  });
  return out;
};
