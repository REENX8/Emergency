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

export async function listBuildings(): Promise<Building[]> {
  const { data } = await http.get<Building[]>('/buildings');
  return data;
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
  const { data } = await http.get<BuildingNode[]>(`/buildings/${id}/nodes`);
  return data;
}

export async function listEdges(id: number | string): Promise<BuildingEdge[]> {
  const { data } = await http.get<BuildingEdge[]>(`/buildings/${id}/edges`);
  return data;
}

export async function listIncidents(id: number | string, activeOnly = true): Promise<Incident[]> {
  const { data } = await http.get<Incident[]>(`/buildings/${id}/incidents`, {
    params: { active_only: activeOnly },
  });
  return data;
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
