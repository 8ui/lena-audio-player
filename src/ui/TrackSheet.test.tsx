import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackSheet } from './TrackSheet';
import type { TrackRecord } from '../types';

const track: TrackRecord = {
  id: 'a', name: 'Соната', blob: new Blob(), peaks: new Float32Array(),
  duration: 60, createdAt: 1,
};

describe('TrackSheet', () => {
  afterEach(cleanup);

  it('names the track it is about', () => {
    render(<TrackSheet track={track} onDelete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Соната' })).toBeInTheDocument();
  });

  // The confirmation IS the sheet — there is no second dialog, and confirm()
  // is gone (in an installed PWA it looks like an alien system prompt).
  it('deletes on the destructive button', () => {
    const onDelete = vi.fn();
    render(<TrackSheet track={track} onDelete={onDelete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('cancels without deleting', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(<TrackSheet track={track} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes on a tap outside, without deleting', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <TrackSheet track={track} onDelete={onDelete} onClose={onClose} />,
    );
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
