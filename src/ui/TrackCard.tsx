import type { TrackRecord, TrackStateRecord } from '../types';
import { TrackWave } from './TrackWave';
import { fmtTime } from './time';
import { progressRatio, tempoBadge, pitchBadge, loopBadge } from './libraryModel';

interface Props {
  track: TrackRecord;
  /** undefined = the track was never opened. */
  state?: TrackStateRecord;
  onOpen(id: string): void;
  onMenu(id: string): void;
}

export function TrackCard({ track, state, onOpen, onMenu }: Props) {
  const lastPosition = state?.lastPosition ?? 0;
  const badges = [
    tempoBadge(state?.tempo ?? 1),
    pitchBadge(state?.pitch ?? 0),
    loopBadge(state?.loopStart ?? null, state?.loopEnd ?? null),
  ].filter((b): b is string => b !== null);

  return (
    <div className="track-card">
      {/* Stretched hit area covering the whole card. The MVP screen hung the
          handler on the name's <span>, so a tap on the duration or on the
          padding silently did nothing. Empty on purpose: the visible content
          is .body, which paints above it and takes no pointer events. */}
      <button className="open" aria-label={track.name} onClick={() => onOpen(track.id)} />

      <div className="body">
        <div className="row">
          <span className="name">{track.name}</span>
          <span className="dur">{fmtTime(track.duration)}</span>
        </div>

        <TrackWave peaks={track.peaks} progress={progressRatio(lastPosition, track.duration)} />

        <div className="row meta">
          {lastPosition > 0 && <span className="resume">{fmtTime(lastPosition)}</span>}
          {badges.map((b) => (
            <span key={b} className="badge">{b}</span>
          ))}
        </div>
      </div>

      <button
        className="menu"
        aria-label={`действия: ${track.name}`}
        onClick={() => onMenu(track.id)}
      >
        ⋯
      </button>
    </div>
  );
}
