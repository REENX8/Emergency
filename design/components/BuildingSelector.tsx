import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listBuildings } from '../api/client';
import type { Building } from '../types/building';

interface Props {
  currentId: number | string;
}

/**
 * Compact dropdown in the simulation header that lets the user switch
 * between buildings without going back to the manager page.
 */
export default function BuildingSelector({ currentId }: Props) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    listBuildings()
      .then((bs) => { if (!cancelled) setBuildings(bs); })
      .catch(() => { /* network errors surface elsewhere */ });
    return () => { cancelled = true; };
  }, []);

  if (buildings.length <= 1) return null;

  return (
    <select
      value={String(currentId)}
      onChange={(e) => navigate(`/buildings/${e.target.value}/simulate`)}
      title="สลับอาคาร"
      style={{
        background: '#0f172a',
        color: '#f1f5f9',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        marginLeft: 4,
      }}
    >
      {buildings.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
