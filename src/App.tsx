import { useEffect, useRef, useState } from 'react';
import { SoundTouchEngine } from './engine/SoundTouchEngine';

// Throwaway dev harness for manually exercising SoundTouchEngine in a
// browser (Task 7, Step 5). Task 12 replaces this with the real UI.
export default function App() {
  const engineRef = useRef<SoundTouchEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState('no file loaded');

  useEffect(() => {
    const engine = new SoundTouchEngine();
    engineRef.current = engine;
    engine.onEnded = () => setPlaying(false);

    let raf = 0;
    const tick = () => {
      setTime(engine.getCurrentTime());
      setPlaying(engine.playing);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      engine.dispose();
    };
  }, []);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const engine = engineRef.current;
    if (!file || !engine) return;
    setStatus('decoding…');
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();
    await engine.load(audioBuffer);
    setDuration(engine.getDuration());
    setReady(true);
    setStatus(`loaded: ${file.name}`);
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>Разбор — плеер (dev harness)</h1>
      <input type="file" accept="audio/*" onChange={onFileChange} />
      <p>{status}</p>
      <p>
        time: {time.toFixed(2)} / {duration.toFixed(2)} — {playing ? 'playing' : 'paused'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button disabled={!ready} onClick={() => engineRef.current?.play()}>
          Play
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.pause()}>
          Pause
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.setTempo(0.5)}>
          Tempo 0.5
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.setTempo(1)}>
          Tempo 1
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.setPitchSemitones(-3)}>
          Pitch -3
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.setPitchSemitones(0)}>
          Pitch 0
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.setLoop(5, 8)}>
          Loop [5,8]
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.setLoop(null, null)}>
          Loop off
        </button>
        <button disabled={!ready} onClick={() => engineRef.current?.seek(0)}>
          Seek 0
        </button>
      </div>
    </div>
  );
}
