import { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { sortTracks } from '../ui/libraryModel';
import { LibraryHeader } from '../ui/LibraryHeader';
import { EmptyLibrary } from '../ui/EmptyLibrary';
import { ImportButton } from '../ui/ImportButton';
import { TrackCard } from '../ui/TrackCard';
import { TrackSheet } from '../ui/TrackSheet';
import { InstallBanner } from '../ui/InstallBanner';

export function Library() {
  // Single-field selectors on purpose: a selector returning a fresh object every
  // call needs useShallow, or zustand v5 throws "getSnapshot should be cached".
  const library = usePlayerStore((s) => s.library);
  const trackStates = usePlayerStore((s) => s.trackStates);
  const importFile = usePlayerStore((s) => s.importFile);
  const openTrack = usePlayerStore((s) => s.openTrack);
  const removeTrack = usePlayerStore((s) => s.removeTrack);

  // Which track's sheet is open is local React state, never the store — the same
  // rule ControlTabs follows for its open tab.
  const [sheetId, setSheetId] = useState<string | null>(null);

  const tracks = sortTracks(library);
  const sheetTrack = tracks.find((t) => t.id === sheetId) ?? null;

  return (
    <div className="library">
      <LibraryHeader />

      {tracks.length === 0 ? (
        <EmptyLibrary onPick={(f) => void importFile(f)} />
      ) : (
        <div className="track-list">
          {tracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              state={trackStates[t.id]}
              onOpen={(id) => void openTrack(id)}
              onMenu={setSheetId}
            />
          ))}
        </div>
      )}

      <ImportButton className="import-fab" label="импорт" onPick={(f) => void importFile(f)}>
        ＋
      </ImportButton>

      {sheetTrack && (
        <TrackSheet
          track={sheetTrack}
          onDelete={(id) => {
            void removeTrack(id);
            setSheetId(null);
          }}
          onClose={() => setSheetId(null)}
        />
      )}

      <InstallBanner />
    </div>
  );
}
