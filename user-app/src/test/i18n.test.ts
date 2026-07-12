import { describe, expect, it, beforeEach, vi } from 'vitest';

import { getLang, setLang, t } from '../i18n';

describe('i18n', () => {
  beforeEach(() => {
    setLang('th');
  });

  it('defaults to Thai strings', () => {
    expect(getLang()).toBe('th');
    expect(t('incident.type.fire')).toBe('ไฟไหม้');
  });

  it('switches to English and back', () => {
    setLang('en');
    expect(t('incident.type.fire')).toBe('Fire');
    setLang('th');
    expect(t('incident.type.fire')).toBe('ไฟไหม้');
  });

  it('persists the language choice to localStorage', () => {
    setLang('en');
    expect(localStorage.getItem('evac-lang')).toBe('en');
  });

  it('dispatches evac-lang-change so components can re-render', () => {
    const handler = vi.fn();
    window.addEventListener('evac-lang-change', handler);
    setLang('en');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('evac-lang-change', handler);
  });

  it('falls back current-lang → Thai → explicit fallback → key', () => {
    setLang('en');
    expect(t('missing.key', 'fallback!')).toBe('fallback!');
    expect(t('missing.key')).toBe('missing.key');
  });
});
