/* Unit tests for the client-side sim engine (js/sim.js). Run via
   `npm test` (react-scripts/jest). These mirror the backend formulas —
   if the two engines drift, these are the first tests to look at. */
import {
  adjacency,
  edgeWeight,
  propagateSmoke,
  dijkstra,
  reconstructPath,
  planEvacuation,
  computeFireSpread,
  safetyScore,
} from './sim';

const nodes = [
  { id: 'r1', type: 'room', x: 0, y: 0, floor: 1, capacity: 30 },
  { id: 'c1', type: 'corridor', x: 60, y: 0, floor: 1, capacity: 0 },
  { id: 'e1', type: 'exit', x: 120, y: 0, floor: 1, capacity: 0 },
  { id: 'e2', type: 'exit', x: 0, y: 120, floor: 1, capacity: 0 },
];
const edges = [
  { u: 'r1', v: 'c1', distance_m: 10, width_m: 2, is_stair: false },
  { u: 'c1', v: 'e1', distance_m: 10, width_m: 2, is_stair: false },
  { u: 'r1', v: 'e2', distance_m: 40, width_m: 2, is_stair: false },
];

describe('edgeWeight — w = d / (v_base × (1−ρ) × (1−R))', () => {
  const e = { distance_m: 14, is_stair: false };

  it('is distance over 1.4 m/s on a clear corridor', () => {
    expect(edgeWeight(e)).toBeCloseTo(10);
  });

  it('uses 0.6 m/s on stairs', () => {
    expect(edgeWeight({ distance_m: 6, is_stair: true })).toBeCloseTo(10);
  });

  it('slows down with crowd density and smoke', () => {
    expect(edgeWeight(e, 0.5, 0)).toBeCloseTo(20);
    expect(edgeWeight(e, 0, 0.5)).toBeCloseTo(20);
  });

  it('is impassable at smoke >= 0.9', () => {
    expect(edgeWeight(e, 0.9)).toBe(Infinity);
  });
});

describe('propagateSmoke', () => {
  it('gives more smoke to edges nearer the fire', () => {
    const smoke = propagateSmoke(nodes, edges, 'r1');
    expect(smoke['r1__c1']).toBeGreaterThan(smoke['c1__e1']);
  });

  it('returns empty map without a fire node', () => {
    expect(propagateSmoke(nodes, edges, null)).toEqual({});
    expect(propagateSmoke(nodes, edges, 'ghost')).toEqual({});
  });
});

describe('dijkstra + reconstructPath', () => {
  it('finds the shortest path to the exit', () => {
    const adj = adjacency(nodes, edges);
    const { dist, prev } = dijkstra(nodes, edges, adj, 'r1', {}, {});
    expect(dist.e1).toBeCloseTo(20 / 1.4);
    expect(reconstructPath(prev, 'e1')).toEqual(['r1', 'c1', 'e1']);
  });

  it('reroutes around smoke-blocked edges', () => {
    const adj = adjacency(nodes, edges);
    const smoke = { r1__c1: 0.95 }; // direct corridor lethal
    const { dist, prev } = dijkstra(nodes, edges, adj, 'r1', smoke, {});
    expect(reconstructPath(prev, 'e2')).toEqual(['r1', 'e2']);
    expect(dist.e1).toBe(Infinity); // only reachable through the blocked edge
  });
});

describe('planEvacuation', () => {
  it('routes each occupied room to its best reachable exit', () => {
    const routes = planEvacuation(nodes, edges, { occupied_rooms: ['r1'] });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ source: 'r1', exit: 'e1', reachable: true, hops: 2 });
  });

  it('respects blocked exits', () => {
    const routes = planEvacuation(nodes, edges, {
      occupied_rooms: ['r1'],
      blocked_exits: ['e1'],
    });
    expect(routes[0].exit).toBe('e2');
  });

  it('marks rooms with no route as unreachable', () => {
    const routes = planEvacuation(nodes, edges, {
      occupied_rooms: ['r1'],
      blocked_exits: ['e1', 'e2'],
    });
    expect(routes[0].reachable).toBe(false);
    expect(routes[0].time_s).toBe(Infinity);
  });
});

describe('computeFireSpread', () => {
  it('reaches nearer nodes sooner and reports max_time', () => {
    const spread = computeFireSpread(nodes, edges, 'r1');
    const byNode = Object.fromEntries(spread.nodes.map((n) => [n.node, n.reach_time]));
    expect(byNode.r1).toBe(0);
    expect(byNode.c1).toBeLessThan(byNode.e1);
    expect(spread.max_time).toBeGreaterThan(0);
  });
});

describe('safetyScore', () => {
  it('produces a bounded score with a letter grade', () => {
    const { score, grade } = safetyScore(nodes, edges);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(grade);
  });

  it('scores more exits higher', () => {
    const fewer = safetyScore(nodes.filter((n) => n.id !== 'e2'), edges);
    const more = safetyScore(nodes, edges);
    expect(more.score).toBeGreaterThanOrEqual(fewer.score);
  });
});
