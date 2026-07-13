// crypto.randomUUID() is exposed ONLY in secure contexts (HTTPS, or localhost).
// The app is opened on a phone against the LAN dev server (http://192.168.x.x),
// which is NOT a secure context — there the method is simply absent, and calling
// it throws "crypto.randomUUID is not a function" (it crashed importFile and
// addMarker on the first real device test).
//
// crypto.getRandomValues() is NOT secure-context gated, so derive the v4 UUID
// from it on the fallback path: same entropy source, works on every origin.
export function uuid(): string {
  // `crypto` itself (and getRandomValues) is present on every browser origin,
  // secure or not — it is only `randomUUID` that is gated. So dereference `c`
  // unconditionally and probe just the method.
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();

  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx

  let s = '';
  for (let i = 0; i < 16; i++) s += b[i].toString(16).padStart(2, '0');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
