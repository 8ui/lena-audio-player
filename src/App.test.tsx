import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from './App';
import { usePlayerStore, __setEngineFactory } from './store/usePlayerStore';
import type { AudioEngine } from './engine/AudioEngine';

function fakeEngine(): AudioEngine {
  let playing = false;
  return {
    load: async () => {},
    play: () => { playing = true; },
    pause: () => { playing = false; },
    seek: () => {},
    setTempo: () => {},
    setPitchSemitones: () => {},
    setLoop: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 100,
    get playing() { return playing; },
    dispose: () => {},
  };
}

describe('App error banner', () => {
  beforeEach(() => {
    __setEngineFactory(fakeEngine);
    usePlayerStore.setState({ currentTrackId: null, error: null });
  });
  afterEach(cleanup);

  it('shows the store error and dismisses it on click', async () => {
    render(<App />);

    act(() => usePlayerStore.setState({ error: 'Не удалось открыть файл' }));
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Не удалось открыть файл');

    fireEvent.click(banner);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(usePlayerStore.getState().error).toBeNull();
  });

  it('renders no banner when there is no error', () => {
    render(<App />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
