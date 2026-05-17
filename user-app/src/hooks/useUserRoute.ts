import { useQuery } from '@tanstack/react-query';

import { listIncidents, runEvacuate } from '../api/client';
import type { RouteResult } from '../api/types';

/**
 * Polls the backend every 7 s for the user's shortest evacuation route from
 * their selected room to the nearest reachable exit.
 *
 * Why this shape: `/evacuate` requires `fire_location` (a real node in the
 * graph) and returns `primary_routes` from that node — not from the user.
 * To get the user's route we pass `occupied_rooms: [userNodeKey]` and read
 * `evacuation_estimate.per_room[userNodeKey]` (backend computes one per
 * occupied room on the same smoke/fire-weighted graph).
 *
 * `fire_location` fallback chain:
 *   1. first active fire incident → routes correctly avoid the real fire
 *   2. user's own room → no real fire reported yet; smoke penalty stays
 *      localised within a ~20 m radius of the user so the shortest path
 *      out is unchanged.
 */
export interface UserRouteResult extends RouteResult {
  smokeBlockedEdges: [string, string][];
}

export function useUserRoute(buildingId: string | number, userNodeKey: string | null) {
  return useQuery<UserRouteResult>({
    queryKey: ['route', String(buildingId), userNodeKey],
    enabled: !!userNodeKey,
    refetchInterval: 7000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const incidents = await listIncidents(buildingId);
      const fire = incidents.find((i) => i.incident_type === 'fire' && i.is_active);
      const fireLoc = fire?.node_key ?? userNodeKey!;
      const { data } = await runEvacuate(buildingId, {
        fire_location: fireLoc,
        occupied_rooms: [userNodeKey!],
        use_weather_wind: false,
        compare_algorithms: false,
        algorithm: 'dijkstra',
      });
      const best = data.evacuation_estimate?.per_room?.[userNodeKey!];
      if (!best) throw new Error('no_route_returned');
      return { ...best, smokeBlockedEdges: data.smoke_blocked_edges ?? [] };
    },
  });
}
