import { WaveformCanvas } from '../waveform/WaveformCanvas';
import { MiniMap } from '../waveform/MiniMap';
import { PlayerHeader } from '../ui/PlayerHeader';
import { TimeBadge } from '../ui/TimeBadge';
import { PlayerDock } from '../ui/PlayerDock';

export function Player() {
  return (
    <div className="player">
      <PlayerHeader />
      {/* The badge is positioned against this wrapper, not the canvas: a canvas
          cannot have children. */}
      <div className="wave-wrap">
        <WaveformCanvas />
        <TimeBadge />
      </div>
      <MiniMap />
      <PlayerDock />
    </div>
  );
}
