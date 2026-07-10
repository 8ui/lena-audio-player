import { useEffect } from 'react';
import { usePlayerStore } from './store/usePlayerStore';
import { Library } from './screens/Library';
import { Player } from './screens/Player';
import { requestWakeLock, releaseWakeLock } from './pwa/wakeLock';
import './ui/styles.css';

export default function App() {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const init = usePlayerStore((s) => s.init);
  const playing = usePlayerStore((s) => s.playing);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    if (playing) void requestWakeLock();
    else releaseWakeLock();
  }, [playing]);
  return currentTrackId ? <Player /> : <Library />;
}
