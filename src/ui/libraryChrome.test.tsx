import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryHeader } from './LibraryHeader';
import { EmptyLibrary } from './EmptyLibrary';

describe('LibraryHeader', () => {
  afterEach(cleanup);

  it('names the app and offers the theme toggle', () => {
    render(<LibraryHeader />);
    expect(screen.getByRole('heading', { name: 'Разбор' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /тема/i })).toBeInTheDocument();
  });
});

describe('EmptyLibrary', () => {
  afterEach(cleanup);

  // The MVP empty screen was a grey paragraph with no way out of it: the only
  // import control was a small button in the header.
  it('offers a call to action, not just a sentence', () => {
    render(<EmptyLibrary onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /выбрать аудио/i })).toBeInTheDocument();
  });

  it('hands the picked file straight to onPick', () => {
    const onPick = vi.fn();
    const { container } = render(<EmptyLibrary onPick={onPick} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new ArrayBuffer(8)], 'a.mp3');

    fireEvent.change(input, { target: { files: [file] } });

    expect(onPick).toHaveBeenCalledWith(file);
  });
});
