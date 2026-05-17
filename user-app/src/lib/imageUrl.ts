import type { Floor } from '../api/types';

/**
 * Resolve a floor's `image_filename` to a URL the browser can load.
 *
 * - Supabase storage path → already a full https URL, return as-is.
 * - Local upload (e.g. "b1_f1_abc.png") → served by backend at /uploads/.
 *   When VITE_API_URL is set we hit it cross-origin; otherwise (dev proxy
 *   or production same-origin nginx) a relative /uploads path works.
 */
export function resolveImageUrl(floor: Pick<Floor, 'image_filename'>): string {
  const f = floor.image_filename;
  if (!f) return '';
  if (f.startsWith('http://') || f.startsWith('https://')) return f;

  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  // In dev, VITE_API_URL is unset and the vite proxy maps /uploads → backend.
  // In docker prod, VITE_API_URL='/api'; uploads is proxied separately by nginx
  // on the same origin → use a relative '/uploads' path.
  if (!apiBase || apiBase.startsWith('/')) return `/uploads/${f}`;
  // Cross-origin dev: VITE_API_URL=http://localhost:8000 → strip the /api
  // suffix if present (uploads sits at the root of the backend, not under /api).
  const origin = apiBase.replace(/\/api$/, '');
  return `${origin}/uploads/${f}`;
}
