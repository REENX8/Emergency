import { useState } from 'react';
import type { BuildingNode, RouteResult } from '../api/types';

interface Props {
  route: RouteResult | undefined;
  loading: boolean;
  error: boolean;
  userNodeLabel: string | null;
  nodesById: Map<string, BuildingNode>;
}

function formatSeconds(s: number | null): string {
  if (s == null || !isFinite(s)) return '—';
  if (s < 60) return `${Math.round(s)} วินาที`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${r.toString().padStart(2, '0')} นาที`;
}

function estimateDistance(path: string[], nodesById: Map<string, BuildingNode>): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = nodesById.get(path[i - 1]);
    const b = nodesById.get(path[i]);
    if (!a || !b) continue;
    total += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return total;
}

/**
 * Bottom card showing the user's evacuation summary. Collapsed by default
 * (compact one-liner); tap to expand and reveal the step-by-step path.
 */
export default function RouteSheet({ route, loading, error, userNodeLabel, nodesById }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!userNodeLabel) {
    return (
      <div className="route-sheet placeholder">
        <div className="route-sheet-hint">แตะห้องของคุณบนแผนผังเพื่อหาเส้นทาง</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="route-sheet">
        <div className="route-sheet-row">
          <span className="spinner" />
          <span>กำลังคำนวณเส้นทาง…</span>
        </div>
      </div>
    );
  }

  if (error || !route || !route.reachable) {
    return (
      <div className="route-sheet danger">
        <div className="route-sheet-row">
          <span style={{ fontSize: 20 }}>⚠</span>
          <div>
            <div style={{ fontWeight: 600 }}>หาเส้นทางไม่ได้</div>
            <div className="route-sheet-sub">ทางออกอาจถูกปิดหมด — แจ้งเจ้าหน้าที่</div>
          </div>
        </div>
      </div>
    );
  }

  const exitNode = nodesById.get(route.exit);
  const exitLabel = exitNode?.label || route.exit;
  const distance = estimateDistance(route.path, nodesById);

  return (
    <div
      className={`route-sheet ok ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
    >
      <div className="route-sheet-handle" />
      <div className="route-sheet-row main">
        <div className="route-sheet-col">
          <div className="route-sheet-small">จาก {userNodeLabel} → ทางออก</div>
          <div className="route-sheet-big">{exitLabel}</div>
        </div>
        <div className="route-sheet-col right">
          <div className="route-sheet-small">เวลา</div>
          <div className="route-sheet-big">{formatSeconds(route.cost_seconds)}</div>
          <div className="route-sheet-small">~{Math.round(distance)} px</div>
        </div>
      </div>

      {expanded && (
        <div className="route-sheet-steps">
          <div className="route-sheet-small">ลำดับห้องตามเส้นทาง</div>
          <ol>
            {route.path.map((k, i) => {
              const n = nodesById.get(k);
              return <li key={`${k}-${i}`}>{n?.label || k}</li>;
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
