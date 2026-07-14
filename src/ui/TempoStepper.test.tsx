import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { TempoStepper } from './TempoStepper';

describe('TempoStepper', () => {
  beforeEach(() => {
    usePlayerStore.setState({ tempo: 1, currentTrackId: 't' });
  });
  afterEach(cleanup);

  it('shows the current tempo', () => {
    usePlayerStore.setState({ tempo: 0.75 });
    render(<TempoStepper />);
    expect(screen.getByText('0.75×')).toBeInTheDocument();
  });

  it('steps down by 0.1', () => {
    render(<TempoStepper />);
    fireEvent.click(screen.getByLabelText('медленнее'));
    expect(usePlayerStore.getState().tempo).toBe(0.9);
  });

  it('steps up by 0.1', () => {
    usePlayerStore.setState({ tempo: 0.9 });
    render(<TempoStepper />);
    fireEvent.click(screen.getByLabelText('быстрее'));
    expect(usePlayerStore.getState().tempo).toBe(1);
  });

  it('resets to 1 on a tap on the value', () => {
    usePlayerStore.setState({ tempo: 0.5 });
    render(<TempoStepper />);
    fireEvent.click(screen.getByLabelText('сбросить темп'));
    expect(usePlayerStore.getState().tempo).toBe(1);
  });
});
