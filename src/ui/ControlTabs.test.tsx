import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { ControlTabs } from './ControlTabs';

describe('ControlTabs', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTrackId: 't',
      pitch: 0,
      loopStart: null,
      loopEnd: null,
      markers: [],
      position: 0,
      duration: 100,
    });
  });
  afterEach(cleanup);

  it('shows no panel until a chip is tapped', () => {
    render(<ControlTabs />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('opens the panel of the tapped chip', () => {
    render(<ControlTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /тон/i }));
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    expect(screen.getByLabelText('выше')).toBeInTheDocument();
  });

  // The whole point of tabs over popovers: with a panel open, the chips stay
  // tappable and switch what the panel shows.
  it('switches between tabs while the panel is open', () => {
    render(<ControlTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /тон/i }));
    fireEvent.click(screen.getByRole('tab', { name: /маркер/i }));
    expect(screen.getByText('＋ маркер')).toBeInTheDocument();
    expect(screen.queryByLabelText('выше')).toBeNull();
    expect(screen.getByRole('tab', { name: /маркер/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /тон/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('closes the panel on a tap on the active chip', () => {
    render(<ControlTabs />);
    const chip = screen.getByRole('tab', { name: /тон/i });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('chips show state without opening a panel', () => {
    usePlayerStore.setState({
      pitch: 2,
      loopStart: 1,
      loopEnd: 5,
      markers: [
        { id: 'a', time: 1, label: '1' },
        { id: 'b', time: 2, label: '2' },
      ],
    });
    render(<ControlTabs />);
    expect(screen.getByRole('tab', { name: /тон \+2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /A–B ✓/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /⚑ 2/ })).toBeInTheDocument();
  });
});
