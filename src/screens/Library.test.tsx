import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePlayerStore } from '../store/usePlayerStore';
import { Library } from './Library';
import type { TrackRecord } from '../types';

function track(id: string, name: string, createdAt: number): TrackRecord {
  return {
    id,
    name,
    blob: new Blob(),
    peaks: new Float32Array(400).fill(0.5),
    duration: 61,
    createdAt,
  };
}

describe('Library', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      library: [track('a', 'Соната', 1)],
      trackStates: {},
    });
  });
  afterEach(cleanup);

  it('renders track names', () => {
    render(<Library />);
    expect(screen.getByText('Соната')).toBeInTheDocument();
  });

  // db.listTracks() is a bare getAll(): without an explicit sort the list came
  // out in object-store key order, i.e. arbitrary.
  //
  // Read the names out of the DOM, NOT via getAllByRole(name: /…/): the ⋯ button
  // of each card is called "действия: Старая", so a name regex would match two
  // buttons per card and the resulting order would be meaningless.
  it('puts the newest track first', () => {
    usePlayerStore.setState({
      library: [track('a', 'Старая', 1), track('b', 'Новая', 5), track('c', 'Средняя', 3)],
    });
    const { container } = render(<Library />);
    const names = [...container.querySelectorAll('.track-card .name')].map((n) => n.textContent);
    expect(names).toEqual(['Новая', 'Средняя', 'Старая']);
  });

  // The MVP row hung the handler on the name's <span>: a tap on the duration or
  // on the padding did nothing. The whole card is the target now.
  it('opens the track from anywhere on the card', () => {
    const openTrack = vi.fn();
    usePlayerStore.setState({ openTrack });
    render(<Library />);
    fireEvent.click(screen.getByRole('button', { name: 'Соната' }));
    expect(openTrack).toHaveBeenCalledWith('a');
  });

  // Deviation from the brief's verbatim test file (see task-12-report.md,
  // self-review item 3): TrackCard.test.tsx already pins "⋯ never opens the
  // track" at the component level with independent mocks, but nothing pinned
  // it at the Library level, where onOpen/onMenu are wired to real store
  // actions. A wiring bug in Library.tsx itself (e.g. onMenu accidentally
  // also calling openTrack) would have shipped silently.
  it('opening the sheet never opens the track', () => {
    const openTrack = vi.fn();
    usePlayerStore.setState({ openTrack });
    render(<Library />);
    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(openTrack).not.toHaveBeenCalled();
  });

  it('deletes through the sheet, not through a native confirm()', () => {
    const removeTrack = vi.fn();
    usePlayerStore.setState({ removeTrack });
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(removeTrack).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelling the sheet deletes nothing', () => {
    const removeTrack = vi.fn();
    usePlayerStore.setState({ removeTrack });
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /действия/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(removeTrack).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the empty state with a call to action when there are no tracks', () => {
    usePlayerStore.setState({ library: [] });
    render(<Library />);
    expect(screen.getByRole('button', { name: /выбрать аудио/i })).toBeInTheDocument();
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
