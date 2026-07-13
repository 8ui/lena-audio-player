import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { ControlTabs } from './ControlTabs';
import css from './styles.css?raw';

// Extracts the body of a single top-level CSS rule, e.g. cssBlock('.chips')
// for `.chips { ... }`. Anchored so it does NOT match compound selectors like
// `.chips button` — those have a non-`{` character between the class name
// and the brace.
function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.]/g, '\\.');
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`styles.css has no ${selector} rule`);
  return m[1];
}

function cssProp(block: string, prop: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim();
}

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

  // The test above sets all three fields at once, and pitch/markerCount even
  // share the value 2 — so a cross-wired chip (e.g. the pitch chip reading
  // markers.length, or the loop chip reading marker count) would still pass
  // it. These vary exactly one field at a time and pin that the other two
  // chips stay in their off state.
  it('varying only pitch leaves the loop and markers chips off', () => {
    usePlayerStore.setState({ pitch: 3, loopStart: null, loopEnd: null, markers: [] });
    render(<ControlTabs />);
    expect(screen.getByRole('tab', { name: /тон \+3/i })).toBeInTheDocument();

    const loopTab = screen.getByRole('tab', { name: /A–B/i });
    expect(loopTab).not.toHaveTextContent('✓');
    expect(loopTab).not.toHaveClass('on');

    const markersTab = screen.getByRole('tab', { name: /маркер/i });
    expect(markersTab).toHaveAccessibleName(/⚑ 0/);
    expect(markersTab).not.toHaveClass('on');
  });

  it('varying only the loop leaves the pitch and markers chips off', () => {
    usePlayerStore.setState({ pitch: 0, loopStart: 2, loopEnd: 7, markers: [] });
    render(<ControlTabs />);
    const loopTab = screen.getByRole('tab', { name: /A–B ✓/i });
    expect(loopTab).toHaveClass('on');

    const pitchTab = screen.getByRole('tab', { name: /тон/i });
    expect(pitchTab).not.toHaveTextContent('+');
    expect(pitchTab).not.toHaveClass('on');

    const markersTab = screen.getByRole('tab', { name: /маркер/i });
    expect(markersTab).toHaveAccessibleName(/⚑ 0/);
    expect(markersTab).not.toHaveClass('on');
  });

  it('varying only markers leaves the pitch and loop chips off', () => {
    usePlayerStore.setState({
      pitch: 0,
      loopStart: null,
      loopEnd: null,
      markers: [
        { id: 'a', time: 1, label: '1' },
        { id: 'b', time: 2, label: '2' },
        { id: 'c', time: 3, label: '3' },
      ],
    });
    render(<ControlTabs />);
    const markersTab = screen.getByRole('tab', { name: /маркер/i });
    expect(markersTab).toHaveAccessibleName(/⚑ 3/);
    expect(markersTab).toHaveClass('on');

    const pitchTab = screen.getByRole('tab', { name: /тон/i });
    expect(pitchTab).not.toHaveTextContent('+');
    expect(pitchTab).not.toHaveClass('on');

    const loopTab = screen.getByRole('tab', { name: /A–B/i });
    expect(loopTab).not.toHaveTextContent('✓');
    expect(loopTab).not.toHaveClass('on');
  });

  it('closes the open panel on a backdrop click', () => {
    render(<ControlTabs />);
    fireEvent.click(screen.getByRole('tab', { name: /тон/i }));
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();

    const backdrop = document.querySelector('.backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  // Real browser stacking bug, invisible to RTL (fireEvent dispatches straight
  // at the node, bypassing hit-testing): .backdrop is `position: fixed;
  // z-index: 10` and .popover is `position: absolute; z-index: 20`, both
  // painting above any non-positioned in-flow sibling in the same stacking
  // context. If .chips were left as a plain static element, the full-viewport
  // backdrop would paint over the chip row while a panel is open, and a tap
  // meant to switch tabs would instead just close the panel.
  it('keeps .chips positioned above the .backdrop so chips stay tappable while a panel is open', () => {
    const chips = cssBlock('.chips');
    const backdrop = cssBlock('.backdrop');

    const chipsPosition = cssProp(chips, 'position');
    expect(chipsPosition, '.chips must be positioned for z-index to have any effect').toBeTruthy();
    expect(chipsPosition).not.toBe('static');

    const chipsZ = Number(cssProp(chips, 'z-index'));
    const backdropZ = Number(cssProp(backdrop, 'z-index'));
    expect(Number.isNaN(chipsZ), '.chips must declare a z-index').toBe(false);
    expect(chipsZ).toBeGreaterThan(backdropZ);
  });
});
