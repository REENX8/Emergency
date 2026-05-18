/**
 * CompliancePage — Thai building code compliance report (Phase 2).
 *
 * Calls GET /buildings/:id/compliance and presents findings grouped by
 * severity. Also exposes a small form to update the building's metadata
 * (has_sprinkler, building_type, total_floors) since those control which
 * thresholds apply.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { http } from '../api/client';

const SEVERITY_STYLE = {
  fail: { color: '#ef4444', bg: '#7f1d1d22', label: 'ไม่ผ่าน' },
  warn: { color: '#f59e0b', bg: '#78350f22', label: 'แจ้งเตือน' },
  info: { color: '#38bdf8', bg: '#075985aa', label: 'INFO' },
};

const RULE_LABELS = {
  stair_width:     'ความกว้างบันไดหนีไฟ',
  corridor_width:  'ความกว้างทางเดินอพยพ',
  exit_count:      'จำนวนทางออกฉุกเฉิน',
  travel_distance: 'ระยะถึงทางออก',
  dead_end:        'ทางตัน',
  occupancy:       'ความหนาแน่นผู้ใช้อาคาร',
};

const BUILDING_TYPES = [
  { value: 'office',      label: 'สำนักงาน' },
  { value: 'residential', label: 'ที่พักอาศัย' },
  { value: 'assembly',    label: 'ห้องประชุม / รวมตัว' },
  { value: 'mixed',       label: 'ผสม' },
];

export default function CompliancePage() {
  const { buildingId } = useParams();
  const navigate = useNavigate();

  const [building,  setBuilding]  = useState(null);
  const [report,    setReport]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [bRes, cRes] = await Promise.all([
        http.get(`/buildings/${buildingId}`),
        http.get(`/buildings/${buildingId}/compliance`),
      ]);
      setBuilding(bRes.data);
      setReport(cRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => { load(); }, [load]);

  const updateMeta = async (patch) => {
    setSaving(true); setError(null);
    try {
      const { data } = await http.patch(`/buildings/${buildingId}`, patch);
      setBuilding(data);
      // Re-fetch compliance because thresholds may have changed.
      const cRes = await http.get(`/buildings/${buildingId}/compliance`);
      setReport(cRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !report) return <div className="page"><div className="mono dim">โหลด…</div></div>;

  const summary = report?.summary ?? { fail: 0, warn: 0, info: 0 };
  const score   = report?.score ?? 0;
  const scoreColor = score >= 90 ? '#22c55e' : score >= 70 ? '#84cc16' : score >= 50 ? '#f59e0b' : '#ef4444';

  const findingsByRule = (report?.findings ?? []).reduce((acc, f) => {
    (acc[f.rule_id] = acc[f.rule_id] || []).push(f);
    return acc;
  }, {});

  return (
    <div className="page" style={{ padding: 20, color: 'var(--ink-1, #f1f5f9)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="ghost-btn mono small" onClick={() => navigate('/')}>← กลับ</button>
        <h2 style={{ margin: 0 }}>📋 ความสอดคล้องตามกฎกระทรวง</h2>
        {building && <span className="mono dim">— {building.name}</span>}
      </div>

      {error && (
        <div style={{ padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 12 }}>
          ⚠ {error}
        </div>
      )}

      {/* Score card */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: '#0f172a', padding: 20, borderRadius: 10, minWidth: 160 }}>
          <div className="mono dim" style={{ fontSize: 11 }}>COMPLIANCE SCORE</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
            {score}<span style={{ fontSize: 18, color: '#64748b' }}> / 100</span>
          </div>
        </div>
        <div style={{ background: '#0f172a', padding: 20, borderRadius: 10, minWidth: 280 }}>
          <div className="mono dim" style={{ fontSize: 11, marginBottom: 8 }}>SUMMARY</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div><span style={{ fontSize: 24, color: SEVERITY_STYLE.fail.color, fontWeight: 700 }}>{summary.fail}</span><div className="mono dim" style={{ fontSize: 11 }}>FAIL</div></div>
            <div><span style={{ fontSize: 24, color: SEVERITY_STYLE.warn.color, fontWeight: 700 }}>{summary.warn}</span><div className="mono dim" style={{ fontSize: 11 }}>WARN</div></div>
            <div><span style={{ fontSize: 24, color: SEVERITY_STYLE.info.color, fontWeight: 700 }}>{summary.info}</span><div className="mono dim" style={{ fontSize: 11 }}>INFO</div></div>
          </div>
        </div>
      </div>

      {/* Building metadata */}
      {building && (
        <div style={{ background: '#0f172a', padding: 16, borderRadius: 10, marginBottom: 20 }}>
          <div className="mono dim" style={{ fontSize: 11, marginBottom: 10 }}>การตั้งค่าอาคาร — มีผลกับ threshold ที่ใช้ตรวจ</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!building.has_sprinkler}
                disabled={saving}
                onChange={(e) => updateMeta({ has_sprinkler: e.target.checked })}
              />
              <span>💧 มีระบบ Sprinkler</span>
              <span className="mono dim" style={{ fontSize: 11 }}>
                ({building.has_sprinkler ? 'travel distance ≤ 60 m' : 'travel distance ≤ 30 m'})
              </span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="mono dim" style={{ fontSize: 11 }}>ประเภทอาคาร</span>
              <select
                value={building.building_type || 'office'}
                disabled={saving}
                onChange={(e) => updateMeta({ building_type: e.target.value })}
                style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }}
              >
                {BUILDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="mono dim" style={{ fontSize: 11 }}>จำนวนชั้น</span>
              <input
                type="number"
                min={1} max={200}
                value={building.total_floors || 1}
                disabled={saving}
                onChange={(e) => updateMeta({ total_floors: Number(e.target.value) })}
                style={{ width: 80, padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 4 }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Thresholds */}
      {report?.thresholds && (
        <details style={{ background: '#0f172a', padding: 12, borderRadius: 8, marginBottom: 20 }}>
          <summary className="mono dim" style={{ cursor: 'pointer', fontSize: 12 }}>
            🔧 ค่า threshold ที่กำลังใช้ (กฎกระทรวง พ.ศ. 2535)
          </summary>
          <pre style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, overflow: 'auto' }}>
{JSON.stringify(report.thresholds, null, 2)}
          </pre>
        </details>
      )}

      {/* Findings list */}
      <div>
        {(report?.findings?.length ?? 0) === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#22c55e' }}>
            ✓ ผ่านทุกข้อ — ไม่มี finding
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(findingsByRule).map(([ruleId, items]) => (
              <div key={ruleId} style={{ background: '#0f172a', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  {RULE_LABELS[ruleId] || ruleId}
                  <span className="mono dim" style={{ fontSize: 11, marginLeft: 8 }}>{ruleId}</span>
                </div>
                {items.map((f, i) => {
                  const st = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info;
                  return (
                    <div key={i} style={{
                      background: st.bg, borderLeft: `3px solid ${st.color}`,
                      padding: '8px 12px', marginBottom: 4, borderRadius: 4,
                    }}>
                      <div style={{ fontSize: 11, color: st.color, fontWeight: 700, marginBottom: 2 }}>
                        {st.label}
                      </div>
                      <div style={{ fontSize: 13 }}>{f.message}</div>
                      {f.location && Object.keys(f.location).length > 0 && (
                        <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
                          {JSON.stringify(f.location)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
