import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImportButton } from './ImportButton';

describe('ImportButton', () => {
  afterEach(cleanup);

  it('offers the audio extensions iOS needs on its file input', () => {
    const { container } = render(
      <ImportButton className="import-fab" label="импорт" onPick={vi.fn()}>＋</ImportButton>,
    );
    const accept = container.querySelector('input[type="file"]')!.getAttribute('accept') ?? '';
    for (const ext of ['.mp3', '.m4a', '.wav']) {
      expect(accept).toContain(ext);
    }
  });

  it('hands the picked file to onPick', () => {
    const onPick = vi.fn();
    const { container } = render(
      <ImportButton className="import-fab" label="импорт" onPick={onPick}>＋</ImportButton>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new ArrayBuffer(8)], 'a.mp3', { type: 'audio/mpeg' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onPick).toHaveBeenCalledWith(file);
  });

  // Picking the SAME file twice fires no change event unless the value is
  // cleared — the second import would silently do nothing.
  it('clears the input so the same file can be picked again', () => {
    const { container } = render(
      <ImportButton className="import-fab" label="импорт" onPick={vi.fn()}>＋</ImportButton>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new ArrayBuffer(8)], 'a.mp3')] },
    });
    expect(input.value).toBe('');
  });

  it('is labelled for screen readers', () => {
    render(<ImportButton className="import-fab" label="импорт" onPick={vi.fn()}>＋</ImportButton>);
    expect(screen.getByRole('button', { name: 'импорт' })).toBeInTheDocument();
  });
});
