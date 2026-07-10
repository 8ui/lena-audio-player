import { useEffect } from 'react';
import { usePlayerStore } from './store/usePlayerStore';
import { Library } from './screens/Library';
import { Player } from './screens/Player';
import './ui/styles.css';

export default function App() {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const init = usePlayerStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  return currentTrackId ? <Player /> : <Library />;
}
