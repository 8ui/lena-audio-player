import { usePlayerStore } from '../store/usePlayerStore';
import { stepTempo, TEMPO_DEFAULT } from '../engine/params';

export function TempoStepper() {
  const tempo = usePlayerStore((s) => s.tempo);
  const setTempo = usePlayerStore((s) => s.setTempo);
  return (
    <div className="tempo">
      <button aria-label="медленнее" onClick={() => setTempo(stepTempo(tempo, -1))}>
        −
      </button>
      <button className="value" aria-label="сбросить темп" onClick={() => setTempo(TEMPO_DEFAULT)}>
        <b>{tempo.toFixed(2)}×</b>
        <small>Темп</small>
      </button>
      <button aria-label="быстрее" onClick={() => setTempo(stepTempo(tempo, 1))}>
        ＋
      </button>
    </div>
  );
}
