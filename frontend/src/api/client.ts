/**
 * Typed axios wrapper. All HTTP calls go through this module so we can
 * (1) own the base URL configuration in one place, (2) add request /
 * response interceptors (timing badge, future auth header), and
 * (3) get autocompletion on every endpoint.
 */
import axios, { AxiosResponse } from 'axios';

import type {
  Building,
  BuildingNode,
  EvacuateRequest,
  EvacuateResponse,
  FireSpreadResponse,
  Weather,
} from '../types/building';

// In production (Docker / Render) the frontend is served from the same
// origin behind a reverse proxy, so a relative '' baseURL hits /api/*.
// In dev (CRA proxy or REACT_APP_API_URL=http://localhost:8000) the env
// var wins. The trailing slash is stripped because every call below
// supplies its own leading slash.
const RAW_API = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const API_URL = RAW_API;

export const http = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Capture the backend timing header so the UI can surface it.
let lastProcessTimeMs: number | null = null;
http.interceptors.response.use((resp) => {
  const v = resp.headers?.['x-process-time-ms'];
  if (v != null) lastProcessTimeMs = Number(v);
  return resp;
});

export function getLastProcessTimeMs(): number | null {
  return lastProcessTimeMs;
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

export async function listBuildings(): Promise<Building[]> {
  const { data } = await http.get<Building[]>('/buildings');
  return data;
}

export async function getBuilding(id: number | string): Promise<Building> {
  const { data } = await http.get<Building>(`/buildings/${id}`);
  return data;
}

export async function listNodes(id: number | string): Promise<BuildingNode[]> {
  const { data } = await http.get<BuildingNode[]>(`/buildings/${id}/nodes`);
  return data;
}

export async function getGraph(id: number | string): Promise<any> {
  const { data } = await http.get(`/buildings/${id}/graph`);
  return data;
}

export async function getWeather(): Promise<Weather> {
  const { data } = await http.get<Weather>('/weather');
  return data;
}

export function runEvacuate(
  id: number | string,
  req: EvacuateRequest,
): Promise<AxiosResponse<EvacuateResponse>> {
  return http.post<EvacuateResponse>(`/buildings/${id}/evacuate`, req);
}

export function runCompare(
  id: number | string,
  req: Pick<EvacuateRequest,
    | 'fire_location'
    | 'crowd_densities'
    | 'use_weather_wind'
    | 'manual_wind_direction'
    | 'manual_wind_speed'
  >,
): Promise<AxiosResponse<EvacuateResponse>> {
  return http.post<EvacuateResponse>(`/buildings/${id}/evacuate/compare`, req);
}

export function runFireSpread(
  id: number | string,
  body: { fire_node: string; use_weather_wind?: boolean },
): Promise<AxiosResponse<FireSpreadResponse>> {
  return http.post<FireSpreadResponse>(`/buildings/${id}/fire/spread`, body);
}
