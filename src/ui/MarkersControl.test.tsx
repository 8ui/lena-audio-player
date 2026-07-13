import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { MarkersControl } from './MarkersControl';

describe('MarkersControl', () => {
  beforeEach(() => {
    usePlayerStore.setState({ markers: [], position: 0, currentTrackId: 't' });
  });

  it('adds a marker at the current position on tap', () => {
    usePlayerStore.setState({ position: 7 });
    render(<MarkersControl />);
    fireEvent.click(screen.getByText('＋ маркер'));
    expect(usePlayerStore.getState().markers).toHaveLength(1);
    expect(usePlayerStore.getState().markers[0].time).toBe(7);
  });

  it('disables nav/delete when there are no markers', () => {
    render(<MarkersControl />);
    expect(screen.getByLabelText('следующий маркер')).toBeDisabled();
    expect(screen.getByLabelText('удалить маркер')).toBeDisabled();
  });
});
