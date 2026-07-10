import '@testing-library/jest-dom/vitest';

// jsdom has no Web Audio API. `@soundtouchjs/audio-worklet`'s SoundTouchNode
// class declaration does `class SoundTouchNode extends AudioWorkletNode`,
// which is evaluated at module-import time — so merely importing
// SoundTouchEngine.ts (transitively, e.g. via usePlayerStore.ts) throws
// `ReferenceError: AudioWorkletNode is not defined` in jsdom, even in tests
// that never construct a real engine (fake engine injected instead). Stub
// the global so the import succeeds; no test constructs a real
// AudioWorkletNode.
if (typeof (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode === 'undefined') {
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class AudioWorkletNode {};
}
