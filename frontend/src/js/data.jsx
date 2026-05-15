/* Building data — three floors, faithful to backend node_key scheme */

const BUILDING = {
  id: 1,
  name: 'อาคาร A — คณะวิทยาศาสตร์',
  address: 'มหาวิทยาลัยเชียงใหม่ · เชียงใหม่',
  description: '3 ชั้น · 9 ห้อง · ความจุ 90 คน',
  tmd_station: '503201',
};

/* Coordinates in a 1080×740 viewBox, 3 stacked floor bands. */
const F3 = 110, F2 = 360, F1 = 610;

const NODES = [
  /* Floor 3 */
  { id: 'r301', type: 'room',     label: 'ห้อง 301', x: 220, y: F3,    floor: 3, cap: 10 },
  { id: 'r302', type: 'room',     label: 'ห้อง 302', x: 480, y: F3,    floor: 3, cap: 10 },
  { id: 'r303', type: 'room',     label: 'ห้อง 303', x: 740, y: F3,    floor: 3, cap: 10 },
  { id: 'stair_a_f3', type: 'stair', label: 'บันได A', x: 90,  y: F3+50, floor: 3, cap: 0 },
  { id: 'c3',   type: 'corridor', label: 'ทางเดิน 3', x: 480, y: F3+90, floor: 3, cap: 0 },
  { id: 'stair_b_f3', type: 'stair', label: 'บันได B', x: 880, y: F3+50, floor: 3, cap: 0 },
  /* Floor 2 */
  { id: 'r201', type: 'room',     label: 'ห้อง 201', x: 220, y: F2,    floor: 2, cap: 10 },
  { id: 'r202', type: 'room',     label: 'ห้อง 202', x: 480, y: F2,    floor: 2, cap: 10 },
  { id: 'r203', type: 'room',     label: 'ห้อง 203', x: 740, y: F2,    floor: 2, cap: 10 },
  { id: 'stair_a_f2', type: 'stair', label: 'บันได A', x: 90,  y: F2+50, floor: 2, cap: 0 },
  { id: 'c2',   type: 'corridor', label: 'ทางเดิน 2', x: 480, y: F2+90, floor: 2, cap: 0 },
  { id: 'stair_b_f2', type: 'stair', label: 'บันได B', x: 880, y: F2+50, floor: 2, cap: 0 },
  /* Floor 1 */
  { id: 'r101', type: 'room',     label: 'ห้อง 101', x: 220, y: F1,    floor: 1, cap: 10 },
  { id: 'r102', type: 'room',     label: 'ห้อง 102', x: 480, y: F1,    floor: 1, cap: 10 },
  { id: 'r103', type: 'room',     label: 'ห้อง 103', x: 740, y: F1,    floor: 1, cap: 10 },
  { id: 'stair_a_f1', type: 'stair', label: 'บันได A', x: 90,  y: F1+50, floor: 1, cap: 0 },
  { id: 'c1',   type: 'corridor', label: 'ทางเดิน 1', x: 480, y: F1+90, floor: 1, cap: 0 },
  { id: 'stair_b_f1', type: 'stair', label: 'บันได B', x: 880, y: F1+50, floor: 1, cap: 0 },
  /* Exits — ground level */
  { id: 'exit1', type: 'exit', label: 'ทางออก 1', x: 30,   y: F1+90, floor: 1, cap: 0 },
  { id: 'exit2', type: 'exit', label: 'ทางออก 2', x: 1040, y: F1+90, floor: 1, cap: 0 },
];

const E = (u, v, distance_m, width_m = 2, is_stair = false) =>
  ({ u, v, distance_m, width_m, is_stair });

const EDGES = [
  /* Floor 3 horizontal */
  E('r301', 'c3', 14), E('r302', 'c3', 8), E('r303', 'c3', 14),
  E('stair_a_f3', 'c3', 18), E('stair_b_f3', 'c3', 18),
  /* Floor 2 */
  E('r201', 'c2', 14), E('r202', 'c2', 8), E('r203', 'c2', 14),
  E('stair_a_f2', 'c2', 18), E('stair_b_f2', 'c2', 18),
  /* Floor 1 */
  E('r101', 'c1', 14), E('r102', 'c1', 8), E('r103', 'c1', 14),
  E('stair_a_f1', 'c1', 18), E('stair_b_f1', 'c1', 18),
  /* Stairs vertical */
  E('stair_a_f3', 'stair_a_f2', 6, 1.6, true),
  E('stair_a_f2', 'stair_a_f1', 6, 1.6, true),
  E('stair_b_f3', 'stair_b_f2', 6, 1.6, true),
  E('stair_b_f2', 'stair_b_f1', 6, 1.6, true),
  /* Exits */
  E('stair_a_f1', 'exit1', 6, 2.4),
  E('stair_b_f1', 'exit2', 6, 2.4),
];

/* Multi-building roster for the Manager view */
const BUILDINGS = [
  { id: 1, name: 'อาคาร A — คณะวิทยาศาสตร์',  address: 'มหาวิทยาลัยเชียงใหม่',  description: '3 ชั้น · 9 ห้อง',  nodes: 20, edges: 19, score: 78, grade: 'B', station: '503201 · เชียงใหม่',  created: '2025-09-12' },
  { id: 2, name: 'อาคาร B — หอพักนักศึกษา',     address: 'ถ.สุเทพ ต.สุเทพ',         description: '5 ชั้น · 30 ห้อง', nodes: 64, edges: 71, score: 64, grade: 'C', station: '503201 · เชียงใหม่',  created: '2025-09-28' },
  { id: 3, name: 'อาคาร C — ห้องสมุดกลาง',     address: 'มหาวิทยาลัยเชียงใหม่',   description: '4 ชั้น · 200 คน', nodes: 48, edges: 53, score: 82, grade: 'A', station: '503201 · เชียงใหม่',  created: '2025-10-02' },
  { id: 4, name: 'อาคาร D — คลังเอกสาร',       address: 'ถ.ห้วยแก้ว',              description: '2 ชั้น · เสี่ยงสูง', nodes: 14, edges: 13, score: 38, grade: 'D', station: '515201 · บางนา',     created: '2025-10-19' },
];

const WEATHER = {
  wind_speed_ms: 3.5,
  wind_direction_deg: 135,
  temperature_c: 28.4,
  humidity_pct: 72,
  source: 'TMD Open Data',
  station: '503201 · เชียงใหม่',
  description: 'มีเมฆบางส่วน',
};

const INCIDENTS_LOG = [
  { t: '14:02:11', type: 'fire',  node: 'r201', sev: 'critical', by: 'พ.ต.ท.วิรัช',     status: 'active'   },
  { t: '14:03:47', type: 'smoke', node: 'c2',   sev: 'high',     by: 'auto · ระบบลาม',  status: 'active'   },
  { t: '14:05:09', type: 'crowd', node: 'c1',   sev: 'medium',   by: 'พ.ต.อ.ประสิทธิ์', status: 'tracking' },
  { t: '13:58:30', type: 'smoke', node: 'r202', sev: 'low',      by: 'sensor · MQ-2',   status: 'cleared'  },
];

Object.assign(window, { BUILDING, NODES, EDGES, BUILDINGS, WEATHER, INCIDENTS_LOG });
