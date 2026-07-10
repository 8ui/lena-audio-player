import { usePlayerStore } from '../store/usePlayerStore';
import { TEMPO_MIN, TEMPO_MAX } from '../engine/params';

export function TempoControl() {
  const tempo = usePlayerStore((s) => s.tempo);
  const setTempo = usePlayerStore((s) => s.setTempo);
  return (
    <div className="control">
      <div className="control-row">
        <span>Темп</span>
        <span>{tempo.toFixed(2)}×</span>
        <button className="reset" onClick={() => setTempo(1)}>сброс</button>
      </div>
      <input
        aria-label="темп"
        type="range"
        min={TEMPO_MIN}
        max={TEMPO_MAX}
        step={0.05}
        value={tempo}
        onChange={(e) => setTempo(parseFloat(e.target.value))}
      />
    </div>
  );
}
