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
  const error = usePlayerStore((s) => s.error);
  const clearError = usePlayerStore((s) => s.clearError);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    if (playing) void requestWakeLock();
    else releaseWakeLock();
  }, [playing]);
  return (
    <>
      {error && (
        <div
          role="alert"
          onClick={clearError}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#c0392b',
            color: '#fff',
            // Standalone on iOS is full-bleed: without the inset this fixed
            // banner would sit under the status bar. env() is 0 elsewhere.
            padding: 'calc(12px + env(safe-area-inset-top)) 16px 12px',
            fontSize: 14,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          ⚠ {error} <span style={{ opacity: 0.7 }}>(нажми, чтобы скрыть)</span>
        </div>
      )}
      {currentTrackId ? <Player /> : <Library />}
    </>
  );
}
