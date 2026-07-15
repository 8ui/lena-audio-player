import { describe, it, expect } from 'vitest';
import { AUDIO_ACCEPT } from './importAccept';

describe('AUDIO_ACCEPT', () => {
  // iOS maps the `accept` attribute onto UTIs to decide which files the picker
  // lets you tap. The bare `audio/*` wildcard does NOT resolve to the mp3 UTI
  // there, so real .mp3 files render greyed out and import is impossible — hit
  // on a real iPhone. The explicit extensions must stay.
  it('lists explicit audio extensions, not just the audio/* wildcard', () => {
    for (const ext of ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg']) {
      expect(AUDIO_ACCEPT).toContain(ext);
    }
  });
});
