import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackCard } from './TrackCard';
import type { TrackRecord, TrackStateRecord } from '../types';

const track: TrackRecord = {
  id: 'a',
  name: 'Соната',
  blob: new Blob(),
  peaks: new Float32Array(400).fill(0.5),
  duration: 125,
  createdAt: 1,
};

const state: TrackStateRecord = {
  trackId: 'a',
  tempo: 0.9,
  pitch: -2,
  loopStart: 10,
  loopEnd: 20,
  pxPerSec: 100,
  markers: [],
  lastPosition: 62.5,
};

describe('TrackCard', () => {
  afterEach(cleanup);

  it('shows the name and the duration', () => {
    render(<TrackCard track={track} onOpen={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.getByText('Соната')).toBeInTheDocument();
    expect(screen.getByText('2:05')).toBeInTheDocument();
  });

  // The MVP screen put the open handler on the <span> with the name: a tap on
  // the duration, on a badge, or on the card's padding did nothing at all. The
  // whole card is one button now, and this pins it.
  it('the whole card is one open target, not just the name', () => {
    const onOpen = vi.fn();
    render(<TrackCard track={track} onOpen={onOpen} onMenu={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Соната' }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('opens the action menu without opening the track', () => {
    const onOpen = vi.fn();
    const onMenu = vi.fn();
    render(<TrackCard track={track} onOpen={onOpen} onMenu={onMenu} />);
    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    expect(onMenu).toHaveBeenCalledWith('a');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows where the user stopped, and the non-default settings', () => {
    render(<TrackCard track={track} state={state} onOpen={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.getByText('1:02')).toBeInTheDocument(); // lastPosition
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
    expect(screen.getByText('A–B')).toBeInTheDocument();
  });

  // A track that was never opened must look untouched: no resume time, no
  // badges, and a wave with nothing filled in.
  it('shows no resume time and no badges for a fresh track', () => {
    const { container } = render(<TrackCard track={track} onOpen={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.queryByText('90%')).toBeNull();
    expect(container.querySelectorAll('rect.played')).toHaveLength(0);
    expect(container.querySelector('.resume')).toBeNull();
  });

  // Defaults must not produce badges either — an opened-but-unchanged track is
  // as clean as a fresh one.
  it('shows no badges when every setting is at its default', () => {
    const fresh: TrackStateRecord = {
      trackId: 'a', tempo: 1, pitch: 0, loopStart: null, loopEnd: null,
      pxPerSec: 100, markers: [], lastPosition: 30,
    };
    const { container } = render(
      <TrackCard track={track} state={fresh} onOpen={vi.fn()} onMenu={vi.fn()} />,
    );
    expect(container.querySelectorAll('.badge')).toHaveLength(0);
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });
});
