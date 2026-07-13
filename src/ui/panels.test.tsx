import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { PitchPanel } from './PitchPanel';
import { LoopPanel } from './LoopPanel';
import { MarkersPanel } from './MarkersPanel';

describe('PitchPanel', () => {
  beforeEach(() => {
    usePlayerStore.setState({ pitch: 0, currentTrackId: 't' });
  });
  afterEach(cleanup);

  it('raises a semitone', () => {
    render(<PitchPanel />);
    fireEvent.click(screen.getByLabelText('выше'));
    expect(usePlayerStore.getState().pitch).toBe(1);
  });

  it('lowers a semitone', () => {
    render(<PitchPanel />);
    fireEvent.click(screen.getByLabelText('ниже'));
    expect(usePlayerStore.getState().pitch).toBe(-1);
  });

  it('resets to 0 on a tap on the value', () => {
    usePlayerStore.setState({ pitch: 3 });
    render(<PitchPanel />);
    expect(screen.getByText('+3')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('сбросить тон'));
    expect(usePlayerStore.getState().pitch).toBe(0);
  });
});

describe('LoopPanel', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTrackId: 't',
      loopStart: null,
      loopEnd: null,
      position: 42,
      duration: 100,
    });
  });
  afterEach(cleanup);

  // Also guards the zustand v5 gotcha: this component selects an object from
  // the store, so without useShallow React trips "getSnapshot should be cached"
  // and the component never mounts.
  it('shows A/B times once set and disables reset until both exist', () => {
    render(<LoopPanel />);
    expect(screen.getByText('Сброс')).toBeDisabled();

    fireEvent.click(screen.getByText('A'));
    expect(usePlayerStore.getState().loopStart).toBe(42);
    expect(screen.getByText('A 0:42')).toBeInTheDocument();
    // Only A is set so far — reset must still be disabled (guards `&&` vs `||`).
    expect(screen.getByText('Сброс')).toBeDisabled();

    fireEvent.click(screen.getByText('B'));
    expect(usePlayerStore.getState().loopEnd).toBe(42);
    expect(screen.getByText('B 0:42')).toBeInTheDocument();
  });

  it('clears the loop', () => {
    usePlayerStore.setState({ loopStart: 10, loopEnd: 20 });
    render(<LoopPanel />);
    fireEvent.click(screen.getByText('Сброс'));
    expect(usePlayerStore.getState().loopStart).toBeNull();
    expect(usePlayerStore.getState().loopEnd).toBeNull();
  });
});

describe('MarkersPanel', () => {
  beforeEach(() => {
    usePlayerStore.setState({ markers: [], position: 7, currentTrackId: 't' });
  });
  afterEach(cleanup);

  it('adds a marker at the current position', () => {
    render(<MarkersPanel />);
    fireEvent.click(screen.getByText('＋ маркер'));
    expect(usePlayerStore.getState().markers).toHaveLength(1);
    expect(usePlayerStore.getState().markers[0].time).toBe(7);
  });

  it('disables nav/delete when there are no markers', () => {
    render(<MarkersPanel />);
    expect(screen.getByLabelText('следующий маркер')).toBeDisabled();
    expect(screen.getByLabelText('предыдущий маркер')).toBeDisabled();
    expect(screen.getByLabelText('удалить маркер')).toBeDisabled();
  });

  it('enables nav/delete once a marker exists', () => {
    render(<MarkersPanel />);
    fireEvent.click(screen.getByText('＋ маркер'));
    expect(screen.getByLabelText('следующий маркер')).not.toBeDisabled();
    expect(screen.getByLabelText('предыдущий маркер')).not.toBeDisabled();
    expect(screen.getByLabelText('удалить маркер')).not.toBeDisabled();
  });
});
