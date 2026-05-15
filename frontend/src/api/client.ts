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

const TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Attach the bearer token to every outgoing request when present.
http.interceptors.request.use((config) => {
  const tok = getToken();
  if (tok) {
    (config.headers as any).Authorization = `Bearer ${tok}`;
  }
  return config;
});

// Capture the backend timing header so the UI can surface it; on 401
// expire the local token so guarded screens redirect to login.
let lastProcessTimeMs: number | null = null;
http.interceptors.response.use(
  (resp) => {
    const v = resp.headers?.['x-process-time-ms'];
    if (v != null) lastProcessTimeMs = Number(v);
    return resp;
  },
  (error) => {
    if (error?.response?.status === 401) {
      setToken(null);
    }
    return Promise.reject(error);
  },
);

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

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: number;
  email: string;
  created_at: string;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const { data } = await http.post<AuthUser>('/auth/register', { email, password });
  return data;
}

export async function login(email: string, password: string): Promise<string> {
  const { data } = await http.post<{ access_token: string }>('/auth/login', { email, password });
  setToken(data.access_token);
  return data.access_token;
}

export function logout(): void {
  setToken(null);
}

export async function me(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const { data } = await http.get<AuthUser>('/auth/me');
    return data;
  } catch {
    return null;
  }
}
