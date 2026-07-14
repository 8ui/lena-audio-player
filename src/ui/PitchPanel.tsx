import { usePlayerStore } from '../store/usePlayerStore';

// A fragment, not a wrapper: ControlTabs supplies div.popover, which is what
// keeps all three panels exactly one row tall.
export function PitchPanel() {
  const pitch = usePlayerStore((s) => s.pitch);
  const setPitch = usePlayerStore((s) => s.setPitch);
  return (
    <>
      <button aria-label="ниже" onClick={() => setPitch(pitch - 1)}>
        −
      </button>
      <button className="val" aria-label="сбросить тон" onClick={() => setPitch(0)}>
        {pitch > 0 ? `+${pitch}` : pitch}
      </button>
      <button aria-label="выше" onClick={() => setPitch(pitch + 1)}>
        ＋
      </button>
    </>
  );
}
