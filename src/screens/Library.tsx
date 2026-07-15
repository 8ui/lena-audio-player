import { useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { fmtTime } from '../ui/time';
import { AUDIO_ACCEPT } from '../ui/importAccept';

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
