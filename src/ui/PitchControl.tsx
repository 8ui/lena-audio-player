import { usePlayerStore } from '../store/usePlayerStore';

export function PitchControl() {
  const pitch = usePlayerStore((s) => s.pitch);
  const setPitch = usePlayerStore((s) => s.setPitch);
  return (
    <div className="control">
      <div className="control-row">
        <span>Тон</span>
        <span>{pitch > 0 ? `+${pitch}` : pitch}</span>
        <button className="reset" onClick={() => setPitch(0)}>сброс</button>
      </div>
      <div className="stepper">
        <button aria-label="ниже" onClick={() => setPitch(pitch - 1)}>−</button>
        <button aria-label="выше" onClick={() => setPitch(pitch + 1)}>＋</button>
      </div>
    </div>
  );
}
