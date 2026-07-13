import { describe, it, expect, afterEach } from 'vitest';
import { uuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  const realRandomUUID = globalThis.crypto.randomUUID;

  afterEach(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: realRandomUUID,
      configurable: true,
      writable: true,
    });
  });

  it('returns a v4 uuid', () => {
    expect(uuid()).toMatch(V4);
  });

  it('returns unique values', () => {
    const seen = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(seen.size).toBe(100);
  });

  it('still works when crypto.randomUUID is unavailable (non-secure origin)', () => {
    // crypto.randomUUID is exposed ONLY in secure contexts. Opening the dev
    // server on a phone over a plain-HTTP LAN origin (http://192.168.x.x) is
    // NOT a secure context, so the method is simply absent — this is the exact
    // "crypto.randomUUID is not a function" crash seen on device.
    // getRandomValues is not gated, so uuid() must fall back to it.
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const out = uuid();
    expect(out).toMatch(V4);
    expect(uuid()).not.toBe(out); // still unique on the fallback path
  });
});
