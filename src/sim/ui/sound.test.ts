import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SOUND_S,
  PEAK_GAIN,
  SOUNDS,
  __setAudioContextFactory,
  armSoundUnlock,
  playSound,
  previewSound,
  setSoundsWanted,
  type SoundName,
} from './sound';
import { fakeAudio } from './fakeAudio';

beforeEach(() => document.body.replaceChildren());
afterEach(() => __setAudioContextFactory(() => null));

describe('table sounds (I027)', () => {
  it('plays nothing before a user gesture: no context exists until one happens', () => {
    const { log, mk } = fakeAudio();
    __setAudioContextFactory(mk);
    setSoundsWanted(true);
    armSoundUnlock();
    playSound('deal');
    expect(log.created).toBe(0);
    expect(log.oscs).toHaveLength(0);
    window.dispatchEvent(new Event('pointerdown'));
    expect(log.created).toBe(1);
    playSound('deal');
    expect(log.oscs.length).toBe(SOUNDS.deal.length);
  });

  it('is silent when Sounds is off, even after a gesture', () => {
    const { log, mk } = fakeAudio();
    __setAudioContextFactory(mk);
    armSoundUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    expect(log.created).toBe(0); // not wanted: no context at all
    setSoundsWanted(false);
    playSound('win');
    expect(log.oscs).toHaveLength(0);
  });

  it('every sound is at most 300 ms and peaks at or below -12 dBFS', () => {
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      const { log, mk } = fakeAudio();
      __setAudioContextFactory(mk);
      setSoundsWanted(true);
      previewSound(); // creates the context inside a "gesture"
      log.oscs.length = 0;
      log.peaks.length = 0;
      playSound(name);
      expect(log.oscs.length, name).toBe(SOUNDS[name].length);
      const first = Math.min(...log.oscs.map((o) => o.start));
      const last = Math.max(...log.oscs.map((o) => o.stop));
      expect(last - first, name).toBeLessThanOrEqual(MAX_SOUND_S + 0.02); // +20 ms stop tail
      for (const n of SOUNDS[name]) expect(n.at + n.len, name).toBeLessThanOrEqual(MAX_SOUND_S);
      for (const p of log.peaks) expect(20 * Math.log10(p), name).toBeLessThanOrEqual(-12);
    }
    expect(20 * Math.log10(PEAK_GAIN)).toBeLessThanOrEqual(-12);
  });

  it('turning Sounds on plays exactly one preview blip', () => {
    const { log, mk } = fakeAudio();
    __setAudioContextFactory(mk);
    previewSound();
    expect(log.oscs).toHaveLength(SOUNDS.chip.length);
    expect(SOUNDS.chip).toHaveLength(1);
  });

  it('a missing AudioContext never throws', () => {
    __setAudioContextFactory(() => null);
    setSoundsWanted(true);
    expect(() => {
      previewSound();
      playSound('win');
    }).not.toThrow();
  });
});
