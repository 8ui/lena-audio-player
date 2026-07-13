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

  it('the file input accepts explicit audio extensions, not just the audio/* wildcard', () => {
    // iOS maps the `accept` attribute onto UTIs to decide which files the picker
    // lets you tap. The bare `audio/*` wildcard does not resolve to the mp3 UTI
    // there, so real .mp3 files render greyed out and import is impossible —
    // hit on a real iPhone. Explicit extensions map to UTIs far more reliably,
    // so they must stay in the attribute.
    const { container } = render(<Library />);
    const input = container.querySelector('input[type="file"]')!;
    const accept = input.getAttribute('accept') ?? '';
    for (const ext of ['.mp3', '.m4a', '.wav']) {
      expect(accept).toContain(ext);
    }
  });
});
