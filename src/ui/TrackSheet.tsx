import type { TrackRecord } from '../types';

interface Props {
  track: TrackRecord;
  onDelete(id: string): void;
  onClose(): void;
}

// Replaces the native confirm(): in an installed PWA a system dialog reads as
// something that escaped from another app. The sheet IS the confirmation —
// there is no second "are you sure".
export function TrackSheet({ track, onDelete, onClose }: Props) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={track.name}>
        <div className="sheet-title">{track.name}</div>
        <button className="danger" onClick={() => onDelete(track.id)}>
          Удалить
        </button>
        <button onClick={onClose}>Отмена</button>
      </div>
    </>
  );
}
