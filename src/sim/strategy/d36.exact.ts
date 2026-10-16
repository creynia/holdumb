// D36: exact EV of "check to the river, bet 1x only with a hidden pair", computed with the app's
// own evaluator over all 2,598,960 boards (suit-isomorphic boards grouped) x 1,081 player hands
// x 990 dealer hands. Used by d36.slow.test.ts (SLOW=1), never at runtime.
import { evalMasks } from '../engine/evaluator';
import { blindHalf } from './river';

/** Returns [numerator over denominator] of the EV in antes per hand (Ante+Blind+Play). */
export type RiverRule = 'hidden' | 'always' | 'optimal';
export function checkToRiverHiddenOnly(rule: RiverRule = 'hidden'): { num: bigint; den: bigint } {
  // Group boards by suit isomorphism.
  const perms: number[][] = [];
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++)
        for (let d = 0; d < 4; d++) if (new Set([a, b, c, d]).size === 4) perms.push([a, b, c, d]);
  const groups = new Map<number, { cards: number[]; w: number }>();
  const x = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++)
        for (let d = c + 1; d < 52; d++)
          for (let e = d + 1; e < 52; e++) {
            const cs = [a, b, c, d, e];
            let best = Infinity;
            for (const p of perms) {
              for (let i = 0; i < 5; i++) x[i] = (cs[i]! & ~3) | p[cs[i]! & 3]!;
              x.sort((u, v) => u - v);
              const key = (((x[0]! * 52 + x[1]!) * 52 + x[2]!) * 52 + x[3]!) * 52 + x[4]!;
              if (key < best) best = key;
            }
            const g = groups.get(best);
            if (g) g.w++;
            else groups.set(best, { cards: cs, w: 1 });
          }

  let total = 0n; // half-antes
  const pa: number[] = [];
  const pb: number[] = [];
  for (const { cards: board, w } of groups.values()) {
    const bm = [0, 0, 0, 0];
    for (const c of board) bm[c & 3]! |= 1 << (c >> 2);
    const boardCat = evalMasks(bm[0]!, bm[1]!, bm[2]!, bm[3]!) >>> 20;
    const rem: number[] = [];
    for (let c = 0; c < 52; c++) if (!board.includes(c)) rem.push(c);
    pa.length = 0;
    pb.length = 0;
    const vals: number[] = [];
    for (let i = 0; i < 47; i++)
      for (let j = i + 1; j < 47; j++) {
        const a = rem[i]!;
        const b = rem[j]!;
        const m = [bm[0]!, bm[1]!, bm[2]!, bm[3]!];
        m[a & 3]! |= 1 << (a >> 2);
        m[b & 3]! |= 1 << (b >> 2);
        pa.push(i);
        pb.push(j);
        vals.push(evalMasks(m[0]!, m[1]!, m[2]!, m[3]!));
      }
    const n = vals.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((u, v) => vals[u]! - vals[v]!);
    const less = new Int32Array(n);
    const lessA = new Int32Array(n);
    const lessB = new Int32Array(n);
    const leAll = new Int32Array(n);
    const leA = new Int32Array(n);
    const leB = new Int32Array(n);
    const cnt = new Int32Array(47);
    let nqAll = 0;
    const nq = new Int32Array(47);
    for (let i = 0; i < n; i++)
      if (vals[i]! < 1 << 20) {
        nqAll++;
        nq[pa[i]!]!++;
        nq[pb[i]!]!++;
      }
    for (let g = 0; g < n;) {
      let e = g;
      while (e < n && vals[order[e]!] === vals[order[g]!]) e++;
      for (let k = g; k < e; k++) {
        const id = order[k]!;
        less[id] = g;
        lessA[id] = cnt[pa[id]!]!;
        lessB[id] = cnt[pb[id]!]!;
      }
      for (let k = g; k < e; k++) {
        const id = order[k]!;
        cnt[pa[id]!]!++;
        cnt[pb[id]!]!++;
      }
      for (let k = g; k < e; k++) {
        const id = order[k]!;
        leAll[id] = e;
        leA[id] = cnt[pa[id]!]!;
        leB[id] = cnt[pb[id]!]!;
      }
      g = e;
    }
    let sum = 0;
    for (let id = 0; id < n; id++) {
      const v = vals[id]!;
      const cat = v >>> 20;
      const hidden = cat >= 1 && cat > boardCat;
      if (rule === 'hidden' && !hidden) {
        sum += -3960;
        continue;
      }
      const W = less[id]! - lessA[id]! - lessB[id]!;
      const LE = leAll[id]! - leA[id]! - leB[id]! + 1;
      const NQ = nqAll - nq[pa[id]!]! - nq[pb[id]!]! + (v < 1 << 20 ? 1 : 0);
      const T = LE - W;
      const Ls = 990 - LE;
      let Wq: number, Wn: number, Lq: number, Ln: number;
      if (v >= 1 << 20) {
        Wn = NQ;
        Wq = W - NQ;
        Lq = Ls;
        Ln = 0;
      } else {
        Wn = W;
        Wq = 0;
        Ln = NQ - W - T;
        Lq = Ls - Ln;
      }
      if (Wq < 0 || Wn < 0 || Lq < 0 || Ln < 0 || T < 0) throw new Error('negative count');
      const bl = blindHalf(cat);
      const ev1 = Wq * (4 + bl) + Wn * (2 + bl) - 6 * Lq - 4 * Ln;
      sum += rule === 'optimal' && ev1 <= -3960 ? -3960 : ev1;
    }
    total += BigInt(sum) * BigInt(w);
  }
  // EV = total / (2 * 990 * 2,598,960 * 1081) antes
  return { num: total, den: 1980n * 2598960n * 1081n };
}
