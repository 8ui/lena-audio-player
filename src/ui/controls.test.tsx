import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { TempoControl } from './TempoControl';
import { PitchControl } from './PitchControl';
import { LoopControls } from './LoopControls';
import { TransportBar } from './TransportBar';

describe('controls', () => {
  beforeEach(() => {
    usePlayerStore.setState({ tempo: 1, pitch: 0, currentTrackId: 't' });
  });

  it('tempo slider updates store', () => {
    render(<TempoControl />);
    const slider = screen.getByLabelText(/темп/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(usePlayerStore.getState().tempo).toBe(0.5);
  });

  it('pitch + button raises semitone', () => {
    render(<PitchControl />);
    fireEvent.click(screen.getByLabelText(/выше/i));
    expect(usePlayerStore.getState().pitch).toBe(1);
  });

  // Guards against a zustand v5 regression: LoopControls/TransportBar select
  // an object from the store. Without useShallow, a fresh object identity on
  // every render trips React's "getSnapshot should be cached" loop and the
  // components fail to mount. This proves useShallow is in place.
  it('LoopControls and TransportBar mount without an infinite-render loop', () => {
    usePlayerStore.setState({
      currentTrackId: 't',
      loopStart: null,
      loopEnd: null,
      position: 0,
      duration: 100,
      playing: false,
    });
    render(
      <>
        <LoopControls />
        <TransportBar />
      </>
    );
    expect(screen.getByLabelText(/играть/i)).toBeInTheDocument();
    expect(screen.getByText(/^A$/)).toBeInTheDocument();
  });
});
