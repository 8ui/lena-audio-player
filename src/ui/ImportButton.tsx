import { useRef, type ReactNode } from 'react';
import { AUDIO_ACCEPT } from './importAccept';

interface Props {
  onPick(file: File): void;
  className: string;
  label: string;
  children: ReactNode;
}

// Both entry points into import — the FAB and the empty-state CTA — need a file
// input. One component, used twice: AUDIO_ACCEPT is not a constant you want two
// copies of.
export function ImportButton({ onPick, className, label, children }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} aria-label={label} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={AUDIO_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          // Reset, or picking the SAME file twice fires no change event at all.
          e.target.value = '';
        }}
      />
    </>
  );
}
