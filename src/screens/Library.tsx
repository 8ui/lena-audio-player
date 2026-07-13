import { useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { fmtTime } from '../ui/time';

// iOS turns `accept` into a UTI filter and greys out anything that does not
// match. The bare `audio/*` wildcard does NOT resolve to the mp3 UTI there, so
// real .mp3 files were untappable and import was impossible on iPhone (hit on a
// real device). Explicit extensions and concrete MIME types map to UTIs far more
// reliably. The list only ever widens what the picker offers, and an undecodable
// pick is already handled — the store catches the decodeAudioData rejection and
// shows an error banner.
export const AUDIO_ACCEPT = [
  'audio/*',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.aiff',
  '.aif',
  '.caf',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
].join(',');

export function Library() {
  const library = usePlayerStore((s) => s.library);
  const importFile = usePlayerStore((s) => s.importFile);
  const openTrack = usePlayerStore((s) => s.openTrack);
  const removeTrack = usePlayerStore((s) => s.removeTrack);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="library">
      <header className="control-row screen-header">
        <h1 style={{ fontSize: 20, margin: 0 }}>Разбор</h1>
        <button style={{ marginLeft: 'auto' }} onClick={() => fileRef.current?.click()}>
          ＋ Импорт
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={AUDIO_ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
      </header>
      {library.length === 0 && (
        <p style={{ padding: 16, opacity: 0.6 }}>Нет треков. Импортируй аудио с телефона.</p>
      )}
      {library.map((t) => (
        <div key={t.id} className="library-item">
          <span onClick={() => openTrack(t.id)} style={{ flex: 1 }}>{t.name}</span>
          <span style={{ opacity: 0.6, marginRight: 12 }}>{fmtTime(t.duration)}</span>
          <button
            aria-label="удалить"
            onClick={() => {
              if (confirm(`Удалить «${t.name}»?`)) void removeTrack(t.id);
            }}
          >
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}
