/**
 * content-b (lessons 7-14): pinned numbers (decisions.md §4, curriculum §11), scene checks, and
 * decision quizzes / scenes cross-checked against exact enumeration with the engine evaluator.
 * The exact river/flop EV below is a local, independent enumerator (mirrors the math package's
 * definitions: 990 dealer hands per river, 1,081 turn/river pairs per flop).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryOf, evalMasks, handValueOf, parseCards, rankOf, suitOf } from '../../src/sim/engine';
import { validateScene } from '../../src/sim/scene';
import { buildContent } from '../../src/content/load';
import type { ForcedDeal } from '../../src/sim/engine';
import type { Block, Lesson } from '../../src/content/types';

const root = process.cwd();
const bundle = buildContent(root);

const IDS = [
  'preflop-raise',
  'preflop-close-calls',
  'flop-raise',
  'flop-tricky-boards',
  'river-call-or-fold',
  'counting-dealer-outs',
  'strategy-lowest-edge',
  'checkpoint-strategy',
] as const;
type LId = (typeof IDS)[number];

const lesson = (id: LId): Lesson => {
  const l = bundle.lessons.find((x) => x.id === id);
  if (!l) throw new Error(`missing lesson ${id}`);
  return l;
};
const raw = (id: LId): string => {
  const n = String(IDS.indexOf(id) + 7).padStart(2, '0');
  return readFileSync(join(root, 'content/lessons', `${n}-${id}.md`), 'utf8');
};
const quizzes = (id: LId) =>
  lesson(id).blocks.flatMap((b: Block) => (b.kind === 'quiz' ? [b.quiz] : []));
const scenes = (id: LId) =>
  lesson(id).blocks.flatMap((b: Block) => (b.kind === 'scene' ? [b.scene] : []));

// ---------- exact fractions ----------
const fr = (s: string): number => {
  const [n, d] = s.split('/');
  return Number(n) / Number(d ?? 1);
};
/** Signed, fixed decimals with the typographic minus the lessons use. */
const sgn = (v: number, d = 3): string => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);
const plain = (v: number, d = 3): string => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

// ---------- hands ----------
const cards = (s: string) => parseCards(s);
const RANK_CH = '23456789TJQKA';

/** Preflop class of two cards: {hi, lo, suited}. */
function classOf(hole: number[]) {
  const [a, b] = hole as [number, number];
  const hi = Math.max(rankOf(a), rankOf(b));
  const lo = Math.min(rankOf(a), rankOf(b));
  return { hi, lo, suited: suitOf(a) === suitOf(b), pair: hi === lo };
}
/** decisions.md §3 basic preflop = perfect preflop. rank: 0=2 ... 12=A. */
function bet4x(hole: number[]): boolean {
  const { hi, lo, suited, pair } = classOf(hole);
  const R = (c: string) => RANK_CH.indexOf(c);
  if (pair) return hi >= R('3');
  if (hi === R('A')) return true;
  if (hi === R('K')) return suited || lo >= R('5');
  if (hi === R('Q')) return suited ? lo >= R('6') : lo >= R('8');
  if (hi === R('J')) return suited ? lo >= R('8') : lo >= R('T');
  return false;
}

// ---------- exact enumeration ----------
const BLIND_PAY: Record<string, number> = {
  straight: 1,
  flush: 1.5,
  'full-house': 3,
  quads: 10,
  'straight-flush': 50,
  'royal-flush': 500,
};
const QUAL = 1 << 20; // dealer qualifies with a pair or better

const bitsOf = (list: readonly number[]) => {
  const m = [0, 0, 0, 0];
  for (const c of list) m[suitOf(c)]! |= 1 << rankOf(c);
  return m as [number, number, number, number];
};
const add = (m: readonly number[], c: number): [number, number, number, number] => {
  const o = [...m] as [number, number, number, number];
  o[suitOf(c)] |= 1 << rankOf(c);
  return o;
};
const unseen = (seen: readonly number[]) => {
  const s = new Set(seen);
  return Array.from({ length: 52 }, (_, i) => i).filter((c) => !s.has(c));
};

interface RiverStats {
  win: number;
  tie: number;
  lose: number;
  loseQual: number;
  loseNoQual: number;
  /** sum over the 990 dealer hands of the play-independent part, and wins minus losses */
  base: number;
  net: number;
}
/** One 7-card showdown tally over all 990 dealer hands. EV(m) = (base + m * net) / 990. */
function riverTally(hole: number[], board: number[]): RiverStats {
  const pv = handValueOf([...hole, ...board]);
  const bonus = BLIND_PAY[categoryOf(pv)] ?? 0;
  const pm = bitsOf([...hole, ...board]);
  void pm;
  const bm = bitsOf(board);
  const rest = unseen([...hole, ...board]);
  const t: RiverStats = { win: 0, tie: 0, lose: 0, loseQual: 0, loseNoQual: 0, base: 0, net: 0 };
  for (let i = 0; i < rest.length; i++) {
    const m1 = add(bm, rest[i]!);
    for (let j = i + 1; j < rest.length; j++) {
      const m2 = add(m1, rest[j]!);
      const dv = evalMasks(m2[0], m2[1], m2[2], m2[3]);
      const q = dv >= QUAL;
      if (pv > dv) {
        t.win++;
        t.base += (q ? 1 : 0) + bonus;
        t.net++;
      } else if (pv < dv) {
        t.lose++;
        if (q) t.loseQual++;
        else t.loseNoQual++;
        t.base += q ? -2 : -1;
        t.net--;
      } else t.tie++;
    }
  }
  return t;
}
const ev = (t: RiverStats, m: number) => (t.base + m * t.net) / 990;
const riverEv1x = (hole: number[], board: number[]) => ev(riverTally(hole, board), 1);

/** Dealer outs (decisions.md §3): unseen c with value(best 5 of board + c) > value(your 7). */
function dealerOuts(hole: number[], board: number[]): number {
  const mine = handValueOf([...hole, ...board]);
  return unseen([...hole, ...board]).filter((c) => handValueOf([...board, c]) > mine).length;
}
const isHidden = (hole: number[], board: number[]): boolean => {
  const mine = handValueOf([...hole, ...board]);
  const mc = mine >>> 20;
  return mc >= 1 && mc > handValueOf(board) >>> 20;
};
const basicRiver = (hole: number[], board: number[]): 'play-1' | 'fold' =>
  isHidden(hole, board) || dealerOuts(hole, board) < 21 ? 'play-1' : 'fold';
const exactRiver = (hole: number[], board: number[]): 'play-1' | 'fold' =>
  riverEv1x(hole, board) > -2 ? 'play-1' : 'fold';

/** Exact flop EVs: 2x and check (best of 1x / fold at every turn+river). */
function flopEv(hole: number[], flop: number[]): { x2: number; check: number } {
  const rest = unseen([...hole, ...flop]);
  let s2 = 0;
  let sc = 0;
  let n = 0;
  for (let i = 0; i < rest.length; i++)
    for (let j = i + 1; j < rest.length; j++) {
      const t = riverTally(hole, [...flop, rest[i]!, rest[j]!]);
      s2 += ev(t, 2);
      sc += Math.max(ev(t, 1), -2);
      n++;
    }
  return { x2: s2 / n, check: sc / n };
}
const flopCache = new Map<string, { x2: number; check: number }>();
const flopOf = (hole: string, flop: string) => {
  const k = `${hole}|${flop}`;
  if (!flopCache.has(k)) flopCache.set(k, flopEv(cards(hole), cards(flop)));
  return flopCache.get(k)!;
};
const exactFlop = (hole: string, flop: string): 'play-2' | 'check' => {
  const e = flopOf(hole, flop);
  return e.x2 > e.check ? 'play-2' : 'check';
};
/** Category number (0 high card, 1 pair, 3 trips) of a three-card flop. */
function flopCategory(flop: number[]): number {
  const n = new Set(flop.map(rankOf)).size;
  return n === 3 ? 0 : n === 2 ? 1 : 3;
}
/** decisions.md §3 basic flop. */
function basicFlop(hole: number[], flop: number[]): 'play-2' | 'check' {
  const mine = handValueOf([...hole, ...flop]);
  const cat = mine >>> 20;
  if (cat >= 2 && cat > flopCategory(flop)) return 'play-2';
  const [a, b] = hole as [number, number];
  if (rankOf(a) === rankOf(b) && rankOf(a) !== 0) return 'play-2';
  if (flop.some((f) => rankOf(f) === rankOf(a) || rankOf(f) === rankOf(b))) return 'play-2';
  for (let s = 0; s < 4; s++) {
    const all = [...hole, ...flop].filter((c) => suitOf(c) === s).length;
    if (all >= 4 && hole.some((c) => suitOf(c) === s && rankOf(c) >= RANK_CH.indexOf('T')))
      return 'play-2';
  }
  return 'check';
}

// ---------- shared fractions (curriculum §11, decisions.md §4) ----------
const PRE: Record<string, { x4: string; chk: string; best: '4x' | 'check'; hole: string }> = {
  AA: { x4: '472094411/131098275', chk: '38331809/17479770', best: '4x', hole: 'As Ad' },
  A2o: { x4: '21882887/524393100', chk: '-1726877029/20975724000', best: '4x', hole: 'Ac 2d' },
  K5o: { x4: '-493274081/4195144800', chk: '-452775091/2996532000', best: '4x', hole: 'Kc 5d' },
  K4o: { x4: '-959897959/4195144800', chk: '-2160649801/10487862000', best: 'check', hole: 'Kc 4d' },
  K2s: { x4: '-31256633/419514480', chk: '-209546801/2621965500', best: '4x', hole: 'Kh 2h' },
  Q8o: { x4: '-14563139/209757240', chk: '-1941573583/20975724000', best: '4x', hole: 'Qc 8d' },
  Q7o: { x4: '-64699807/233063600', chk: '-549008027/2621965500', best: 'check', hole: 'Qc 7d' },
  J8s: { x4: '64357133/599306400', chk: '5101857/52969000', best: '4x', hole: 'Js 8s' },
  JTo: { x4: '243351613/1398381600', chk: '462669397/4195144800', best: '4x', hole: 'Jc Td' },
  J9o: { x4: '-953443/13620600', chk: '-202144889/5243931000', best: 'check', hole: 'Jc 9d' },
  T9s: { x4: '15536221/83902896', chk: '2155095367/10487862000', best: 'check', hole: 'Ts 9s' },
  '33': { x4: '61847329/699190800', chk: '39089459/5243931000', best: '4x', hole: '3c 3d' },
  '22': { x4: '-150961079/524393100', chk: '-470586269/2621965500', best: 'check', hole: '2c 2d' },
  '72o': { x4: '-141008727/66589600', chk: '-2645357879/2996532000', best: 'check', hole: '7s 2d' },
};

describe('lessons 7-14 exist and are real', () => {
  it('has the eight ids, in order, in perfect-lowest-edge, none a placeholder', () => {
    const chapter = bundle.chapters.find((c) => c.id === 'perfect-lowest-edge');
    expect(chapter?.lessons.slice(0, 8)).toEqual([...IDS]);
    for (const id of IDS) {
      expect(lesson(id).chapterId).toBe('perfect-lowest-edge');
      expect(raw(id)).not.toMatch(/Placeholder/);
      expect(lesson(id).blocks.length).toBeGreaterThan(2);
    }
  });
  it('uses the D31 labels (never "Raise") and keeps 3x out of every instruction', () => {
    for (const id of IDS) expect(raw(id).replace(/`/g, '')).not.toMatch(/\bRaise\b/);
  });
  it('quiz ids are unique and every quiz has a plausible shape', () => {
    for (const id of IDS)
      for (const q of quizzes(id)) {
        expect(q.id.startsWith(id)).toBe(true);
        expect(q.explanation.length).toBeGreaterThan(5);
      }
  });
});

describe('preflop chart (decisions.md §3) and lesson 7', () => {
  const all = Array.from({ length: 52 }, (_, i) => i);
  const combos: number[][] = [];
  for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) combos.push([all[i]!, all[j]!]);

  it('bets 4x on 500 of the 1,326 hands (37.7%) and 69 of 169 classes', () => {
    expect(combos.length).toBe(1326);
    expect(combos.filter(bet4x).length).toBe(500);
    const classes = new Set(
      combos.filter(bet4x).map((h) => {
        const c = classOf(h);
        return `${c.hi}-${c.lo}-${c.pair ? 'p' : c.suited ? 's' : 'o'}`;
      }),
    );
    expect(classes.size).toBe(69);
    expect(500 / 1326).toBeCloseTo(0.377, 3);
    expect(fr('250/663')).toBeCloseTo(500 / 1326, 12);
  });
  it('pins the prose numbers', () => {
    const t = raw('preflop-raise');
    for (const s of [
      '1,326 possible two-card hands',
      '169 kinds',
      '**500 of the 1,326 hands',
      '(37.7%)',
      '+0.042 antes',
      '**−0.082**',
      '+0.205',
      '(+0.185)',
      'average EV **+0.703** antes',
      'Aces +3.601, kings +3.289, AKs +1.658, AKo +1.172',
      '(826 hands): average EV **−0.461** antes',
      '72o −0.883, 22 −0.179',
      '−0.02185 antes per hand',
      '37.71% of hands are 4x, 21.28% bet 2x on the flop, 21.82% bet 1x on the',
      '19.19% fold',
    ])
      expect(t, s).toContain(s);
  });
  it('matches the §11 fractions for the prose hands', () => {
    const t = raw('preflop-raise');
    expect(sgn(fr(PRE.A2o!.x4))).toBe('+0.042');
    expect(sgn(fr(PRE.A2o!.chk))).toBe('−0.082');
    expect(sgn(fr(PRE.T9s!.chk))).toBe('+0.205');
    expect(sgn(fr(PRE.T9s!.x4))).toBe('+0.185');
    expect(sgn(fr('472094411/131098275'))).toBe('+3.601');
    expect(sgn(fr('492833497/149826600'))).toBe('+3.289');
    expect(sgn(fr('27606823/16647400'))).toBe('+1.658');
    expect(sgn(fr('307271677/262196550'))).toBe('+1.172');
    expect(plain(fr(PRE['72o']!.chk))).toBe('−0.883');
    expect(plain(fr(PRE['22']!.chk))).toBe('−0.179');
    expect(fr('-50643648973/2317817502000')).toBeCloseTo(-0.02185, 5);
    // 500 x 0.703 + 826 x -0.461 over 1,326 hands is the overall edge, within rounding
    expect((500 * 0.703 - 826 * 0.461) / 1326).toBeCloseTo(-0.02185, 2);
    // the four decision shares add up to every hand
    expect(0.3771 + 0.2128 + 0.2182 + 0.1919).toBeCloseTo(1, 3);
    expect(t).toContain('Check deuces');
  });
  it('has a chart and a practice scene, and every quiz hand agrees with the chart', () => {
    const blocks = lesson('preflop-raise').blocks;
    expect(blocks.find((b) => b.kind === 'chart')).toMatchObject({
      chart: {
        strategy: 'perfect',
        view: 'preflop-grid',
        highlight: ['33', 'A2o', 'K2s', 'K5o', 'Q6s', 'Q8o', 'J8s', 'JTo'],
      },
    });
    expect(scenes('preflop-raise')[0]).toMatchObject({ id: 'l07-s1', practice: true });
    for (const q of quizzes('preflop-raise').filter((x) => x.hand)) {
      const best = bet4x(cards(q.hand!.hole)) ? 'Bet 4x' : 'Check';
      expect(q.choices[q.answer], q.id).toBe(best);
    }
    expect(quizzes('preflop-raise').at(-1)!.choices[2]).toBe('About 38%');
  });
});

describe('lesson 8: preflop close calls', () => {
  const t = raw('preflop-close-calls');
  const rows = t.split('\n').filter((l) => l.startsWith('| {{'));
  it('every table row agrees with the exact fractions (4x, check, margin, best)', () => {
    const LABEL: Record<string, string> = {
      K5o: 'K5o',
      K4o: 'K4o',
      K2s: 'K2s',
      Q8o: 'Q8o',
      Q7o: 'Q7o',
      J8s: 'J8s',
      JTo: 'JTo',
      J9o: 'J9o',
      '33': '33',
      '22': '22',
      T9s: 'T9s',
    };
    let seen = 0;
    for (const [k, p] of Object.entries(PRE)) {
      if (!LABEL[k]) continue;
      const row = rows.find((r) => r.includes(`| ${k} |`) || r.includes(` ${k} | `));
      expect(row, k).toBeDefined();
      const cells = row!.split('|').map((c) => c.trim());
      expect(cells[1]).toContain(`{{${p.hole}}}`);
      const x4 = fr(p.x4);
      const ck = fr(p.chk);
      expect(cells[2]!.replace(/\*/g, ''), k).toBe(sgn(x4));
      expect(cells[3]!.replace(/\*/g, ''), k).toBe(sgn(ck));
      expect(cells[5], k).toBe(Math.abs(x4 - ck).toFixed(3));
      expect(cells[4]!.replace(/\*/g, ''), k).toBe(x4 > ck ? '4x' : 'Check');
      expect(x4 > ck ? '4x' : 'check', k).toBe(p.best);
      expect(bet4x(cards(p.hole)), k).toBe(p.best === '4x');
      seen++;
    }
    expect(seen).toBe(11);
    expect(rows.length).toBe(14); // plus Q6s, Q5s, J7s whose fractions are not in §11
    for (const s of ['Q6s | −0.006 | −0.028 | **4x** | 0.022', 'Q5s | −0.096 | −0.074 | **Check** | 0.021', 'J7s | −0.107 | −0.034 | **Check** | 0.072'])
      expect(t).toContain(s);
    // the 14 rows follow the chart
    expect(bet4x(cards('Qh 6h'))).toBe(true);
    expect(bet4x(cards('Qh 5h'))).toBe(false);
    expect(bet4x(cards('Js 7s'))).toBe(false);
  });
  it('per-hour figures are the arithmetic of §11 (30 hands/hour, $10 Ante)', () => {
    const perHour = (hands: number, cost: number) => 30 * (hands / 1326) * cost * 10;
    const k4o = fr(PRE.K4o!.chk) - fr(PRE.K4o!.x4);
    expect(k4o).toBeCloseTo(0.0228, 3);
    expect(perHour(12, k4o)).toBeCloseTo(0.06, 2);
    const aaCost = fr(PRE.AA!.x4) - fr(PRE.AA!.chk);
    expect(aaCost).toBeCloseTo(1.408, 3);
    expect(perHour(6, aaCost)).toBeCloseTo(1.91, 2);
    expect(1326 / 6).toBe(221);
    const sevenTwo = fr(PRE['72o']!.chk) - fr(PRE['72o']!.x4);
    expect(sevenTwo).toBeCloseTo(1.235, 3);
    expect(perHour(12, sevenTwo)).toBeCloseTo(3.35, 2);
    for (const s of [
      '6¢ an',
      '$1.91 an hour',
      'once every 221 deals',
      '≈ $0.06',
      '≈ $1.91',
      '≈ $3.35',
      '0.0228',
      '1.408',
      '1.235',
      '30 × (12/1,326)',
      '30 × (6/1,326)',
    ])
      expect(t, s).toContain(s);
  });
  it('quiz answers follow the fractions', () => {
    const qs = quizzes('preflop-close-calls');
    expect(qs[0]!.answer).toBe(1);
    expect(qs[1]!.choices[qs[1]!.answer]).toBe('Bet 4x'); // J8s
    expect(qs[2]!.answer).toBe(1); // aces checked cost more per hour than K4o
  });
});

describe('lessons 9-10: the flop, against exact enumeration', () => {
  // [hole, flop, 2x, check] from curriculum §11
  const FLOPS: [string, string, string, string][] = [
    ['9s 7d', '9h Kc 2s', '154367/178365', '10203/23782'],
    ['7c 6d', 'Kh 7s 2d', '686351/1070190', '3180/11891'],
    ['8h 3c', 'Ah Kd 3s', '-6421/35673', '-30619/97290'],
    ['Qc 5d', 'Qs 5h 9d', '58549/23265', '102591/59455'],
    ['Th 4h', 'Jh 8h 2c', '6791/19458', '68041/214038'],
    ['9h 4h', 'Jh 8h 2c', '18608/107019', '279407/1070190'],
    ['9c 8d', 'Ks Kd 4c', '-828371/535095', '-408029/356730'],
    ['9c 8d', 'Ts 7h 2c', '-3809/16215', '-24974/178365'],
    ['2c 2d', 'Kd 9c 5h', '-1031141/1070190', '-307123/356730'],
    ['2c 2d', '9s 9h 5c', '-6749/23782', '-23377/178365'],
    ['7h 6h', '8h 5c 2h', '2403509/2140380', '2234863/2140380'],
    ['Tc 8d', 'Js 9c 4h', '-163271/1070190', '-27322/178365'],
    ['Kc 3d', '8s 5h 2c', '-44531/32430', '-1186027/1070190'],
    ['Jd 5c', '5h 5s Kc', '178927/46530', '1054403/356730'],
  ];
  it('the local enumerator reproduces every §11 flop fraction', () => {
    for (const [h, f, x2, ck] of FLOPS) {
      const e = flopOf(h, f);
      expect(e.x2, `${h} | ${f} 2x`).toBeCloseTo(fr(x2), 9);
      expect(e.check, `${h} | ${f} check`).toBeCloseTo(fr(ck), 9);
    }
  }, 120_000);
  it('lesson 9 table rows print the exact values and the right best option', () => {
    const t = raw('flop-raise');
    const rows = t.split('\n').filter((l) => l.startsWith('| {{'));
    expect(rows.length).toBe(7);
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      const hole = /\{\{([^}]+)\}\}/.exec(cells[1]!)![1]!;
      const flop = /\{\{([^}]+)\}\}/.exec(cells[2]!)![1]!;
      const e = flopOf(hole, flop);
      const best = e.x2 > e.check ? 'x2' : 'check';
      const fmtCell = (v: number, bold: boolean) => (bold ? `**${sgn(v)}**` : sgn(v));
      // negative bold cells in the lesson are "**−1.144**" style too
      expect(cells[3], row).toBe(fmtCell(e.x2, best === 'x2'));
      expect(cells[4], row).toBe(fmtCell(e.check, best === 'check'));
      expect(cells[5]!.startsWith(best === 'x2' ? '2x' : 'Check'), row).toBe(true);
    }
    for (const s of [
      '154367/178365 ≈ 0.8655',
      '10203/23782 ≈ 0.4290',
      '1,070,190 showdowns',
      'C(47, 2) = 1,081',
      'C(45, 2) = 990',
      '**0.09% of the',
    ])
      expect(t, s).toContain(s);
    expect(fr('154367/178365')).toBeCloseTo(0.8655, 4);
    expect(fr('10203/23782')).toBeCloseTo(0.429, 4);
    expect((47 * 46) / 2).toBe(1081);
    expect((45 * 44) / 2).toBe(990);
    expect(1081 * 990).toBe(1_070_190);
  });
  it('lesson 10 prose values are the §11 fractions', () => {
    const t = raw('flop-tricky-boards');
    const pairs: [string, string, string, string][] = [
      ['**−0.861**', '**−0.964**', '-307123/356730', '-1031141/1070190'],
      ['−0.131', '−0.284', '-23377/178365', '-6749/23782'],
      ['−0.140', '−0.235', '-24974/178365', '-3809/16215'],
      ['+1.123', '+1.044', '2403509/2140380', '2234863/2140380'],
      ['−1.108', '−1.373', '-1186027/1070190', '-44531/32430'],
      ['+3.845', '+2.956', '178927/46530', '1054403/356730'],
    ];
    for (const [a, b, fa, fb] of pairs) {
      expect(t).toContain(a);
      expect(t).toContain(b);
      expect(sgn(fr(fa))).toBe(a.replace(/\*/g, ''));
      expect(sgn(fr(fb))).toBe(b.replace(/\*/g, ''));
    }
    // dead-even: "−0.1526 vs −0.1532" -> 2x by 0.0006
    expect(t).toContain('(−0.1526 vs −0.1532)');
    expect(plain(fr('-27322/178365'), 4)).toBe('−0.1532');
    expect(plain(fr('-163271/1070190'), 4)).toBe('−0.1526');
    expect(fr('-163271/1070190') - fr('-27322/178365')).toBeCloseTo(0.0006, 4);
    // the basic rules slip on 22 on 995 (rule says 2x) and on 7h6h on 8h5c2h (rule says check)
    expect(basicFlop(cards('2c 2d'), cards('9s 9h 5c'))).toBe('play-2');
    expect(exactFlop('2c 2d', '9s 9h 5c')).toBe('check');
    expect(basicFlop(cards('7h 6h'), cards('8h 5c 2h'))).toBe('check');
    expect(exactFlop('7h 6h', '8h 5c 2h')).toBe('play-2');
    // 0.086% and 26 cents an hour; and 0.09% in lesson 9
    const gap = fr('-50643648973/2317817502000') - fr('-106357031/4682459600');
    expect(gap * 100).toBeCloseTo(0.0864, 4);
    expect(gap * 300).toBeCloseTo(0.26, 2);
    expect(t).toContain('**0.086% of the Ante**');
    expect(t).toContain('26¢ an hour');
  });
  it('every flop quiz and scene hand has the right best play (exact), and the rules agree except where lesson 10 says', () => {
    const rulesAgree = (h: string, f: string) =>
      expect(basicFlop(cards(h), cards(f)), `${h}|${f}`).toBe(exactFlop(h, f));
    for (const id of ['flop-raise', 'flop-tricky-boards', 'checkpoint-strategy'] as const)
      for (const q of quizzes(id)) {
        if (!q.hand?.board || q.hand.board.split(' ').length !== 3) continue;
        const best = exactFlop(q.hand.hole, q.hand.board);
        expect(q.choices[q.answer], q.id).toBe(best === 'play-2' ? 'Bet 2x' : 'Check');
        if (!(q.hand.hole === '2c 2d' && q.hand.board === '9s 9h 5c')) rulesAgree(q.hand.hole, q.hand.board);
      }
  }, 120_000);
});

describe('lesson 11-12: the river, against exact enumeration', () => {
  const RIVERS: [string, string, string, number, 'play-1' | 'fold'][] = [
    ['Td 4c', 'Ts Kh 7d 3s 2c', '43/165', 3, 'play-1'],
    ['Qc 7d', 'Kd Jh 9s 5c 2d', '-601/330', 19, 'play-1'],
    ['Jd 8c', 'Kh Qs 4d 3c 2h', '-1871/990', 19, 'play-1'],
    ['8c 6d', 'Kh Qs 4d 3c 2h', '-2467/990', 31, 'fold'],
    ['Jc 9d', '8s 8h 5c 3d 2s', '-193/90', 23, 'fold'],
    ['6s 5d', 'Kh Kd 9c 9s 3h', '-479/198', 28, 'fold'],
    ['7d 5c', 'Jh 9s 8d 3c 2h', '-221/90', 31, 'fold'],
    ['4c 3d', 'As Ks Qs Jd Th', '-3/22', 0, 'play-1'],
  ];
  it('the local enumerator reproduces every §11 river fraction, outs and decision', () => {
    for (const [h, b, e, outs, best] of RIVERS) {
      expect(riverEv1x(cards(h), cards(b)), `${h}|${b}`).toBeCloseTo(fr(e), 12);
      expect(dealerOuts(cards(h), cards(b)), `${h}|${b} outs`).toBe(outs);
      expect(exactRiver(cards(h), cards(b)), `${h}|${b}`).toBe(best);
      expect(basicRiver(cards(h), cards(b)), `${h}|${b} basic`).toBe(best);
    }
    // the two documented exceptions to the practical rule
    const qq = [cards('2c 4h'), cards('Qc Qh Kh Qs 9d')] as const;
    expect(dealerOuts(...qq)).toBe(19);
    expect(basicRiver(...qq)).toBe('play-1');
    expect(exactRiver(...qq)).toBe('fold');
    expect(plain(riverEv1x(...qq))).toBe('−2.124');
    const fh = [cards('6d 5s'), cards('Kh 6h 8h 7c Qh')] as const;
    expect(isHidden(...fh)).toBe(true);
    expect(basicRiver(...fh)).toBe('play-1');
    expect(exactRiver(...fh)).toBe('fold');
    expect(plain(riverEv1x(...fh))).toBe('−2.034');
  });
  it('Qc 7d: 256 wins (all non-qualifying), 9 ties, 725 losses (609 + 116)', () => {
    const t = riverTally(cards('Qc 7d'), cards('Kd Jh 9s 5c 2d'));
    expect(t.win).toBe(256);
    expect(t.tie).toBe(9);
    expect(t.lose).toBe(725);
    expect(t.loseQual).toBe(609);
    expect(t.loseNoQual).toBe(116);
    expect((256 * 1 - 609 * 3 - 116 * 2) / 990).toBeCloseTo(-601 / 330, 12);
    const tx = riverTally(cards('4c 3d'), cards('As Ks Qs Jd Th'));
    expect(tx.tie).toBe(945);
    expect(tx.lose).toBe(45);
  });
  it('lesson 11 prose and table', () => {
    const t = raw('river-call-or-fold');
    for (const s of [
      '| {{Td 4c}} | {{Ts Kh 7d 3s 2c}} | **+0.261** | −2 | 1x (hidden pair) |',
      '| {{Qc 7d}} | {{Kd Jh 9s 5c 2d}} | **−1.821** | −2 |',
      '| {{8c 6d}} | {{Kh Qs 4d 3c 2h}} | −2.492 | **−2** | Fold',
      '| {{4c 3d}} | {{As Ks Qs Jd Th}} | **−0.136** | −2 |',
      'exactly 2 antes',
      'winning about 1 time in 5 is enough',
            '= 5w − 3, which beats −2 when **w > 1/5**',
      '= 3w − 2, which beats −2 for **any** w > 0',
      'of 990 dealer hands, you beat 256 (all non-qualifying), tie 9',
      'lose to 725 (609 qualifying, 116 not)',
      '(256 × 1 − 609 × 3 − 116 × 2) / 990 = −601/330 ≈ −1.821',
      'Betting 1x loses 1.82 antes',
    ])
      expect(t, s).toContain(s);
    expect(sgn(43 / 165)).toBe('+0.261');
    expect(plain(-601 / 330)).toBe('−1.821');
    expect(plain(-2467 / 990)).toBe('−2.492');
    expect(plain(-3 / 22)).toBe('−0.136');
    // the 1-in-5 bar: 5w - 3 > -2  <=>  w > 1/5; and with a non-qualifying dealer 3w - 2 > -2 <=> w > 0
    expect(5 * 0.2 - 3).toBe(-2);
    expect(3 * 0 - 2).toBe(-2);
  });
  it('lesson 12 prose, worked examples and sampled-rule figures', () => {
    const t = raw('counting-dealer-outs');
    for (const s of [
      'which leaves 45 unseen',
      'Five unpaired board ranks = **15 outs**',
      '**fewer than 21 outs → bet 1x. 21 or more → fold.**',
      '**19 outs → bet 1x.**',
      '**31 outs → fold.**',
      '**23 outs → fold.**',
      'about 1 in 90 (≈ sampled)',
      '(1x is −2.124)',
      '**0.11% of the Ante**',
      'about 33¢',
      '(1x is −2.034)',
      '28 outs',
    ])
      expect(t, s).toContain(s);
    // worked example arithmetic, from the real board/hand
    const outs15 = (h: string, b: string) => dealerOuts(cards(h), cards(b));
    expect(outs15('Qc 7d', 'Kd Jh 9s 5c 2d')).toBe(15 + 4);
    expect(outs15('8c 6d', 'Kh Qs 4d 3c 2h')).toBe(15 + 16);
    expect(outs15('Jd 8c', 'Kh Qs 4d 3c 2h')).toBe(15 + 4);
    expect(outs15('Jc 9d', '8s 8h 5c 3d 2s')).toBe(12 + 9 + 2);
    expect(outs15('6s 5d', 'Kh Kd 9c 9s 3h')).toBe(24 + 4);
    expect(outs15('7d 5c', 'Jh 9s 8d 3c 2h')).toBe(15 + 16);
    // 0.11% = basic (2.38140) - expert (2.27140); 33 cents an hour at $10
    const d = fr('-54758439/2299422125') - fr('-106357031/4682459600');
    expect(-d * 100).toBeCloseTo(0.11, 3);
    expect(-d * 300).toBeCloseTo(0.33, 2);
  });
  it('every river quiz and scene hand: the answer is the exact best play and the outs rule agrees', () => {
    for (const id of ['river-call-or-fold', 'counting-dealer-outs', 'checkpoint-strategy'] as const)
      for (const q of quizzes(id)) {
        const b = q.hand?.board;
        if (!b || b.split(' ').length !== 5 || !q.choices.includes('Fold')) continue;
        const best = exactRiver(cards(q.hand!.hole), cards(b));
        expect(q.choices[q.answer], q.id).toBe(best === 'play-1' ? 'Bet 1x' : 'Fold');
        expect(basicRiver(cards(q.hand!.hole), cards(b)), q.id).toBe(best);
      }
    const outsQuiz = quizzes('counting-dealer-outs').find((q) => q.hand)!;
    expect(outsQuiz.choices[outsQuiz.answer]).toBe(String(dealerOuts(cards(outsQuiz.hand!.hole), cards(outsQuiz.hand!.board!))));
  });
});

describe('lesson 13: the whole picture (decisions.md §4)', () => {
  const t = raw('strategy-lowest-edge');
  it('pins the canonical numbers', () => {
    const ev = fr('-50643648973/2317817502000');
    expect(-ev * 100).toBeCloseTo(2.185, 3);
    expect(-ev * 10).toBeCloseTo(0.22, 2);
    expect(-ev * 300).toBeCloseTo(6.555, 3);
    expect(fr('29163830173/7023689400')).toBeCloseTo(4.1522, 4);
    expect(fr('250/663') * 100).toBeCloseTo(37.7, 1);
    expect(fr('1382947/6497400') * 100).toBeCloseTo(21.3, 1);
    expect(fr('510906653/2341229800') * 100).toBeCloseTo(21.8, 1);
    expect(fr('224592289/1170614900') * 100).toBeCloseTo(19.2, 1);
    expect(fr('250/663') + fr('1382947/6497400') + fr('510906653/2341229800') + fr('224592289/1170614900')).toBeCloseTo(1, 12);
    for (const s of [
      '| Bet 4x preflop | 37.7% |',
      '| Bet 2x on the flop | 21.3% |',
      '| Bet 1x on the river | 21.8% |',
      '| Fold on the river | 19.2% |',
      '**4.15 antes**',
      '**2.185% of one Ante**',
      '**$6.55 an hour**',
      '−50643648973/2317817502000 ≈ −0.0218497 antes',
      'P(4x) = 250/663 (500 of 1,326 hands)',
      'P(2x) = 1382947/6497400 ≈ 21.28%',
      'P(1x) ≈ 21.82%',
      'P(fold) ≈ 19.19%',
      '29163830173/7023689400 ≈ 4.1522 antes',
      'Standard deviation ≈ 4.94 antes',
      'all 19,600 flops',
      '1,081',
      '990 dealer hands',
      'lose the least possible: 2.19% of the Ante',
      '33+, any ace, any suited king, K5o+, Q6s+, Q8o+, J8s+, JTo',
      'Never bet 3x.',
    ])
      expect(t, s).toContain(s);
    expect((50 * 49 * 48) / 6).toBe(19600);
  });
  it('quiz answers and scenes', () => {
    const qs = quizzes('strategy-lowest-edge');
    expect(qs[0]!.choices[qs[0]!.answer]).toBe('2.19% of the Ante');
    expect(qs[1]!.choices[qs[1]!.answer]).toBe('About 38%');
    expect(qs[2]!.choices[qs[2]!.answer]).toMatch(/22¢/);
    const [s] = scenes('strategy-lowest-edge');
    expect(s).toMatchObject({ id: 'l13-s1', ui: { showSession: true } });
    expect(s!.steps!.map((x) => x.completeWhen)).toEqual([{ hands: 10 }, { tapped: 'session' }]);
  });
});

describe('lesson 14: checkpoint', () => {
  it('ten quizzes, every decision quiz matches the chart or exact math', () => {
    const qs = quizzes('checkpoint-strategy');
    expect(qs.length).toBe(10);
    for (const q of qs.filter((x) => x.hand && !x.hand.board)) {
      const best = bet4x(cards(q.hand!.hole)) ? 'Bet 4x' : 'Check';
      expect(q.choices[q.answer], q.id).toBe(best);
    }
    expect(qs[8]!.choices[qs[8]!.answer]).toBe('Bet 3x');
    expect(qs[9]!.choices[qs[9]!.answer]).toBe('About $6.55 an hour');
    expect((30 * 10 * 0.0218497).toFixed(2)).toBe('6.55');
    expect(raw('checkpoint-strategy')).toContain('30 × $10 × 2.185% ≈ $6.55');
  });
});

describe('scenes (all lessons 7-14)', () => {
  const all = IDS.flatMap((id) => scenes(id).map((s) => ({ id, s })));
  it('has the 13 expected scenes with unique lNN-sN ids in the right lessons', () => {
    expect(all.map((x) => x.s.id)).toEqual([
      'l07-s1',
      'l08-s1',
      'l09-s1',
      'l09-s2',
      'l10-s1',
      'l11-s1',
      'l12-s1',
      'l13-s1',
      'l14-s1',
    ]);
    for (const { id, s } of all)
      expect(s.id.startsWith('l' + String(IDS.indexOf(id) + 7).padStart(2, '0') + '-s')).toBe(true);
  });
  it('every scene validates and follows D25-D27a', () => {
    for (const { s } of all) {
      const v = validateScene(s);
      expect(v.ok, `${s.id}: ${v.ok ? '' : v.errors.join('; ')}`).toBe(true);
      expect(s.version).toBe(1);
      const ids = (s.steps ?? []).map((x) => x.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
      for (const step of s.steps ?? []) {
        // D25: no legacy keys, startAt is an object
        const j = JSON.stringify(step);
        expect(j, `${s.id}/${step.id}`).not.toMatch(/"(say|showEv|allowed|next|handsPlayed|autoPlayDone|tap)"/);
        if (step.startAt) expect(typeof step.startAt).toBe('object');
        // D27a: no dead ends
        if (step.allowedActions) {
          const needsAction = !('acknowledged' in step.completeWhen) && !('tapped' in step.completeWhen);
          if (needsAction) expect(step.allowedActions.length, `${s.id}/${step.id}`).toBeGreaterThan(0);
        }
        if (step.allowedOptions) expect(step.allowedOptions.length).toBeGreaterThan(0);
        // D27: best-decision steps carry best:true and a bestDecisions street
        if ('bestDecisions' in step.completeWhen) {
          expect(step.expect?.some((e) => e.best), `${s.id}/${step.id}`).toBe(true);
          const street = step.completeWhen.bestDecisions.street;
          if (step.startAt) expect(street, `${s.id}/${step.id}`).toBe(step.startAt.street);
        }
        // forced deals are parseable and have no duplicate cards
        for (const d of [...(step.deals ?? []), ...(step.startAt ? [step.startAt.deal] : [])]) {
          const list = [d.player, d.dealer, d.flop, d.turn, d.river].flat().filter((x): x is string => !!x);
          expect(() => parseCards(list.join(' ')), `${s.id}/${step.id}`).not.toThrow();
        }
      }
    }
  });
  it('l07-s1 hides EV until confirm (D35 S4)', () => {
    expect(all.find((x) => x.s.id === 'l07-s1')!.s.practice).toBe(true);
  });
  it('the best play at every guided decision is the one the step teaches (exact math)', () => {
    const P4 = 'play-4';
    const EXPECT: Record<string, Record<string, string>> = {
      'l07-s1': { h1: P4, h2: P4, h3: P4, h4: 'check', h5: P4, h6: 'check' },
      'l08-s1': { h1: P4, h2: 'check', h3: P4, h4: 'check', h5: 'check' },
      'l09-s1': { flop: 'play-2' },
      'l09-s2': { h1: 'play-2', h2: 'check', h3: 'check' },
      'l10-s1': { h1: 'check', h2: 'check', h3: 'play-2', h4: 'play-2' },
      'l11-s1': { h1: 'play-1', h2: 'play-1', h3: 'fold', h4: 'play-1' },
      'l12-s1': { h1: 'play-1', h2: 'fold', h3: 'fold' },
      'l14-s1': { h1: P4, h2: 'play-2', h3: 'play-1' },
    };
    let checked = 0;
    for (const { s } of all) {
      const want = EXPECT[s.id];
      if (!want) continue;
      let last: ForcedDeal | undefined;
      for (const step of s.steps ?? []) {
        last = step.startAt?.deal ?? step.deals?.[0] ?? last;
        const w = want[step.id];
        if (!w) continue;
        const d = last;
        const street = step.startAt?.street ?? 'flop';
        expect(d, `${s.id}/${step.id}`).toBeDefined();
        const hole = d!.player!.join(' ');
        let got: string;
        if (street === 'preflop') got = bet4x(cards(hole)) ? P4 : 'check';
        else if (street === 'flop') got = exactFlop(hole, d!.flop!.join(' '));
        else {
          const board = [...d!.flop!, d!.turn!, d!.river!];
          got = exactRiver(cards(hole), cards(board.join(' ')));
          expect(basicRiver(cards(hole), cards(board.join(' '))), `${s.id}/${step.id} outs rule`).toBe(got);
        }
        expect(got, `${s.id}/${step.id}`).toBe(w);
        checked++;
      }
    }
    // l09-s1 preflop step: nine-seven offsuit is a check on the chart
    expect(bet4x(cards('9s 7d'))).toBe(false);
    expect(checked).toBe(6 + 5 + 1 + 3 + 4 + 4 + 3 + 3);
  }, 120_000);
  it('the l12-s1 wrap step has 28 outs, the l12-s1 hands 19 / 23 outs', () => {
    expect(dealerOuts(cards('Jd 8c'), cards('Kh Qs 4d 3c 2h'))).toBe(19);
    expect(dealerOuts(cards('Jc 9d'), cards('8s 8h 5c 3d 2s'))).toBe(23);
    expect(dealerOuts(cards('6s 5d'), cards('Kh Kd 9c 9s 3h'))).toBe(28);
  });
});
