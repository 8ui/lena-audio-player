import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

export function LoopControls() {
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
    <div className="control loop">
      <button onClick={setLoopA}>A{loopStart !== null ? ` ${loopStart.toFixed(1)}` : ''}</button>
      <button onClick={setLoopB}>B{loopEnd !== null ? ` ${loopEnd.toFixed(1)}` : ''}</button>
      <button onClick={clearLoop} disabled={!active}>сброс</button>
    </div>
  );
}
