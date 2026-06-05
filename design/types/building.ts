/**
 * Frontend type definitions mirroring `backend/schemas.py`.
 *
 * Only the fields actually consumed by the UI are typed. The backend may
 * include additional fields which TypeScript's structural typing tolerates.
 */

export type NodeType = 'room' | 'corridor' | 'stair' | 'exit';
export type IncidentType = 'fire' | 'smoke' | 'crowd';

export interface Building {
  id: number;
  name: string;
  address: string;
  description: string;
  tmd_station_id: string;
  created_at: string;
}

export interface BuildingNode {
  id: number;
  building_id: number;
  node_key: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  capacity: number;
  floor_number: number;
}

export interface BuildingEdge {
  id: number;
  building_id: number;
  u_key: string;
  v_key: string;
  distance_m: number;
  width_m: number;
  is_stair: boolean;
}

export interface CrowdDensityItem {
  node_key: string;
  density: number;
}

export interface EvacuateRequest {
  fire_location: string;
  blocked_exits?: string[];
  crowd_densities?: CrowdDensityItem[];
  use_weather_wind?: boolean;
  manual_wind_direction?: number | null;
  manual_wind_speed?: number | null;
  algorithm?: 'dijkstra' | 'astar';
  compare_algorithms?: boolean;
  occupied_rooms?: string[];
}

export interface RouteResult {
  exit: string;
  path: string[];
  cost_seconds: number | null;
  reachable: boolean;
  algorithm: string;
}

export interface Weather {
  wind_speed_ms: number;
  wind_direction_deg: number;
  temperature_c: number | null;
  humidity_pct: number | null;
  description: string;
  station: string;
  source: 'tmd' | 'mock' | 'manual';
}

export interface EvacuateResponse {
  fire_location: string;
  primary_routes: RouteResult[];
  comparison: { dijkstra: RouteResult[]; astar: RouteResult[] } | null;
  smoke_blocked_edges: [string, string][];
  removed_exits: string[];
  weather: Weather;
  graph_state: { nodes: any[]; edges: any[] };
  floors?: any[];
}

export interface FireSpreadNode {
  node: string;
  reach_time: number;
}

export interface FireSpreadResponse {
  fire_node: string;
  max_time: number;
  nodes: FireSpreadNode[];
  unreachable: string[];
}
