import { usePlayerStore } from '../store/usePlayerStore';
import { WaveformCanvas } from '../waveform/WaveformCanvas';
import { MiniMap } from '../waveform/MiniMap';
import { TransportBar } from '../ui/TransportBar';
import { TempoControl } from '../ui/TempoControl';
import { PitchControl } from '../ui/PitchControl';
import { LoopControls } from '../ui/LoopControls';
import { MarkersControl } from '../ui/MarkersControl';

export function Player() {
  const closeTrack = usePlayerStore((s) => s.closeTrack);
  return (
    <div className="player">
      <header className="control-row" style={{ padding: 12 }}>
        <button aria-label="назад" onClick={closeTrack}>‹ Библиотека</button>
      </header>
      <WaveformCanvas />
      <MiniMap />
      <TempoControl />
      <PitchControl />
      <LoopControls />
      <MarkersControl />
      <TransportBar />
    </div>
  );
}
