import type { BuildingNode, Incident, IncidentType } from '../api/types';

interface Props {
  nodes: BuildingNode[];
  incidents: Incident[];
  userNodeKey: string | null;
  onTapNode: (key: string) => void;
  onLongPressNode?: (key: string) => void;
}

const INCIDENT_COLOR: Record<IncidentType, string> = {
  fire: '#ef4444',
  smoke: '#f59e0b',
  crowd: '#f97316',
};

/**
 * SVG markers for every node on the current floor:
 *   - the user's chosen "you are here" (blue, pulsing, biggest)
 *   - exits (lime, "EXIT" label)
 *   - active incidents (red/amber/orange, opacity ∝ severity)
 *   - other rooms (subtle dot; long-press to report at that node)
 *
 * Each marker is wrapped in an invisible 44×44 hitbox so taps work on
 * mobile even when the visible dot is small.
 */
export default function NodeMarkers({ nodes, incidents, userNodeKey, onTapNode, onLongPressNode }: Props) {
  const incidentByNode = new Map<string, Incident>();
  for (const i of incidents) if (!incidentByNode.has(i.node_key)) incidentByNode.set(i.node_key, i);

  let pressTimer: number | null = null;
  let didLongPress = false;
  const handlePointerDown = (key: string) => {
    didLongPress = false;
    if (onLongPressNode) {
      pressTimer = window.setTimeout(() => {
        didLongPress = true;
        onLongPressNode(key);
      }, 500);
    }
  };
  const handlePointerUp = (key: string) => {
    if (pressTimer != null) { window.clearTimeout(pressTimer); pressTimer = null; }
    if (!didLongPress) onTapNode(key);
  };
  const handlePointerCancel = () => {
    if (pressTimer != null) { window.clearTimeout(pressTimer); pressTimer = null; }
  };

  return (
    <g>
      {nodes.map((n) => {
        const incident = incidentByNode.get(n.node_key);
        const isUser = n.node_key === userNodeKey;
        const isExit = n.type === 'exit';
        const isRoom = n.type === 'room';
        const isStair = n.type === 'stair';

        // Render order: subtle base dot first, then important overlays.
        return (
          <g
            key={n.node_key}
            style={{ cursor: 'pointer' }}
            onPointerDown={() => handlePointerDown(n.node_key)}
            onPointerUp={() => handlePointerUp(n.node_key)}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerCancel}
          >
            {/* Hitbox — invisible but ≥44 px world-space depends on zoom; this
                is in viewBox coords so we keep it small to avoid overlap. */}
            <rect x={n.x - 22} y={n.y - 22} width="44" height="44" fill="transparent" />

            {/* Base dot */}
            {isExit ? (
              <>
                <circle cx={n.x} cy={n.y} r="14" fill="#22c55e" stroke="white" strokeWidth="2" />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">OUT</text>
              </>
            ) : isStair ? (
              <rect x={n.x - 10} y={n.y - 10} width="20" height="20" fill="#a78bfa" stroke="white" strokeWidth="1.5" rx="2" />
            ) : isRoom ? (
              <circle cx={n.x} cy={n.y} r="7" fill="#0ea5e9" fillOpacity="0.55" stroke="white" strokeWidth="1.2" />
            ) : (
              <circle cx={n.x} cy={n.y} r="4" fill="#94a3b8" fillOpacity="0.45" />
            )}

            {/* Incident overlay */}
            {incident && (
              <g pointerEvents="none">
                <circle
                  cx={n.x}
                  cy={n.y}
                  r="18"
                  fill={INCIDENT_COLOR[incident.incident_type]}
                  fillOpacity={Math.max(0.5, incident.severity)}
                  stroke="white"
                  strokeWidth="2"
                >
                  {incident.incident_type === 'fire' && (
                    <animate attributeName="r" values="18;22;18" dur="1.4s" repeatCount="indefinite" />
                  )}
                </circle>
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
                  {incident.incident_type === 'fire' ? '🔥' : incident.incident_type === 'smoke' ? '💨' : '👥'}
                </text>
              </g>
            )}

            {/* You-are-here */}
            {isUser && (
              <g pointerEvents="none">
                <circle cx={n.x} cy={n.y} r="22" fill="#3b82f6" fillOpacity="0.25">
                  <animate attributeName="r" values="18;28;18" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.35;0.05;0.35" dur="1.6s" repeatCount="indefinite" />
                </circle>
                <circle cx={n.x} cy={n.y} r="9" fill="#3b82f6" stroke="white" strokeWidth="3" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
