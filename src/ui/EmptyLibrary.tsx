import { ImportButton } from './ImportButton';

interface Props {
  onPick(file: File): void;
}

// The FAB is on screen here too, but an empty screen needs a target you cannot
// miss — the MVP version was a grey paragraph and a small button in the corner.
export function EmptyLibrary({ onPick }: Props) {
  return (
    <div className="empty">
      <p>
        Пока пусто.
        <br />
        Импортируй аудио с телефона.
      </p>
      <ImportButton className="import-cta" label="выбрать аудио" onPick={onPick}>
        ＋ Выбрать аудио
      </ImportButton>
    </div>
  );
}
