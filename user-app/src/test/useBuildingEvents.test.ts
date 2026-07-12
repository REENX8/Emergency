import { describe, expect, it } from 'vitest';

import { wsUrlFor } from '../hooks/useBuildingEvents';

// API_URL defaults to '/api' in the test env (VITE_API_URL unset), which is
// exactly the production nginx configuration — the case that used to produce
// an invalid scheme-less WebSocket URL.
describe('wsUrlFor', () => {
  it('derives ws://host from window.location for a relative API base', () => {
    const url = wsUrlFor(12);
    expect(url).toBe(`ws://${window.location.host}/api/buildings/12/ws`);
  });

  it('produces a parseable absolute URL', () => {
    expect(() => new URL(wsUrlFor(1))).not.toThrow();
  });
});
