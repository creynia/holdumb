// Dev-only gallery of the table UI, driven by the REAL engine and the REAL EV module (in-thread client).
// Run `npm run dev` and open /src/sim/ui/gallery.html
//   ?scene=betting|preflop|flop|river|river-fold|fold|win|blunder|chart|badges
//   &view=portrait|landscape   &theme=dark|light   &four=1   &speed=normal|fast|instant   &why=1
import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { applyAction, createGame, equity } from '../engine';
import type { Action, CreateGameOptions, GameEvent, GameState, HandResult } from '../engine';
import { createEvClient } from '../worker';
import type { DecisionPreview } from '../math';
import { decisionTier, wagerTier } from '../math';
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
import { actionOfKey, describeResult, handName, optionKeyOf } from './text';

const q = new URLSearchParams(location.search);
if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme')!;
const scene = q.get('scene');
const fourColor = q.get('four') === '1';
const speed = effectiveSpeed((q.get('speed') as Speed | null) ?? 'normal');
const viewPref = (q.get('view') as 'portrait' | 'landscape' | null) ?? 'auto';

const client = createEvClient({ mode: 'inthread' });
const ANTE = 1000;
const START: Record<string, CreateGameOptions> = {
  betting: { seed: 7, bets: { ante: ANTE, trips: 500 } },
  preflop: {
    seed: 7,
    bets: { ante: ANTE, trips: 500 },
    startAt: { street: 'preflop', deal: { player: ['As', 'Ah'], dealer: ['Td', 'Ts'] } },
  },
  blunder: {
    seed: 7,
    bets: { ante: ANTE },
    startAt: { street: 'preflop', deal: { player: ['As', 'Ah'], dealer: ['Td', 'Ts'] } },
  },
  flop: {
    seed: 7,
    bets: { ante: ANTE },
    startAt: {
      street: 'flop',
      deal: { player: ['Ah', '7c'], dealer: ['Td', 'Ts'], flop: ['7d', 'Ks', '2c'] },
    },
  },
  river: {
    seed: 7,
    bets: { ante: ANTE, trips: 500 },
    startAt: {
      street: 'river',
      deal: {
        player: ['As', '7c'],
        dealer: ['Td', 'Ts'],
        flop: ['Kd', '9h', '5c'],
        turn: '3s',
        river: '2d',
      },
    },
  },
  'river-fold': {
    seed: 7,
    bets: { ante: ANTE },
    startAt: {
      street: 'river',
      deal: {
        player: ['3c', '4d'],
        dealer: ['Td', 'Ts'],
        flop: ['Ah', 'Ks', 'Qd'],
        turn: '9c',
        river: '7h',
      },
    },
  },
};
START.fold = START.river!;
START.win = START.river!;
const OPEN: Record<string, OptionKey | undefined> = {
  river: 'play-1',
  'river-fold': 'play-1',
  blunder: 'check',
};
/** Scenes that apply one action first, so the settled table shows. */
const THEN: Record<string, Action | undefined> = {
  fold: { type: 'fold' },
  win: { type: 'play', multiple: 1 },
};

function initial(id: string): { state: GameState; events: GameEvent[]; start: GameState } {
  const start = createGame(START[id]);
  let state = start;
  let events: GameEvent[] = [];
  const then = THEN[id];
  if (then) {
    const r = applyAction(state, then);
    if (r.ok) {
      state = r.state;
      events = r.events;
    }
  }
  return { state, events, start };
}

function Badges() {
  const decision = ['best', 'close', 'small', 'costly', 'blunder'] as const;
  const wager = ['free', 'good', 'fair', 'poor', 'avoid'] as const;
  // Real tier functions: the 8-6-5 Trips edge and a 0.5 ante regret.
  const real = [decisionTier({ num: 1n, den: 2n }), wagerTier({ num: 48987n, den: 2572780n })];
  return (
    <div style="padding:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start">
      {decision.map((t) => (
        <TierBadge key={t} tier={t} />
      ))}
      {wager.map((t) => (
        <TierBadge key={t} tier={t} />
      ))}
      <p>Real tiers: {real.join(', ')}</p>
    </div>
  );
}

function Demo({ id }: { id: string }) {
  const init = useMemo(() => initial(id), [id]);
  const [state, setState] = useState(init.state);
  // Session net = equity now minus equity at the start (D38).
  const startEquity = useMemo(() => equity(init.start), [init]);
  const [events, setEvents] = useState<GameEvent[]>(init.events);
  const [runKey, setRunKey] = useState(0);
  const orientation = useOrientation(viewPref);
  const [open, setOpen] = useState<OptionKey | null>(OPEN[id] ?? null);
  const [preview, setPreview] = useState<DecisionPreview | null>(null);
  const [progress, setProgress] = useState(0);
  const [evError, setEvError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chip, setChip] = useState(1000);
  const hand = state.hand;
  const decision =
    state.street === 'preflop' || state.street === 'flop' || state.street === 'river';
  const board = hand ? hand.deal.board.slice(0, hand.boardShown) : [];
  const abort = useRef<AbortController | null>(null);

  // Real EV: the in-thread client runs the preview job for this decision.
  useEffect(() => {
    setPreview(null);
    setEvError(false);
    setProgress(0);
    if (!hand || !decision) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    client
      .run(
        'preview',
        {
          street: state.street as 'preflop' | 'flop' | 'river',
          hole: hand.deal.player,
          board,
          blindPaytable: state.rules.blindPaytable,
          ante: state.bets.ante,
        },
        { signal: ac.signal, onProgress: (p) => setProgress(p.done / Math.max(1, p.total)) },
      )
      .then((p) => setPreview(p))
      .catch((e: unknown) => {
        if (!(e instanceof Error && e.name === 'AbortError')) setEvError(true);
      });
    return () => ac.abort();
  }, [state.street, hand?.n]);

  const tl = buildTimeline(events, speed);
  const motion = useSkippableMotion(`${id}-${runKey}`, tl.totalMs);
  const result: HandResult | null = hand?.result ?? null;
  const labels = {
    player: result ? handName(result.player) : undefined,
    dealer: result
      ? `${handName(result.dealer)}${result.dealerQualifies ? ', qualifies' : ''}`
      : undefined,
  };
  const act = (a: Action) => {
    const r = applyAction(state, a);
    if (!r.ok) return setToast(r.error.message);
    setState(r.state);
    setEvents(r.events);
    setRunKey((k) => k + 1);
    setOpen(null);
    const settled = r.events.find((e) => e.type === 'hand-settled');
    if (settled && settled.type === 'hand-settled') setToast(describeResult(settled.result));
  };
  const sheet =
    open && decision ? (
      <EvSheet
        preview={preview}
        error={evError}
        progress={progress}
        selected={open}
        variant={orientation === 'landscape' ? 'rail' : 'sheet'}
        onSelect={setOpen}
        onConfirm={(k) => act(actionOfKey(k))}
        onCancel={() => setOpen(null)}
        handsPerHour={30}
        whyOpen={q.get('why') === '1'}
      />
    ) : null;
  // D38: once settled, show equity(), not bankroll plus felt.
  const settled = state.street === 'settled';
  const onFelt = settled ? 0 : Object.values(state.bets).reduce((a, b) => a + b, 0);
  const playBet = state.bets.play;
  return (
    <Table
      orientation={orientation}
      toasts={
        toast ? <Toasts toasts={[{ id: 1, text: toast }]} onDismiss={() => setToast(null)} /> : null
      }
      status={
        <StatusBar
          bankroll={settled ? equity(state) : state.bankroll}
          onFelt={onFelt}
          sessionNet={state.stats.hands ? equity(state) - startEquity : undefined}
        />
      }
      felt={
        <Felt
          orientation={orientation}
          hole={hand?.deal.player ?? null}
          dealerDealt={!!hand}
          dealer={hand?.deal.dealer}
          dealerShown={state.street === 'settled'}
          board={board}
          bets={state.bets}
          playMultiple={
            hand?.play?.multiple ?? (playBet > 0 ? playBet / Math.max(1, state.bets.ante) : null)
          }
          fourColor={fourColor}
          labels={labels}
          timeline={tl}
          nextHand={settled}
          skipped={motion.skipped}
          onSkip={motion.playing ? motion.skip : undefined}
          onCircle={state.street === 'betting' ? () => undefined : undefined}
        />
      }
      actions={
        <>
          <ActionBar
            street={state.street}
            layout={orientation === 'landscape' ? 'rail' : 'bar'}
            preview={preview}
            evStatus={evError ? 'error' : preview ? 'ready' : decision ? 'pending' : undefined}
            selected={open}
            bets={{ ante: state.bets.ante, trips: state.bets.trips }}
            onOption={setOpen}
            onDeal={() => act({ type: 'deal' })}
            onClear={() => act({ type: 'clear' })}
            onRebet={() => act({ type: 'deal' })}
            onChangeBets={() => act({ type: 'clear' })}
          />
          {result?.outcome === 'fold' ? <FoldReveal result={result} /> : null}
        </>
      }
      chips={state.street === 'betting' ? <ChipRack selected={chip} onSelect={setChip} /> : null}
      rail={
        orientation === 'landscape' && preview && !open ? (
          <EvOptionList
            preview={preview}
            compact
            allowed={preview.options.map((o) => optionKeyOf(o.action))}
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
        {[...Object.keys(START), 'chart', 'badges'].map((id) => (
          <li key={id}>
            <a href={`?scene=${id}`}>{id}</a> (<a href={`?scene=${id}&view=landscape`}>landscape</a>
            , <a href={`?scene=${id}&theme=dark`}>dark</a>)
          </li>
        ))}
      </ul>
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
  if (scene && (START[scene] || scene === 'fold')) return <Demo id={scene} />;
  return <Index />;
}

render(<App />, document.getElementById('app')!);
