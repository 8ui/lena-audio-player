// PlayerHeader's "назад" button calls closeTrack, which flushes a persist to
// IndexedDB (see App.test.tsx / usePlayerStore.test.ts for the same need).
// Without a fake DB that write throws (indexedDB is not defined in jsdom),
// which vitest reports as an unhandled rejection and exits non-zero even
// though every assertion above it passed.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { TransportBar } from './TransportBar';
import { TimeBadge } from './TimeBadge';
import { PlayerHeader } from './PlayerHeader';
import { PlayerDock } from './PlayerDock';

describe('TransportBar', () => {
  beforeEach(() => {
    usePlayerStore.setState({ currentTrackId: 't', playing: false, position: 0, duration: 100 });
  });
  afterEach(cleanup);

  // Also guards the zustand v5 gotcha: an object selector without useShallow
  // trips "getSnapshot should be cached" and the component never mounts.
  it('mounts with only a play button — no ±5s, no time', () => {
    render(<TransportBar />);
    expect(screen.getByLabelText('играть')).toBeInTheDocument();
    expect(screen.queryByText('−5')).toBeNull();
    expect(screen.queryByText('+5')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('TimeBadge', () => {
  afterEach(cleanup);

  it('shows position and duration', () => {
    usePlayerStore.setState({ currentTrackId: 't', position: 84, duration: 238 });
    render(<TimeBadge />);
    expect(screen.getByText(/1:24/)).toBeInTheDocument();
    expect(screen.getByText(/3:58/)).toBeInTheDocument();
  });
});

describe('PlayerHeader', () => {
  afterEach(cleanup);

  it('shows the current track name and closes the track', () => {
    // TrackRecord (src/types.ts) needs blob + peaks — the header only reads
    // `name`, but the type is the type.
    usePlayerStore.setState({
      currentTrackId: 't1',
      library: [
        {
          id: 't1',
          name: 'song.mp3',
          blob: new Blob(),
          peaks: new Float32Array(0),
          duration: 100,
          createdAt: 0,
        },
      ],
    });
    render(<PlayerHeader />);
    expect(screen.getByText('song.mp3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('назад'));
    expect(usePlayerStore.getState().currentTrackId).toBeNull();
  });
});

describe('PlayerDock', () => {
  afterEach(cleanup);

  it('stacks tempo, transport and the chips', () => {
    usePlayerStore.setState({
      currentTrackId: 't',
      tempo: 1,
      pitch: 0,
      playing: false,
      loopStart: null,
      loopEnd: null,
      markers: [],
      position: 0,
      duration: 100,
    });
    render(<PlayerDock />);
    expect(screen.getByLabelText('сбросить темп')).toBeInTheDocument();
    expect(screen.getByLabelText('играть')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});
