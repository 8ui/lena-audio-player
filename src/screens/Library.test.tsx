import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { Library } from './Library';
import type { TrackRecord } from '../types';

const t: TrackRecord = {
  id: 'a', name: 'Соната', blob: new Blob(), peaks: new Float32Array(),
  duration: 61, createdAt: 1,
};

describe('Library', () => {
  beforeEach(() => {
    usePlayerStore.setState({ library: [t] });
  });

  it('renders track names', () => {
    render(<Library />);
    expect(screen.getByText('Соната')).toBeInTheDocument();
  });

  it('opens track on click', () => {
    const openTrack = vi.fn();
    usePlayerStore.setState({ openTrack });
    render(<Library />);
    screen.getByText('Соната').click();
    expect(openTrack).toHaveBeenCalledWith('a');
  });
});
