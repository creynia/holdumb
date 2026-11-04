// A fake AudioContext for the sound tests: records what gets scheduled on it.
import type { AudioCtxLike } from './sound';

/** A fake AudioContext that records everything scheduled on it. */
export function fakeAudio() {
  const log = {
    created: 0,
    oscs: [] as Array<{ freq: number; start: number; stop: number }>,
    peaks: [] as number[],
  };
  const mk = (): AudioCtxLike => {
    log.created++;
    return {
      currentTime: 10,
      state: 'running',
      destination: {},
      createOscillator() {
        const o = {
          type: '',
          frequency: { value: 0 },
          connect: () => undefined,
          start(t: number) {
            rec.start = t;
          },
          stop(t: number) {
            rec.stop = t;
            log.oscs.push({ freq: o.frequency.value, start: rec.start, stop: rec.stop });
          },
        };
        const rec = { start: 0, stop: 0 };
        return o;
      },
      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: (v: number) => void log.peaks.push(v),
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: () => undefined,
        };
      },
    };
  };
  return { log, mk };
}
