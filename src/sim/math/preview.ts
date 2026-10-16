// The preview job (simulator.md §2.3): the exact EV of every option at a decision.
// River: 990 dealer hands on the spot. Flop: 1,070,190 showdowns, chunked. Preflop: the table.
import type { Progress } from '../engine/job';
import type { DecisionAction, DecisionStreet } from '../engine/types';
import {
  riverTotals,
  flopTotalsJob,
  deadMask,
  DEALER_HANDS,
  FLOP_SHOWDOWNS,
  RUNOUTS,
} from './enumerate';
import { breakdown, makeRow, showdownRows } from './explain';
import { cmp, frac, mul, sub } from './fraction';
import { BOARDS, DEALER, FLOPS, preflopClass, preflopRow, rowSums } from './preflop';
import { decisionTier } from './tiers';
import type {
  DecisionOption,
  DecisionPreview,
  Fraction,
  PreviewRequest,
  WhyBreakdown,
} from './types';

export const LABELS = {
  4: 'Bet 4x',
  3: 'Bet 3x',
  2: 'Bet 2x',
  1: 'Bet 1x',
  check: 'Check',
  fold: 'Fold',
} as const;

const PLAY = (multiple: 1 | 2 | 3 | 4): DecisionAction => ({ type: 'play', multiple });
const CHECK: DecisionAction = { type: 'check' };
const FOLD: DecisionAction = { type: 'fold' };

interface Draft {
  action: DecisionAction;
  label: string;
  ev: Fraction;
  /** Total money wagered on the option's path, used only to break exact EV ties. */
  wager: number;
  assumesBestLater: boolean;
  why: WhyBreakdown;
}

/** Picks the best (ties → smaller wager), fills regret, tier and cents. */
function finish(
  street: DecisionStreet,
  drafts: Draft[],
  ante: number,
  source: 'table' | 'enumeration',
  showdowns: number,
  handClass?: string,
): DecisionPreview {
  let bestIndex = 0;
  drafts.forEach((d, i) => {
    const b = drafts[bestIndex] as Draft;
    const c = cmp(d.ev, b.ev);
    if (c > 0 || (c === 0 && d.wager < b.wager)) bestIndex = i;
  });
  const best = drafts[bestIndex] as Draft;
  const options: DecisionOption[] = drafts.map((d) => {
    const regret = sub(best.ev, d.ev);
    return {
      action: d.action,
      label: d.label,
      ev: d.ev,
      evCents: mul(d.ev, frac(ante)),
      regret,
      tier: decisionTier(regret),
      assumesBestLater: d.assumesBestLater,
      why: d.why,
    };
  });
  const out: DecisionPreview = { street, options, bestIndex, exact: true, source, showdowns };
  if (handClass) out.handClass = handClass;
  return out;
}

function foldWhy(outOf: bigint): WhyBreakdown {
  const row = makeRow('fold', outOf, outOf, frac(-2n * outOf), frac(-2));
  return breakdown([row], 'dealer hands');
}

function validate(req: PreviewRequest): void {
  const want = req.street === 'preflop' ? 0 : req.street === 'flop' ? 3 : 5;
  if (req.board.length !== want) {
    throw new Error(`A ${req.street} preview needs ${want} board cards, got ${req.board.length}`);
  }
  deadMask([...req.hole, ...req.board]); // range + duplicate check
  if (!Number.isInteger(req.ante) || req.ante <= 0) throw new RangeError('ante must be cents > 0');
}

export function* previewJob(
  req: PreviewRequest,
): Generator<Progress | undefined, DecisionPreview, void> {
  validate(req);
  if (req.street === 'river') return riverPreview(req);
  if (req.street === 'flop') return yield* flopPreview(req);
  return preflopPreview(req);
}

export function riverPreview(req: PreviewRequest): DecisionPreview {
  const t = riverTotals(req.hole, req.board, req.blindPaytable);
  const n = BigInt(DEALER_HANDS);
  const ev1 = frac(BigInt(t.a2 + t.p2), 2n * n);
  const rows = showdownRows(
    {
      wq: BigInt(t.wq),
      wnq: BigInt(t.wnq),
      tie: BigInt(t.tie),
      lq: BigInt(t.lq),
      lnq: BigInt(t.lnq),
      bb2q: BigInt(t.wq) * BigInt(t.b2),
      bb2nq: BigInt(t.wnq) * BigInt(t.b2),
      outOf: n,
    },
    1n,
  );
  return finish(
    'river',
    [
      {
        action: PLAY(1),
        label: LABELS[1],
        ev: ev1,
        wager: 3,
        assumesBestLater: false,
        why: breakdown(rows, 'dealer hands'),
      },
      {
        action: FOLD,
        label: LABELS.fold,
        ev: frac(-2),
        wager: 2,
        assumesBestLater: false,
        why: foldWhy(n),
      },
    ],
    req.ante,
    'enumeration',
    DEALER_HANDS,
  );
}

function* flopPreview(req: PreviewRequest): Generator<Progress | undefined, DecisionPreview, void> {
  const gen = flopTotalsJob({
    hole: req.hole,
    flop: req.board,
    blind: req.blindPaytable,
  });
  let step = gen.next();
  while (!step.done) {
    yield step.value;
    step = gen.next();
  }
  const t = step.value;
  const D = 2n * BigInt(DEALER_HANDS) * BigInt(RUNOUTS);
  const ev2 = frac(BigInt(t.sum2x), D);
  const evCheck = frac(BigInt(t.sumCheck), D);
  const outOf = BigInt(FLOP_SHOWDOWNS);
  const rows2 = showdownRows(
    {
      wq: BigInt(t.wq),
      wnq: BigInt(t.wnq),
      tie: BigInt(t.tie),
      lq: BigInt(t.lq),
      lnq: BigInt(t.lnq),
      bb2q: BigInt(t.bb2q),
      bb2nq: BigInt(t.bb2nq),
      outOf,
    },
    2n,
  );
  const runouts = BigInt(RUNOUTS);
  const unit = 2n * BigInt(DEALER_HANDS); // half-antes → antes per runout
  const checkRows = [
    makeRow('later-play', BigInt(t.playRunouts), runouts, frac(BigInt(t.sumPlay), unit), frac(0)),
    makeRow(
      'later-fold',
      BigInt(t.foldRunouts),
      runouts,
      frac(-2n * BigInt(t.foldRunouts)),
      frac(-2),
    ),
  ];
  return finish(
    'flop',
    [
      {
        action: PLAY(2),
        label: LABELS[2],
        ev: ev2,
        wager: 4,
        assumesBestLater: false,
        why: breakdown(rows2, 'turn-river cards × dealer hands'),
      },
      {
        action: CHECK,
        label: LABELS.check,
        ev: evCheck,
        wager: 2,
        assumesBestLater: true,
        why: breakdown(checkRows, 'turn-river cards', 'Assumes you play the river perfectly.'),
      },
    ],
    req.ante,
    'enumeration',
    FLOP_SHOWDOWNS,
  );
}

export function preflopPreview(req: PreviewRequest): DecisionPreview {
  const name = preflopClass(req.hole);
  const row = preflopRow(req.blindPaytable, name);
  const s = rowSums(row);
  const DR = 2n * DEALER * BOARDS; // half-ante denominator of the raise path
  const outOf = DEALER * BOARDS;
  const raiseWhy = (k: bigint): WhyBreakdown =>
    breakdown(
      showdownRows(
        {
          wq: row.wq,
          wnq: row.sw - row.wq,
          tie: outOf - row.sw - row.sl,
          lq: row.lq,
          lnq: row.sl - row.lq,
          bb2q: row.bb2q,
          bb2nq: row.bb2nq,
          outOf,
        },
        k,
      ),
      'boards × dealer hands',
    );
  const raise = (k: 4 | 3): Draft => ({
    action: PLAY(k),
    label: LABELS[k],
    ev: frac(s.SA + BigInt(k) * s.SP, DR),
    wager: 2 + k,
    assumesBestLater: false,
    why: raiseWhy(BigInt(k)),
  });
  const cases = FLOPS * BigInt(RUNOUTS);
  const DC = 2n * DEALER * cases;
  const checkRows = [
    makeRow('later-raise', row.f2 * BigInt(RUNOUTS), cases, frac(row.s2x, 2n * DEALER), frac(0)),
    makeRow('later-play', s.cp, cases, frac(row.scp, 2n * DEALER), frac(0)),
    makeRow('later-fold', row.cf, cases, frac(-2n * row.cf), frac(-2)),
  ];
  const check: Draft = {
    action: CHECK,
    label: LABELS.check,
    ev: frac(s.SC, DC),
    wager: 2,
    assumesBestLater: true,
    why: breakdown(
      checkRows,
      'flops × turn-river cards',
      'Assumes you play the flop and river perfectly.',
    ),
  };
  return finish('preflop', [raise(4), raise(3), check], req.ante, 'table', 0, name);
}
