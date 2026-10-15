import type { RngState } from './types';

/** One step of splitmix32; returns [output, nextCounter]. */
function splitmix32(a: number): [number, number] {
  const next = (a + 0x9e3779b9) | 0;
  let t = next ^ (next >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  t = t ^ (t >>> 15);
  return [t >>> 0, next];
}

/** splitmix32 -> 4 words; all-zero state impossible. (crappy's pattern.) */
export function seedRng(seed: number): RngState {
  const [o0, c0] = splitmix32(Math.trunc(seed) | 0);
  const [o1, c1] = splitmix32(c0);
  const [o2, c2] = splitmix32(c1);
  const [o3] = splitmix32(c2);
  return { s: [(o0 | o1 | o2 | o3) === 0 ? 1 : o0, o1, o2, o3] };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** xoshiro128** */
export function nextU32(r: RngState): [number, RngState] {
  const [s0, s1, s2, s3] = r.s;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  let n2 = (s2 ^ s0) >>> 0;
  let n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  n2 = (n2 ^ t) >>> 0;
  n3 = rotl(n3, 11);
  return [result, { s: [n0, n1, n2, n3] }];
}

/** Uniform integer in [0, n) by rejection: draw u < 2^32 - (2^32 % n), return u % n. */
export function randBelow(r: RngState, n: number): [number, RngState] {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new Error(`randBelow: bad n ${n}`);
  const limit = 0x100000000 - (0x100000000 % n);
  let state = r;
  for (;;) {
    const [u, next] = nextU32(state);
    state = next;
    if (u < limit) return [u % n, state];
  }
}

/** Fisher-Yates from the end: exactly `xs.length - 1` randBelow calls. Does not mutate `xs`. */
export function shuffle<T>(r: RngState, xs: readonly T[]): [T[], RngState] {
  const out = [...xs];
  let state = r;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = randBelow(state, i + 1);
    state = next;
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return [out, state];
}
