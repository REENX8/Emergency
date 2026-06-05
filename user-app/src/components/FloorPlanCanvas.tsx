import { useMemo, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

import type { BuildingEdge, BuildingNode, Floor, Incident } from '../api/types';
import { resolveImageUrl } from '../lib/imageUrl';
import NodeMarkers from './NodeMarkers';
import RouteOverlay from './RouteOverlay';

interface Props {
  floor: Floor;
  nodes: BuildingNode[];          // already filtered to this floor
  edges: BuildingEdge[];          // for schematic fallback (only used if no image)
  incidents: Incident[];          // already filtered to this floor
  userNodeKey: string | null;
  routePath: string[] | undefined;
  onTapNode: (key: string) => void;
  onLongPressNode?: (key: string) => void;
}

/**
 * Pannable / pinch-zoomable floor view.
 *
 * Layout: the floor image (or, when missing, a derived bbox) sits inside a
 * relatively-positioned wrapper with an SVG overlay using the same pixel
 * viewBox. Because both elements live inside the same react-zoom-pan-pinch
 * transform, node markers stay aligned with the image at every zoom level.
 */
export default function FloorPlanCanvas(props: Props) {
  const { floor, nodes, edges, incidents, userNodeKey, routePath, onTapNode, onLongPressNode } = props;

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.node_key, n])), [nodes]);
  const [imgFailed, setImgFailed] = useState(false);

  const imgUrl = resolveImageUrl(floor);
  const hasImage = !!imgUrl && !imgFailed && floor.image_width_px > 0 && floor.image_height_px > 0;

  // Schematic fallback dimensions: bounding box of all node coords + padding.
  const fallbackBox = useMemo(() => {
    if (hasImage || nodes.length === 0) return null;
    const pad = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
    }
    if (!isFinite(minX)) return { x: 0, y: 0, w: 800, h: 600 };
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + 2 * pad, h: (maxY - minY) + 2 * pad };
  }, [hasImage, nodes]);

  const w = hasImage ? floor.image_width_px : fallbackBox?.w ?? 800;
  const h = hasImage ? floor.image_height_px : fallbackBox?.h ?? 600;
  const viewBox = hasImage ? `0 0 ${w} ${h}` : `${fallbackBox?.x ?? 0} ${fallbackBox?.y ?? 0} ${w} ${h}`;

  return (
    <div className="canvas-host">
      <TransformWrapper
        minScale={0.4}
        maxScale={6}
        initialScale={1}
        centerOnInit
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
        panning={{ velocityDisabled: true }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%' }}
        >
          <div style={{ position: 'relative', width: w, height: h }}>
            {hasImage ? (
              <img
                src={imgUrl}
                alt="floor plan"
                onError={() => setImgFailed(true)}
                style={{ display: 'block', width: '100%', height: '100%', userSelect: 'none', pointerEvents: 'none' }}
                draggable={false}
              />
            ) : (
              <div className="schematic-bg" style={{ width: '100%', height: '100%' }} />
            )}

            <svg
              viewBox={viewBox}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
            >
              {/* Schematic edge layer (only when no image) */}
              {!hasImage && (
                <g>
                  {edges.map((e) => {
                    const u = nodesById.get(e.u_key);
                    const v = nodesById.get(e.v_key);
                    if (!u || !v) return null;
                    return (
                      <line
                        key={e.id}
                        x1={u.x} y1={u.y} x2={v.x} y2={v.y}
                        stroke={e.is_stair ? '#a78bfa' : '#475569'}
                        strokeWidth={e.is_stair ? 3 : 2}
                        strokeOpacity="0.55"
                        strokeDasharray={e.is_stair ? '6 4' : undefined}
                      />
                    );
                  })}
                </g>
              )}

              <RouteOverlay path={routePath} nodesById={nodesById} />
              <NodeMarkers
                nodes={nodes}
                incidents={incidents}
                userNodeKey={userNodeKey}
                onTapNode={onTapNode}
                onLongPressNode={onLongPressNode}
              />
            </svg>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
