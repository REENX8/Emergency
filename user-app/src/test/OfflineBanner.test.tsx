import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';

import OfflineBanner from '../components/OfflineBanner';
import { setLang } from '../i18n';

describe('OfflineBanner', () => {
  it('is hidden while online and appears on the offline event', () => {
    setLang('en');
    render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      fireEvent(window, new Event('offline'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');

    act(() => {
      fireEvent(window, new Event('online'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
