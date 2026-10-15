// Hot-path showdown counting for the EV enumerations (simulator.md §2.3).
//
// A showdown is (player 7 cards) vs (dealer 2 cards + the same 5-card board). For one final board
// we count how many of the C(45,2) = 990 dealer hands the player beats / loses to / ties, and
// whether the dealer qualifies (pair or better). That is exactly what the spec's 990-hand loop
// produces; the speed comes from grouping the dealer hands:
//   - without a flush, a 7-card value depends only on the RANKS, so the 990 hands collapse to at
//     most 91 rank pairs, each with a known multiplicity (cards left of rank a × cards left of
//     rank b);
//   - a flush needs 3+ board cards of one suit (at most one suit can have that), and then only
//     the dealer hands holding enough cards of that suit differ; those are re-evaluated one by one
//     with the full evaluator and swapped in for their rank-pair result.
// Values use the engine's packing: category << 20 | k1 << 16 | … | k5 (larger wins). The tests
// compare this module with the engine evaluator and a naive 990-hand loop.

const PAIR = 1 << 20; // value of the weakest pair: the dealer qualifies at or above this

const hibit = (m: number): number => 31 - Math.clz32(m);

function straightTop(m: number): number {
  const m2 = (m << 1) | ((m >> 12) & 1); // bit 0 = ace low
  const s = m2 & (m2 << 1) & (m2 << 2) & (m2 << 3) & (m2 << 4);
  return s === 0 ? -1 : hibit(s) - 1;
}
function topN(m: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const b = hibit(m);
    v = (v << 4) | b;
    m &= ~(1 << b);
  }
  return v;
}
function popcount(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return Math.imul((x + (x >> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Value of a hand ignoring flushes (given as rank counts). */
function valueNoFlush(cnt: ArrayLike<number>): number {
  let all = 0;
  let quad = -1;
  let t1 = -1;
  let t2 = -1;
  let p1 = -1;
  let p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = cnt[r] as number;
    if (c === 0) continue;
    all |= 1 << r;
    if (c === 4) quad = r;
    else if (c === 3) {
      if (t1 < 0) t1 = r;
      else if (t2 < 0) t2 = r;
    } else if (c === 2) {
      if (p1 < 0) p1 = r;
      else if (p2 < 0) p2 = r;
    }
  }
  if (quad >= 0) return (7 << 20) | (quad << 16) | (hibit(all & ~(1 << quad)) << 12);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) {
    return (6 << 20) | (t1 << 16) | ((t2 > p1 ? t2 : p1) << 12);
  }
  const st = straightTop(all);
  if (st >= 0) return (4 << 20) | (st << 16);
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | (topN(all & ~(1 << t1), 2) << 8);
  if (p2 >= 0) {
    return (2 << 20) | (p1 << 16) | (p2 << 12) | (hibit(all & ~(1 << p1) & ~(1 << p2)) << 8);
  }
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (topN(all & ~(1 << p1), 3) << 4);
  return topN(all, 5);
}

/** Full value: suit masks decide flushes, rank counts decide everything else. */
function valueFull(sm: ArrayLike<number>, cnt: ArrayLike<number>): number {
  for (let s = 0; s < 4; s++) {
    const m = sm[s] as number;
    if (popcount(m) >= 5) {
      const st = straightTop(m);
      if (st >= 0) return ((st === 12 ? 9 : 8) << 20) | (st << 16);
      return (5 << 20) | topN(m, 5);
    }
  }
  return valueNoFlush(cnt);
}

/** Counts of dealer hands relative to the player's value on one final board. */
export interface RiverCounts {
  /** Player wins, dealer qualifies / does not. */
  wq: number;
  wnq: number;
  /** Player loses, dealer qualifies / does not. */
  lq: number;
  lnq: number;
  /** Exact ties (the dealer's best five equals the player's). */
  tie: number;
  /** The player's category, 0 (high card) … 9 (royal flush). */
  category: number;
}

/** Reusable buffers. Allocate one per job so interleaved jobs never share state. */
export interface ShowdownScratch {
  sm: Int32Array;
  cnt: Uint8Array;
  left: Uint8Array;
  pairValue: Int32Array;
  dsm: Int32Array;
  dcnt: Uint8Array;
  pool: Int32Array;
}
export function makeScratch(): ShowdownScratch {
  return {
    sm: new Int32Array(4),
    cnt: new Uint8Array(13),
    left: new Uint8Array(13),
    pairValue: new Int32Array(169),
    dsm: new Int32Array(4),
    dcnt: new Uint8Array(13),
    pool: new Int32Array(52),
  };
}

/** Best-of-7 value of two hole cards on a board of 5 (the engine's packing). */
export function valueOfSeven(hole0: number, hole1: number, board: ArrayLike<number>): number {
  const sm = new Int32Array(4);
  const cnt = new Uint8Array(13);
  const add = (c: number): void => {
    sm[c & 3] = (sm[c & 3] as number) | (1 << (c >> 2));
    cnt[c >> 2] = (cnt[c >> 2] as number) + 1;
  };
  add(hole0);
  add(hole1);
  for (let i = 0; i < 5; i++) add(board[i] as number);
  return valueFull(sm, cnt);
}

/**
 * Showdown counts for one final board of 5 cards. `dead[c]` is 1 for every card the dealer
 * cannot hold (the player's hole cards and the board).
 */
export function riverCounts(
  s: ShowdownScratch,
  hole0: number,
  hole1: number,
  board: ArrayLike<number>,
  dead: ArrayLike<number>,
): RiverCounts {
  const { sm, cnt, left, pairValue, dsm, dcnt, pool } = s;
  sm.fill(0);
  cnt.fill(0);
  for (let i = 0; i < 5; i++) {
    const c = board[i] as number;
    sm[c & 3] = (sm[c & 3] as number) | (1 << (c >> 2));
    cnt[c >> 2] = (cnt[c >> 2] as number) + 1;
  }
  dsm.set(sm);
  dcnt.set(cnt);
  for (const c of [hole0, hole1]) {
    dsm[c & 3] = (dsm[c & 3] as number) | (1 << (c >> 2));
    dcnt[c >> 2] = (dcnt[c >> 2] as number) + 1;
  }
  const P = valueFull(dsm, dcnt);

  left.fill(0);
  let n = 0;
  for (let c = 0; c < 52; c++) {
    if (dead[c]) continue;
    pool[n++] = c;
    left[c >> 2] = (left[c >> 2] as number) + 1;
  }

  let wq = 0;
  let wnq = 0;
  let lq = 0;
  let lnq = 0;
  let tie = 0;
  // Non-flush pass over rank pairs.
  for (let ra = 0; ra < 13; ra++) {
    const la = left[ra] as number;
    if (la === 0) continue;
    cnt[ra] = (cnt[ra] as number) + 1;
    for (let rb = ra; rb < 13; rb++) {
      const w = ra === rb ? (la * (la - 1)) >> 1 : la * (left[rb] as number);
      if (w === 0) continue;
      cnt[rb] = (cnt[rb] as number) + 1;
      const v = valueNoFlush(cnt);
      cnt[rb] = (cnt[rb] as number) - 1;
      pairValue[ra * 13 + rb] = v;
      if (v < P) {
        if (v >= PAIR) wq += w;
        else wnq += w;
      } else if (v > P) {
        if (v >= PAIR) lq += w;
        else lnq += w;
      } else tie += w;
    }
    cnt[ra] = (cnt[ra] as number) - 1;
  }

  // Flush correction: only a suit with 3+ board cards can give the dealer a flush.
  let fs = -1;
  let fcount = 0;
  for (let su = 0; su < 4; su++) {
    const k = popcount(sm[su] as number);
    if (k >= 3) {
      fs = su;
      fcount = k;
    }
  }
  if (fs >= 0) {
    for (let i = 0; i < n; i++) {
      const x = pool[i] as number;
      const xs = (x & 3) === fs;
      for (let j = i + 1; j < n; j++) {
        const y = pool[j] as number;
        const ys = (y & 3) === fs;
        if (!(fcount === 5 || (fcount === 4 ? xs || ys : xs && ys))) continue;
        const rx = x >> 2;
        const ry = y >> 2;
        const v0 = pairValue[(rx < ry ? rx : ry) * 13 + (rx < ry ? ry : rx)] as number;
        dsm.set(sm);
        dcnt.set(cnt);
        dsm[x & 3] = (dsm[x & 3] as number) | (1 << rx);
        dsm[y & 3] = (dsm[y & 3] as number) | (1 << ry);
        dcnt[rx] = (dcnt[rx] as number) + 1;
        dcnt[ry] = (dcnt[ry] as number) + 1;
        const v1 = valueFull(dsm, dcnt);
        if (v1 === v0) continue;
        // Remove the rank-pair outcome, add the true one.
        if (v0 < P) {
          if (v0 >= PAIR) wq--;
          else wnq--;
        } else if (v0 > P) {
          if (v0 >= PAIR) lq--;
          else lnq--;
        } else tie--;
        if (v1 < P) {
          if (v1 >= PAIR) wq++;
          else wnq++;
        } else if (v1 > P) {
          if (v1 >= PAIR) lq++;
          else lnq++;
        } else tie++;
      }
    }
  }
  return { wq, wnq, lq, lnq, tie, category: P >>> 20 };
}

/** Exposed for the evaluator cross-check tests. */
export const _internal = { valueFull, valueNoFlush };
