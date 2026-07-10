export interface AudioEngine {
  load(buffer: AudioBuffer): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setTempo(rate: number): void;
  setPitchSemitones(n: number): void;
  setLoop(start: number | null, end: number | null): void;
  getCurrentTime(): number;
  getDuration(): number;
  readonly playing: boolean;
  onTimeUpdate?: (t: number) => void;
  onEnded?: () => void;
  dispose(): void;
}
