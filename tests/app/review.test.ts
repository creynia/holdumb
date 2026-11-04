import { describe, expect, it } from 'vitest';
import { seedRng } from '../../src/sim/engine/rng';
import { pickDueReview, spotFromCode } from '../../src/sim/strategy';
import { MemoryStorage, sanitize } from '../../src/app/storage';
import { Store } from '../../src/app/store';
import {
  MAX_REVIEW,
  REVIEW_INTERVALS,
  dueCodes,
  reviewAfterAnswer,
  reviewAllowed,
  type ReviewItem,
} from '../../src/app/review';

const A = 'f:2dJd.4h6d9d';
const B = 'f:7sQd.KsKd9s';
const C = 'p:AhKd.';

describe('Leitner boxes on an answers clock', () => {
  it('a miss goes to box 1, due after 3 more answers', () => {
    expect(reviewAfterAnswer([], A, false, 10)).toEqual([{ code: A, box: 1, due: 14 }]);
  });
  it('a correct review climbs one box at a time with intervals 3, 8, 20, 50', () => {
    expect(REVIEW_INTERVALS.slice(0, 4)).toEqual([3, 8, 20, 50]);
    let deck: ReviewItem[] = reviewAfterAnswer([], A, false, 0); // answer 1 missed: box 1, due 4
    const boxes: Array<[number, number]> = [];
    let clock = 4;
    for (let i = 0; i < 4; i++) {
      deck = reviewAfterAnswer(deck, A, true, clock); // answered when due
      boxes.push([deck[0]!.box, deck[0]!.due - (clock + 1)]);
      clock = deck[0]!.due;
    }
    expect(boxes).toEqual([
      [2, 8],
      [3, 20],
      [4, 50],
      [5, 50],
    ]);
  });
  it('a correct answer in box 5 leaves the deck', () => {
    expect(reviewAfterAnswer([{ code: A, box: 5, due: 7 }], A, true, 7)).toEqual([]);
  });
  it('a miss sends it back to box 1 from any box', () => {
    expect(reviewAfterAnswer([{ code: A, box: 4, due: 9 }], A, false, 9)).toEqual([
      { code: A, box: 1, due: 13 },
    ]);
  });
  it('a correct answer before it is due changes nothing', () => {
    const deck = [{ code: A, box: 2, due: 20 }];
    expect(reviewAfterAnswer(deck, A, true, 5)).toEqual(deck);
    expect(reviewAfterAnswer(deck, B, true, 5)).toEqual(deck); // not in the deck at all
  });
  it('the deck holds at most 200 items', () => {
    let deck: ReviewItem[] = [];
    for (let i = 0; i < 260; i++) deck = reviewAfterAnswer(deck, `f:x${i}`, false, i);
    expect(deck).toHaveLength(MAX_REVIEW);
    expect(deck[0]!.code).toBe('f:x259'); // newest kept
  });
  it('dueCodes lists what is due, longest overdue first', () => {
    const deck: ReviewItem[] = [
      { code: A, box: 1, due: 9 },
      { code: B, box: 2, due: 4 },
      { code: C, box: 1, due: 30 },
    ];
    expect(dueCodes(deck, 10)).toEqual([B, A]);
    expect(dueCodes(deck, 3)).toEqual([]);
  });
});

describe('dealing reviews', () => {
  it('never more than 30% of 200 dealt spots are reviews, deterministically, while some are due', () => {
    const run = (seed: number) => {
      let rng = seedRng(seed);
      const due = [A, B, C];
      let dealt = 0;
      let reviews = 0;
      for (let i = 0; i < 200; i++) {
        const [s, r] = pickDueReview(rng, due, { street: 'mixed' }, reviewAllowed(dealt, reviews));
        rng = r;
        if (s) reviews++;
        dealt++;
      }
      return reviews;
    };
    for (const seed of [1, 2, 3]) {
      const n = run(seed);
      expect(n).toBeLessThanOrEqual(60); // 30% of 200
      expect(n).toBeGreaterThan(40); // and the cap is actually used
      expect(run(seed)).toBe(n); // same seed, same count
    }
  });
  it('only deals reviews inside the street and category filter', () => {
    let rng = seedRng(5);
    for (let i = 0; i < 40; i++) {
      const [s, r] = pickDueReview(rng, [A, B, C], { street: 'flop' }, true);
      rng = r;
      if (s) expect(s.street).toBe('flop');
    }
    const [none] = pickDueReview(seedRng(1), [A, B, C], { street: 'river' }, true);
    expect(none).toBeNull();
    const [cat] = pickDueReview(
      seedRng(1),
      [C],
      { street: 'mixed', category: 'flop-flush-draw' },
      true,
    );
    expect(cat).toBeNull();
    expect(spotFromCode(A).category).toBe('flop-flush-draw');
  });
  it('nothing due, or not allowed, deals no review', () => {
    expect(pickDueReview(seedRng(1), [], { street: 'mixed' }, true)[0]).toBeNull();
    expect(pickDueReview(seedRng(1), [A], { street: 'mixed' }, false)[0]).toBeNull();
    expect(reviewAllowed(0, 0)).toBe(false);
    expect(reviewAllowed(3, 0)).toBe(true);
    expect(reviewAllowed(3, 1)).toBe(false);
  });
});

describe('the deck in the store and storage', () => {
  it('Store: misses enter the deck, review is due after 3 answers, per lens', () => {
    const s = new Store(new MemoryStorage());
    s.recordDrill('flop', false, A);
    expect(s.dueReview()).toEqual([]); // 1 answer given, due at 4
    s.recordDrill('preflop', true, C);
    s.recordDrill('preflop', true, C);
    expect(s.dueReview()).toEqual([]);
    s.recordDrill('preflop', true, C);
    expect(s.dueReview()).toEqual([A]);
    s.setDrillLens('practical');
    expect(s.dueReview()).toEqual([]); // the other lens has its own deck and clock
    s.setDrillLens('perfect');
    s.recordDrill('flop', true, A); // due and correct: up to box 2
    expect(s.drill.review.find((i) => i.code === A)!.box).toBe(2);
    expect(s.dueReview()).toEqual([]);
  });
  it('sanitizer: caps at 200, drops unknown codes and duplicates, clamps boxes, migrates recentMisses', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      code: i % 2 ? A : B, // duplicates collapse
      box: 9,
      due: i,
    }));
    const p = sanitize({
      version: 1,
      drill: { review: [...many, { code: 'nope', box: 1, due: 0 }] },
    })!;
    expect(p.drill.review.map((i) => i.code)).toEqual([B, A]);
    expect(p.drill.review[0]!.box).toBe(5);
    const big = Array.from(
      { length: 400 },
      (_, i) =>
        `p:${['Ah', 'Kd', 'Qs', 'Jc'][i % 4]}${['2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', 'Td', 'Jd', 'Qd', 'Kd', 'Ad'][i % 13]}${i}.`,
    );
    expect(
      sanitize({ version: 1, drill: { review: big.map((code) => ({ code, box: 1, due: 0 })) } })!
        .drill.review.length,
    ).toBeLessThanOrEqual(MAX_REVIEW);
    const mig = sanitize({ version: 1, drill: { recentMisses: [A, 'x'] } })!;
    expect(mig.drill.review).toEqual([{ code: A, box: 1, due: 0 }]);
  });
});
