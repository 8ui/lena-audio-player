import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { fmtTime } from './time';

export function LoopPanel() {
  // zustand v5: selecting a freshly-built object every render (without
  // useShallow) causes an infinite re-render loop ("getSnapshot should be
  // cached"). useShallow memoizes by shallow-equality of the returned fields.
  const { loopStart, loopEnd, setLoopA, setLoopB, clearLoop } = usePlayerStore(
    useShallow((s) => ({
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
      setLoopA: s.setLoopA,
      setLoopB: s.setLoopB,
      clearLoop: s.clearLoop,
    }))
  );
  const active = loopStart !== null && loopEnd !== null;
  return (
    <>
      <button onClick={setLoopA}>{loopStart !== null ? `A ${fmtTime(loopStart)}` : 'A'}</button>
      <button onClick={setLoopB}>{loopEnd !== null ? `B ${fmtTime(loopEnd)}` : 'B'}</button>
      <button onClick={clearLoop} disabled={!active}>
        Сброс
      </button>
    </>
  );
}
