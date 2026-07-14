import { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { PitchPanel } from './PitchPanel';
import { LoopPanel } from './LoopPanel';
import { MarkersPanel } from './MarkersPanel';

type Tab = 'pitch' | 'loop' | 'markers';

export function ControlTabs() {
  // Which panel is open is UI state, not track state: it never goes into the
  // store and must never reach IndexedDB.
  const [open, setOpen] = useState<Tab | null>(null);

  // zustand v5: a fresh-object selector needs useShallow (see LoopPanel).
  const { pitch, loopSet, markerCount } = usePlayerStore(
    useShallow((s) => ({
      pitch: s.pitch,
      loopSet: s.loopStart !== null && s.loopEnd !== null,
      markerCount: s.markers.length,
    }))
  );

  const toggle = (t: Tab) => setOpen((cur) => (cur === t ? null : t));

  // Stable ids for the tab/tabpanel ARIA relationship — one tab id per Tab
  // value, and a single panel id since only one panel is ever mounted at a
  // time (the popover swaps its contents rather than rendering three).
  const tabId = (t: Tab) => `control-tab-${t}`;
  const panelId = 'control-tabpanel';

  return (
    <>
      {open !== null && (
        <>
          {/* Covers the canvases on purpose: with a panel open, a tap outside
              should close it rather than scrub the waveform. */}
          <div className="backdrop" onClick={() => setOpen(null)} />
          {/* An overlay anchored to the dock, NOT a row in it — opening a panel
              must not resize the waveform. */}
          <div className="popover" role="tabpanel" id={panelId} aria-labelledby={tabId(open)}>
            {open === 'pitch' && <PitchPanel />}
            {open === 'loop' && <LoopPanel />}
            {open === 'markers' && <MarkersPanel />}
          </div>
        </>
      )}
      <div className="chips" role="tablist">
        <button
          id={tabId('pitch')}
          role="tab"
          aria-selected={open === 'pitch'}
          aria-controls={panelId}
          className={pitch !== 0 ? 'on' : undefined}
          onClick={() => toggle('pitch')}
        >
          ♪ Тон {pitch > 0 ? `+${pitch}` : pitch}
        </button>
        <button
          id={tabId('loop')}
          role="tab"
          aria-selected={open === 'loop'}
          aria-controls={panelId}
          className={loopSet ? 'on' : undefined}
          onClick={() => toggle('loop')}
        >
          A–B {loopSet ? '✓' : ''}
        </button>
        <button
          id={tabId('markers')}
          role="tab"
          aria-selected={open === 'markers'}
          aria-controls={panelId}
          aria-label={`Маркеры ⚑ ${markerCount}`}
          className={markerCount > 0 ? 'on' : undefined}
          onClick={() => toggle('markers')}
        >
          ⚑ {markerCount}
        </button>
      </div>
    </>
  );
}
