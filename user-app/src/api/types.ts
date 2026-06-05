/**
 * Minimal types the user-app actually consumes. Mirrors backend/schemas.py
 * (room/floor/incident/evacuate). Extra backend fields are tolerated.
 */

export type NodeType = 'room' | 'corridor' | 'stair' | 'exit';
export type IncidentType = 'fire' | 'smoke' | 'crowd';

export interface Building {
  id: number;
  name: string;
  address: string;
  description?: string;
  created_at?: string;
}

export interface Floor {
  id: number;
  building_id: number;
  floor_number: number;
  image_filename: string | null;
  image_width_px: number;
  image_height_px: number;
  scale_px_per_m: number;
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

export interface Incident {
  id: number;
  building_id: number;
  node_key: string;
  incident_type: IncidentType;
  severity: number;
  reported_at: string;
  is_active: boolean;
}

export interface IncidentCreate {
  node_key: string;
  incident_type: IncidentType;
  severity: number;
}

export interface RouteResult {
  exit: string;
  path: string[];
  cost_seconds: number | null;
  reachable: boolean;
  algorithm?: string;
}

export interface EvacuateRequest {
  fire_location: string;
  blocked_exits?: string[];
  crowd_densities?: { node_key: string; density: number }[];
  use_weather_wind?: boolean;
  manual_wind_direction?: number | null;
  manual_wind_speed?: number | null;
  algorithm?: 'dijkstra' | 'astar';
  compare_algorithms?: boolean;
  occupied_rooms?: string[];
}

export interface EvacuationEstimate {
  overall_seconds: number;
  per_room: Record<string, RouteResult>;
  algorithm: string;
}

export interface EvacuateResponse {
  fire_location: string;
  primary_routes: RouteResult[];
  smoke_blocked_edges: [string, string][];
  removed_exits: string[];
  evacuation_estimate?: EvacuationEstimate;
  graph_state?: { nodes: any[]; edges: any[] };
  floors?: Floor[];
}
