import { afterEach, describe, expect, it, vi } from 'vitest';

import { http, listBuildings, listIncidents, reportIncident } from '../api/client';

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps the {items} pagination envelope from /buildings', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { items: [{ id: 1, name: 'A' }], total: 1, limit: 500, offset: 0 },
    });
    const buildings = await listBuildings();
    expect(buildings).toEqual([{ id: 1, name: 'A' }]);
    expect(spy).toHaveBeenCalledWith('/buildings', { params: { limit: 500 } });
  });

  it('requests only active incidents by default', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: { items: [], total: 0, limit: 200, offset: 0 },
    });
    await listIncidents(7);
    expect(spy).toHaveBeenCalledWith('/buildings/7/incidents', {
      params: { active_only: true, limit: 200 },
    });
  });

  it('posts anonymous incident reports to the right endpoint', async () => {
    const spy = vi.spyOn(http, 'post').mockResolvedValue({ data: { id: 9 } });
    await reportIncident(3, { node_key: 'r101', incident_type: 'fire', severity: 0.8 });
    expect(spy).toHaveBeenCalledWith('/buildings/3/incidents', {
      node_key: 'r101',
      incident_type: 'fire',
      severity: 0.8,
    });
  });
});
