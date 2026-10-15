// Dev-only gallery of the table UI. Run `npm run dev` and open /src/sim/ui/gallery.html
//   ?scene=betting|preflop|flop|river|river-fold|fold|win|blunder|chart|badges
//   &view=portrait|landscape   &theme=dark|light   &four=1   &speed=normal|fast|instant
// Data comes from fixtures.ts (exact fractions from the design docs), shaped like DecisionPreview.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import type { Card, GameEvent, Street } from '../engine';
import type { DecisionPreview } from '../math';
import type { OptionKey } from '../scene';
import { ActionBar } from './ActionBar';
import { ChipRack } from './ChipRack';
import { EvOptionList } from './EvOptionList';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { FoldReveal } from './FoldReveal';
import { StatusBar } from './StatusBar';
import { StrategyChart } from './StrategyChart';
import { Table, useOrientation } from './Table';
import { TierBadge } from './TierBadge';
import { Toasts } from './Toasts';
import { buildTimeline, effectiveSpeed, useSkippableMotion } from './animation';
import type { Speed } from './animation';
import {
  FIXTURES,
  FLOP_HIDDEN_PAIR,
  FOLDED_DEALER_CARDS,
  FOLDED_RESULT,
  PREFLOP_AA,
  RIVER_ACE_HIGH,
  RIVER_PLAY_BOARD,
  WON_RESULT,
} from './fixtures';
import { describeResult, handName, optionKeyOf } from './text';

const q = new URLSearchParams(location.search);
if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme')!;
const scene = q.get('scene');
const fourColor = q.get('four') === '1';
const speed = effectiveSpeed((q.get('speed') as Speed | null) ?? 'normal');
const viewPref = (q.get('view') as 'portrait' | 'landscape' | null) ?? 'auto';

interface Scene {
  street: Street;
  hole: readonly Card[] | null;
  board: readonly Card[];
  preview: DecisionPreview | null;
  open?: OptionKey;
  dealerShown?: boolean;
  dealer?: readonly Card[];
  result?: 'fold' | 'win';
  play?: number;
  chosen?: OptionKey;
}

const SCENES: Record<string, Scene> = {
  betting: { street: 'betting', hole: null, board: [], preview: null },
  preflop: { street: 'preflop', hole: PREFLOP_AA.hole, board: [], preview: PREFLOP_AA.preview },
  flop: {
    street: 'flop',
    hole: FLOP_HIDDEN_PAIR.hole,
    board: FLOP_HIDDEN_PAIR.board,
    preview: FLOP_HIDDEN_PAIR.preview,
    play: undefined,
  },
  river: {
    street: 'river',
    hole: RIVER_ACE_HIGH.hole,
    board: RIVER_ACE_HIGH.board,
    preview: RIVER_ACE_HIGH.preview,
    open: 'play-1',
  },
  'river-fold': {
    street: 'river',
    hole: RIVER_PLAY_BOARD.hole,
    board: RIVER_PLAY_BOARD.board,
    preview: RIVER_PLAY_BOARD.preview,
    open: 'play-1',
  },
  fold: {
    street: 'settled',
    hole: RIVER_ACE_HIGH.hole,
    board: RIVER_ACE_HIGH.board,
    preview: null,
    dealerShown: true,
    dealer: FOLDED_DEALER_CARDS,
    result: 'fold',
  },
  win: {
    street: 'settled',
    hole: RIVER_ACE_HIGH.hole,
    board: RIVER_ACE_HIGH.board,
    preview: null,
    dealerShown: true,
    dealer: FOLDED_DEALER_CARDS,
    result: 'win',
    play: 4,
  },
  blunder: {
    street: 'preflop',
    hole: PREFLOP_AA.hole,
    board: [],
    preview: PREFLOP_AA.preview,
    open: 'check',
  },
};

function Badges() {
  const decision = ['best', 'close', 'small', 'costly', 'blunder'] as const;
  const wager = ['free', 'good', 'fair', 'poor', 'avoid'] as const;
  return (
    <div style="padding:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start">
      {decision.map((t) => (
        <TierBadge key={t} tier={t} />
      ))}
      {wager.map((t) => (
        <TierBadge key={t} tier={t} />
      ))}
      <EvOptionList preview={PREFLOP_AA.preview} selected="check" onSelect={() => undefined} />
    </div>
  );
}

function Demo({ id }: { id: string }) {
  const s = SCENES[id]!;
  const orientation = useOrientation(viewPref);
  const [open, setOpen] = useState<OptionKey | null>(s.open ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [chip, setChip] = useState(1000);
  const events: GameEvent[] =
    s.street === 'preflop' && s.hole
      ? [{ type: 'player-dealt', cards: s.hole as [Card, Card] }, { type: 'dealer-dealt' }]
      : [];
  const tl = buildTimeline(events, speed);
  const motion = useSkippableMotion(id, tl.totalMs);
  const bets = { ante: 1000, blind: 1000, trips: 500, play: s.play ? 1000 * s.play : 0 };
  const result = s.result === 'fold' ? FOLDED_RESULT : s.result === 'win' ? WON_RESULT : null;
  const labels = {
    player: result ? handName(result.player) : undefined,
    dealer: result
      ? `${handName(result.dealer)}${result.dealerQualifies ? ', qualifies' : ''}`
      : undefined,
  };
  const sheet =
    open && s.preview ? (
      <EvSheet
        preview={s.preview}
        selected={open}
        variant={orientation === 'landscape' ? 'rail' : 'sheet'}
        onSelect={setOpen}
        onConfirm={(k) => {
          setToast(`Confirmed ${k}`);
          setOpen(null);
        }}
        onCancel={() => setOpen(null)}
        handsPerHour={30}
        whyOpen={q.get('why') === '1'}
      />
    ) : null;
  const confirmedToast = toast ?? (result ? describeResult(result) : null);
  return (
    <Table
      orientation={orientation}
      toasts={
        confirmedToast ? (
          <Toasts toasts={[{ id: 1, text: confirmedToast }]} onDismiss={() => setToast(null)} />
        ) : null
      }
      status={
        <StatusBar
          bankroll={49_000}
          onFelt={s.street === 'betting' || s.hole ? 2500 : 0}
          sessionNet={-1000}
        />
      }
      felt={
        <Felt
          orientation={orientation}
          hole={s.hole}
          dealerDealt={!!s.hole}
          dealer={s.dealer}
          dealerShown={s.dealerShown}
          board={s.board}
          bets={bets}
          playMultiple={s.play}
          fourColor={fourColor}
          labels={labels}
          timeline={tl}
          skipped={motion.skipped}
          onSkip={motion.playing ? motion.skip : undefined}
          onCircle={s.street === 'betting' ? () => undefined : undefined}
        />
      }
      actions={
        <>
          <ActionBar
            street={s.street}
            layout={orientation === 'landscape' ? 'rail' : 'bar'}
            preview={s.preview}
            selected={open}
            bets={{ ante: 1000, trips: 500 }}
            onOption={setOpen}
          />
          {result?.outcome === 'fold' ? <FoldReveal result={result} /> : null}
        </>
      }
      chips={s.street === 'betting' ? <ChipRack selected={chip} onSelect={setChip} /> : null}
      rail={
        orientation === 'landscape' && s.preview && !open ? (
          <EvOptionList
            preview={s.preview}
            compact
            allowed={s.preview.options.map((o) => optionKeyOf(o.action))}
          />
        ) : null
      }
      sheet={sheet}
    />
  );
}

function Index() {
  return (
    <main style="padding:16px">
      <h1>Table gallery</h1>
      <ul>
        {[...Object.keys(SCENES), 'chart', 'badges'].map((id) => (
          <li key={id}>
            <a href={`?scene=${id}`}>{id}</a> (<a href={`?scene=${id}&view=landscape`}>landscape</a>
            , <a href={`?scene=${id}&theme=dark`}>dark</a>)
          </li>
        ))}
      </ul>
      <p>Fixtures: {Object.keys(FIXTURES).join(', ')}</p>
    </main>
  );
}

function App() {
  if (scene === 'chart')
    return (
      <main style="padding:16px">
        <StrategyChart strategy="basic" view="preflop" highlight={['AA', 'K4o']} />
      </main>
    );
  if (scene === 'badges') return <Badges />;
  if (scene && SCENES[scene]) return <Demo id={scene} />;
  return <Index />;
}

render(<App />, document.getElementById('app')!);
