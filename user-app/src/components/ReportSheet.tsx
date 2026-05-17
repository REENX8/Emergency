import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { reportIncident } from '../api/client';
import type { BuildingNode, Incident, IncidentType } from '../api/types';

interface Props {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  defaultNodeKey: string | null;
  nodesById: Map<string, BuildingNode>;
  floorNodes: BuildingNode[];      // for the picker
  onChangeNode: () => void;        // close sheet + let user pick a different node on map
}

const TYPES: { key: IncidentType; label: string; icon: string; color: string }[] = [
  { key: 'fire',  label: 'ไฟไหม้', icon: '🔥', color: '#ef4444' },
  { key: 'smoke', label: 'ควัน',   icon: '💨', color: '#f59e0b' },
  { key: 'crowd', label: 'คนแน่น/ทางตัน', icon: '👥', color: '#f97316' },
];

const SEVERITIES: { label: string; value: number }[] = [
  { label: 'เล็กน้อย', value: 0.3 },
  { label: 'ปานกลาง', value: 0.6 },
  { label: 'รุนแรง',   value: 0.9 },
];

export default function ReportSheet(props: Props) {
  const { open, onClose, buildingId, defaultNodeKey, nodesById, onChangeNode } = props;
  const [type, setType] = useState<IncidentType>('fire');
  const [severity, setSeverity] = useState(0.6);
  const qc = useQueryClient();

  const targetNode = defaultNodeKey ? nodesById.get(defaultNodeKey) : undefined;

  const mutation = useMutation({
    mutationFn: () =>
      reportIncident(buildingId, { node_key: defaultNodeKey!, incident_type: type, severity }),
    onMutate: async (): Promise<{ prev: Incident[] | undefined }> => {
      await qc.cancelQueries({ queryKey: ['incidents', buildingId] });
      const prev = qc.getQueryData<Incident[]>(['incidents', buildingId]);
      qc.setQueryData<Incident[]>(['incidents', buildingId], (old = []) => [
        {
          id: -Date.now(),
          building_id: Number(buildingId),
          node_key: defaultNodeKey!,
          incident_type: type,
          severity,
          reported_at: new Date().toISOString(),
          is_active: true,
        },
        ...old,
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['incidents', buildingId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['incidents', buildingId] });
    },
    onSuccess: () => {
      onClose();
    },
  });

  if (!open) return null;

  const canSubmit = !!defaultNodeKey && !mutation.isPending;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="แจ้งเหตุ">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">แจ้งเหตุที่จุดนี้</div>
          <button className="sheet-close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <div className="sheet-section">
          <div className="sheet-label">ตำแหน่ง</div>
          {targetNode ? (
            <div className="sheet-location">
              <div className="sheet-location-name">{targetNode.label || targetNode.node_key}</div>
              <button className="link-btn" onClick={() => { onClose(); onChangeNode(); }}>เปลี่ยน</button>
            </div>
          ) : (
            <div className="sheet-location warn">
              ยังไม่ได้เลือกตำแหน่ง — ปิดแล้วแตะจุดบนแผนผัง
            </div>
          )}
        </div>

        <div className="sheet-section">
          <div className="sheet-label">ประเภทเหตุการณ์</div>
          <div className="chip-row big">
            {TYPES.map((t) => (
              <button
                key={t.key}
                className={`big-chip ${type === t.key ? 'on' : ''}`}
                style={type === t.key ? { borderColor: t.color, color: t.color } : undefined}
                onClick={() => setType(t.key)}
              >
                <span className="big-chip-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sheet-section">
          <div className="sheet-label">ความรุนแรง</div>
          <div className="chip-row">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                className={`sev-chip ${severity === s.value ? 'on' : ''}`}
                onClick={() => setSeverity(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet-actions">
          <button className="primary-btn danger" disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'กำลังส่ง…' : 'ยืนยันส่ง'}
          </button>
          {mutation.isError && <div className="sheet-err">ส่งไม่สำเร็จ ลองอีกครั้ง</div>}
        </div>
      </div>
    </>
  );
}
