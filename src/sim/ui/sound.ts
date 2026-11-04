// Table sounds (I027): short WebAudio blips, no audio files. Loaded on demand (the table imports
// this module dynamically only when Sounds is on), so it adds nothing to first paint.
//
// Rules: nothing plays before a user gesture (the context is created inside one), every sound is
// <= 300 ms and peaks at -14 dBFS (gain 0.2 < -12 dBFS), and callers gate on the Sounds setting,
// instant speed and auto-play.

export type SoundName = 'deal' | 'chip' | 'win' | 'lose' | 'push';

interface Note {
  /** Hz */
  freq: number;
  /** seconds from the start of the sound */
  at: number;
  /** seconds */
  len: number;
  type: 'sine' | 'triangle' | 'square';
}

/** Peak gain of every note: 0.2 = -14 dBFS (the budget is -12). */
export const PEAK_GAIN = 0.2;
/** No sound may last longer than this many seconds. */
export const MAX_SOUND_S = 0.3;

export const SOUNDS: Readonly<Record<SoundName, readonly Note[]>> = {
  deal: [
    { freq: 260, at: 0, len: 0.05, type: 'triangle' },
    { freq: 220, at: 0.09, len: 0.06, type: 'triangle' },
  ],
  chip: [{ freq: 1250, at: 0, len: 0.05, type: 'triangle' }],
  win: [
    { freq: 523, at: 0, len: 0.08, type: 'sine' },
    { freq: 659, at: 0.09, len: 0.08, type: 'sine' },
    { freq: 784, at: 0.18, len: 0.1, type: 'sine' },
  ],
  lose: [
    { freq: 220, at: 0, len: 0.12, type: 'sine' },
    { freq: 165, at: 0.13, len: 0.15, type: 'sine' },
  ],
  push: [{ freq: 440, at: 0, len: 0.1, type: 'sine' }],
};

/** The slice of the WebAudio API this file uses (a fake implements it in tests). */
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly state?: string;
  readonly destination: unknown;
  resume?: () => Promise<void> | void;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(n: unknown): unknown;
    start(t: number): void;
    stop(t: number): void;
  };
  createGain(): {
    gain: {
      value: number;
      setValueAtTime(v: number, t: number): unknown;
      linearRampToValueAtTime(v: number, t: number): unknown;
      exponentialRampToValueAtTime(v: number, t: number): unknown;
    };
    connect(n: unknown): unknown;
  };
}

let factory: () => AudioCtxLike | null = () => {
  const C =
    typeof window === 'undefined'
      ? undefined
      : ((window as unknown as { AudioContext?: new () => AudioCtxLike }).AudioContext ??
        (window as unknown as { webkitAudioContext?: new () => AudioCtxLike }).webkitAudioContext);
  return C ? new C() : null;
};
let ctx: AudioCtxLike | null = null;
let wanted = false;
let armed = false;

/** Tests inject a fake context factory and reset the module state. */
export function __setAudioContextFactory(f: () => AudioCtxLike | null): void {
  factory = f;
  ctx = null;
  wanted = false;
  armed = false;
}

/** Create (or resume) the context. Only call this from inside a user gesture. */
function ensureContext(): AudioCtxLike | null {
  try {
    ctx ??= factory();
    if (ctx && ctx.state === 'suspended') void ctx.resume?.();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Whether the table wants sound right now (the Sounds setting). */
export function setSoundsWanted(on: boolean): void {
  wanted = on;
}

/**
 * Create the audio context on the first user gesture (autoplay policy). Until then `playSound`
 * does nothing. Safe to call repeatedly.
 */
export function armSoundUnlock(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const unlock = () => {
    if (wanted) ensureContext();
    for (const ev of ['pointerdown', 'keydown', 'touchend'])
      window.removeEventListener(ev, unlock, true);
    armed = false;
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend'])
    window.addEventListener(ev, unlock, true);
}

/** Play one sound if the context exists (a gesture has happened) and sounds are wanted. */
export function playSound(name: SoundName): void {
  if (!wanted || !ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume?.();
    const t0 = ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      const start = t0 + n.at;
      const end = start + n.len;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    /* audio must never break the table */
  }
}

/** The one blip when Sounds is switched on. Call it from the click handler (a gesture). */
export function previewSound(): void {
  wanted = true;
  if (ensureContext()) playSound('chip');
}
