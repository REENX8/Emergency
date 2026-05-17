import type { BuildingNode } from '../api/types';

interface Props {
  path: string[] | undefined;
  nodesById: Map<string, BuildingNode>;
}

/**
 * Renders the user's evacuation path as an SVG polyline through the node
 * coordinates of the current floor. A wide white halo underneath keeps the
 * green line readable on any background — light floor plan or dark.
 */
export default function RouteOverlay({ path, nodesById }: Props) {
  if (!path || path.length < 2) return null;

  const points: string[] = [];
  for (const key of path) {
    const n = nodesById.get(key);
    if (!n) continue;
    points.push(`${n.x},${n.y}`);
  }
  if (points.length < 2) return null;
  const d = points.join(' ');

  return (
    <g pointerEvents="none">
      <polyline points={d} fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={d} fill="none" stroke="#22c55e" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
