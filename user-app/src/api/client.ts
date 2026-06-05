/**
 * Typed axios wrapper for the user-app. Anonymous: no auth interceptor, no
 * token storage. Endpoints used here are public on the backend (POST
 * /incidents has its auth dependency removed for end-user reporting).
 */
import axios, { AxiosResponse } from 'axios';

import type {
  Building,
  BuildingEdge,
  BuildingNode,
  EvacuateRequest,
  EvacuateResponse,
  Floor,
  Incident,
  IncidentCreate,
} from './types';

const RAW_API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const API_URL = RAW_API;

export const http = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

// Backend list endpoints return a `Page<T>` envelope `{items, total, limit, offset}`.
// /floors and /edges still return arrays — they aren't paginated yet.
interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export async function listBuildings(): Promise<Building[]> {
  const { data } = await http.get<Page<Building>>('/buildings', { params: { limit: 500 } });
  return data.items;
}

export async function getBuilding(id: number | string): Promise<Building> {
  const { data } = await http.get<Building>(`/buildings/${id}`);
  return data;
}

export async function listFloors(id: number | string): Promise<Floor[]> {
  const { data } = await http.get<Floor[]>(`/buildings/${id}/floors`);
  return data;
}

export async function listNodes(id: number | string): Promise<BuildingNode[]> {
  const { data } = await http.get<Page<BuildingNode>>(
    `/buildings/${id}/nodes`,
    { params: { limit: 500 } },
  );
  return data.items;
}

export async function listEdges(id: number | string): Promise<BuildingEdge[]> {
  const { data } = await http.get<BuildingEdge[]>(`/buildings/${id}/edges`);
  return data;
}

export async function listIncidents(id: number | string, activeOnly = true): Promise<Incident[]> {
  const { data } = await http.get<Page<Incident>>(`/buildings/${id}/incidents`, {
    params: { active_only: activeOnly, limit: 200 },
  });
  return data.items;
}

export async function reportIncident(id: number | string, body: IncidentCreate): Promise<Incident> {
  const { data } = await http.post<Incident>(`/buildings/${id}/incidents`, body);
  return data;
}

export function runEvacuate(
  id: number | string,
  req: EvacuateRequest,
): Promise<AxiosResponse<EvacuateResponse>> {
  return http.post<EvacuateResponse>(`/buildings/${id}/evacuate`, req);
}
