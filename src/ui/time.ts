// One implementation: TimeBadge and Library both show m:ss.
export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// m:ss.d — for the A-B loop readout only. `fmtTime` rounds to the whole
// second, which for a tight riff loop makes a 0.5s loop and a 0.9s loop both
// read "0:42": indistinguishable, and this app loops bars of music. Round to
// the nearest tenth FIRST (not `Math.floor((t - whole) * 10)`), because
// float noise on `t - Math.floor(t)` (e.g. 42.3 - 42 = 0.29999999999999996)
// would floor a genuine .3 down to .2.
export function fmtTimeTenths(t: number): string {
  const tenths = Math.round(t * 10);
  const wholeSeconds = Math.floor(tenths / 10);
  const d = tenths % 10;
  const m = Math.floor(wholeSeconds / 60);
  const s = wholeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}.${d}`;
}
