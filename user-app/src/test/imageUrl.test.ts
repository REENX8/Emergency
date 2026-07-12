import { afterEach, describe, expect, it, vi } from 'vitest';

// resolveImageUrl reads import.meta.env at call time via vi.stubEnv, but the
// module itself is safe to import statically.
import { resolveImageUrl } from '../lib/imageUrl';

describe('resolveImageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns empty string when the floor has no image', () => {
    expect(resolveImageUrl({ image_filename: '' })).toBe('');
  });

  it('passes full https URLs (Supabase storage) through unchanged', () => {
    const url = 'https://cdn.supabase.co/storage/v1/object/floors/f1.png';
    expect(resolveImageUrl({ image_filename: url })).toBe(url);
  });

  it('uses a relative /uploads path when the API base is relative', async () => {
    vi.stubEnv('VITE_API_URL', '/api');
    vi.resetModules();
    const { resolveImageUrl: resolve } = await import('../lib/imageUrl');
    expect(resolve({ image_filename: 'b1_f1.png' })).toBe('/uploads/b1_f1.png');
  });

  it('strips the /api suffix for a cross-origin API base', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api');
    vi.resetModules();
    const { resolveImageUrl: resolve } = await import('../lib/imageUrl');
    expect(resolve({ image_filename: 'b1_f1.png' })).toBe(
      'http://localhost:8000/uploads/b1_f1.png',
    );
  });
});
