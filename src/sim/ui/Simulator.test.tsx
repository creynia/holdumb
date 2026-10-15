import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createEvClient } from '../worker/client';
import { Simulator } from './Simulator';
import { DEFAULT_SIM_SETTINGS } from './types';

describe('Simulator placeholder', () => {
  it('renders a heading', () => {
    const evClient = createEvClient({ mode: 'inthread' });
    render(<Simulator settings={DEFAULT_SIM_SETTINGS} evClient={evClient} />);
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    evClient.dispose();
  });
});
