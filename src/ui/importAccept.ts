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
