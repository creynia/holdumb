// The Simulator container: wires the SimDriver (engine + scene runner + EV previews) to the table-ui
// components, the step panel, the session panel and the auto-play panel (simulator.md 3.4, 4.3).
import './sim.css';
import './container.css';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { equity, formatMoney, maxAnte } from '../engine';
import type { Cents, HandResult } from '../engine';
import { SimDriver } from '../scene';
import type { CircleId, DriverEvent, OptionKey, SceneConfig } from '../scene';
import { ActionBar } from './ActionBar';
import { AutoPlayPanel } from './AutoPlayPanel';
import { ChipRack } from './ChipRack';
import { CHIP_DENOMS } from './ChipStack';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { FoldReveal } from './FoldReveal';
import { SessionPanel } from './SessionPanel';
import { StatusBar } from './StatusBar';
import { StepPanel } from './StepPanel';
import { Table, useOrientation } from './Table';
import { Toasts } from './Toasts';
import { buildTimeline, useSkippableMotion } from './animation';
import { decodeSnapshot, encodeSnapshot } from './persist';
import { randomSeed, resolvePractice, resolveSpeed } from './settings';
import { actionOfKey, describeResult, handName, headline, optionKeyOf } from './text';
import type { SimulatorProps } from './types';
import type { DecisionPreview } from '../math';
import type { StrategyId } from '../strategy';

const isDecisionStreet = (s: string): boolean => s === 'preflop' || s === 'flop' || s === 'river';

interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'good' | 'bad';
}

function makeDriver(
  props: SimulatorProps,
  mode: 'sandbox' | 'scene',
  onEvent: (e: DriverEvent) => void,
): SimDriver {
  const { settings, evClient } = props;
  let scene: SceneConfig = props.scene ?? { id: 'sandbox', version: 1 };
  const sandbox = mode === 'sandbox';
  let practice = resolvePractice(settings, scene);
  let restore: ConstructorParameters<typeof SimDriver>[0]['restore'];
  if (sandbox && props.snapshot !== undefined && !scene.startAt) {
    const dec = decodeSnapshot(props.snapshot, settings.paytable);
    if (dec) {
      restore = dec.restore;
      practice = dec.practice;
    }
  }
  if (sandbox && !restore && !scene.bets && !scene.startAt) {
    const bank = scene.bankroll ?? 50_000;
    const ante = Math.min(settings.anteUnitCents, Math.floor(bank / 2 / 100) * 100);
    if (ante >= 500) scene = { ...scene, bets: { ante } };
  }
  return new SimDriver({
    scene,
    mode,
    seed: sandbox ? randomSeed() : 1,
    paytable: settings.paytable,
    practice,
    speculate: true,
    restore,
    onEvent,
    preview: (req, o) => evClient.run('preview', req, o),
  });
}

export function Simulator(props: SimulatorProps) {
  const mode: 'sandbox' | 'scene' =
    props.mode ?? (props.scene?.steps?.length ? 'scene' : 'sandbox');
  const sandbox = mode === 'sandbox';
  const baseScene: SceneConfig = props.scene ?? { id: 'sandbox', version: 1 };
  const latest = useRef(props);
  latest.current = props;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastId = useRef(0);
  const pushToast = (text: string, tone?: Toast['tone']): void =>
    setToast({ id: ++toastId.current, text, tone });

  const holder = useRef<SimDriver | null>(null);
  if (!holder.current) {
    holder.current = makeDriver(props, mode, (e) => {
      if (e.type === 'hand-settled')
        pushToast(describeResult(e.result), e.result.net > 0 ? 'good' : undefined);
      else if (e.type === 'action-confirmed' && e.action.type === 'deal') setToast(null);
      else if (e.type === 'action-rejected' && !holder.current?.view.step)
        pushToast(e.reason, 'bad');
      latest.current.onEvent?.(e);
    });
  }
  const d = holder.current;
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = d.subscribe(() => force(0));
    force(0);
    latest.current.onEvent?.({ type: 'ready' });
    return () => {
      off();
      d.dispose();
    };
  }, [d]);

  const view = d.view;
  const { settings, evClient } = props;
  const scene = view.scene;
  const step = view.step;
  const orientation = useOrientation(scene.ui?.orientation ?? 'auto');
  const speed = resolveSpeed(settings, scene);
  const state = view.state;
  const hand = state.hand;
  const street = state.street;
  const decision = isDecisionStreet(street);
  const settled = street === 'settled';
  const evShown = (step?.showEV ?? scene.showEV) !== false;
  const practice = view.practice;
  const pv = view.preview;

  const [open, setOpen] = useState<OptionKey | null>(null);
  const [reveal, setReveal] = useState<{ preview: DecisionPreview; chosen: OptionKey } | null>(
    null,
  );
  const [chip, setChip] = useState<Cents>(scene.ui?.defaultChip ?? 500);
  const handKey = `${hand?.n ?? 0}:${street}`;
  const lastKey = useRef(handKey);
  useEffect(() => {
    if (lastKey.current !== handKey) {
      lastKey.current = handKey;
      if (!reveal) setOpen(null);
    }
  }, [handKey, reveal]);

  // Sandbox persistence (PersistedV1.sandbox, owned by the app store).
  const persistable = sandbox && !baseScene.startAt && !!props.onSnapshot;
  useEffect(() => {
    if (persistable) latest.current.onSnapshot?.(encodeSnapshot(d));
  }, [view.eventSeq, view.practice, persistable, d]);

  const timeline = buildTimeline(view.lastEvents, speed);
  const motion = useSkippableMotion(view.eventSeq, timeline.totalMs);

  const result: HandResult | null = hand?.result ?? null;
  const dealerShown = settled || !!(step?.revealDealer ?? scene.revealDealer);
  const labels = {
    player: result ? handName(result.player) : undefined,
    dealer: result
      ? `${handName(result.dealer)}${result.dealerQualifies ? ', qualifies' : ''}`
      : undefined,
  };
  const board = hand ? hand.deal.board.slice(0, hand.boardShown) : [];
  const onFelt = settled ? 0 : Object.values(state.bets).reduce((a, b) => a + b, 0);
  const eq = equity(state);
  const highlight = (step?.highlight ?? scene.highlight ?? []) as readonly string[];
  const circleHl = highlight.filter((h): h is CircleId =>
    ['ante', 'blind', 'play', 'trips'].includes(h),
  );
  const optionHl = highlight.filter(
    (h): h is OptionKey => h === 'check' || h === 'fold' || h.startsWith('play-'),
  );

  // ---------- handlers ----------
  const act = async (a: Parameters<SimDriver['act']>[0]) => {
    const r = await d.act(a);
    if (!r.ok && !d.view.step) pushToast(r.message, 'bad');
    return r;
  };
  const confirm = async (k: OptionKey) => {
    const before = d.view.preview.value;
    const r = await d.act(actionOfKey(k));
    if (practice && before) setReveal({ preview: before, chosen: k });
    else setOpen(null);
    if (!r.ok && !d.view.step) pushToast(r.message, 'bad');
  };
  const onOption = (k: OptionKey) => {
    if (!evShown || (sandbox && settings.skipPreview && !practice)) {
      const v = d.view.preview.value;
      const o = v?.options.find((x) => optionKeyOf(x.action) === k);
      if (o?.tier === 'blunder' && settings.confirmCostlyMoves && evShown) {
        setOpen(k);
        d.previewed(k, false);
        return;
      }
      if (v && o && evShown) pushToast(headline(v, v.options.indexOf(o)));
      void act(actionOfKey(k));
      return;
    }
    setOpen(k);
    d.previewed(k, false);
  };
  const onCircle = (id: CircleId) => {
    d.tap(id);
    if ((id !== 'ante' && id !== 'trips') || (street !== 'betting' && !settled)) return;
    const cur = state.bets[id];
    const cap = id === 'ante' ? maxAnte(state) : state.rules.tripsMax;
    const amount = Math.min(cur + chip, cap);
    if (amount === cur || amount <= 0) return;
    void act({ type: 'set-bet', wager: id, amount });
  };
  const clearBets = () => {
    if (settled) return void act({ type: 'clear' });
    void (async () => {
      if (state.bets.trips > 0) await act({ type: 'set-bet', wager: 'trips', amount: 0 });
      await act({ type: 'set-bet', wager: 'ante', amount: state.rules.anteMin });
    })();
  };

  const stepPanel = step ? (
    <StepPanel
      step={step}
      index={view.rt.stepIndex}
      count={view.stepCount}
      rejection={view.rejection}
      showNext={view.showNext}
      onNext={() => d.acknowledge()}
      pendingStart={view.pendingStart}
      onNextHand={() => d.nextHand()}
    />
  ) : null;

  const showPreviewOnBar = evShown && !practice && pv.status === 'ready' ? pv.value : null;
  const barStatus =
    !decision || !evShown || practice
      ? undefined
      : pv.status === 'idle'
        ? undefined
        : pv.status === 'ready'
          ? 'ready'
          : pv.status;

  const sheetKey = reveal?.chosen ?? open;
  const sheet =
    sheetKey && (reveal || (open && decision)) ? (
      <EvSheet
        preview={reveal ? reveal.preview : pv.value}
        error={!reveal && pv.status === 'error'}
        progress={pv.progress}
        selected={sheetKey}
        variant={orientation === 'landscape' ? 'rail' : 'sheet'}
        onSelect={(k) => {
          setOpen(k);
          d.previewed(k, false);
        }}
        onConfirm={(k) => void confirm(k)}
        onCancel={() => {
          setOpen(null);
          setReveal(null);
        }}
        confirmCostlyMoves={settings.confirmCostlyMoves}
        hideEv={practice}
        chosen={reveal?.chosen ?? null}
        onContinue={() => {
          setReveal(null);
          setOpen(null);
        }}
        detail={scene.evDetail ?? 'full'}
        whyOpen={scene.whyOpen}
        onWhyToggle={(o) => {
          if (o && sheetKey) d.previewed(sheetKey, true);
        }}
        handsPerHour={settings.handsPerHour}
        allowed={view.allowedOptions}
      />
    ) : null;

  const ap = scene.autoPlay;
  const autoOnly =
    !!ap?.enabled && scene.allowedActions?.length === 0 && !scene.deals && !scene.startAt;
  const autoPanel =
    ap?.enabled || (sandbox && scene.ui?.showSettings) ? (
      <AutoPlayPanel
        evClient={evClient}
        settings={settings}
        defaultStrategy={ap?.defaultStrategy}
        compare={ap?.compare}
        handOptions={ap?.handOptions}
        sessionOptions={ap?.sessions}
        onEvent={(e) => {
          if (e.type === 'auto-play-completed')
            d.autoPlayCompleted(e.hands, e.strategy as StrategyId);
        }}
      />
    ) : null;

  const showSession = scene.ui?.showSession ?? sandbox;
  const betting = street === 'betting' || settled;
  const table = (
    <Table
      orientation={orientation}
      toasts={toast ? <Toasts toasts={[toast]} onDismiss={() => setToast(null)} /> : null}
      status={
        scene.ui?.showBankroll === false ? null : (
          <StatusBar
            bankroll={settled ? eq : state.bankroll}
            onFelt={onFelt}
            sessionNet={state.stats.hands ? eq - view.startEquity : undefined}
          />
        )
      }
      felt={
        <Felt
          orientation={orientation}
          hole={hand && street !== 'betting' ? hand.deal.player : null}
          dealerDealt={!!hand && street !== 'betting'}
          dealer={hand?.deal.dealer}
          dealerShown={dealerShown && !!hand}
          board={board}
          bets={state.bets}
          playMultiple={hand?.play?.multiple ?? null}
          fourColor={settings.fourColorDeck}
          highlight={circleHl}
          labels={labels}
          timeline={timeline}
          nextHand={settled}
          skipped={motion.skipped}
          onSkip={motion.playing ? motion.skip : undefined}
          onCircle={onCircle}
        />
      }
      actions={
        <>
          <ActionBar
            street={street}
            layout={orientation === 'landscape' ? 'rail' : 'bar'}
            preview={showPreviewOnBar}
            evStatus={barStatus}
            selected={open}
            allowed={view.allowedOptions}
            highlight={optionHl}
            bets={{ ante: state.bets.ante, trips: state.bets.trips }}
            canDeal={!view.dealLocked && state.bets.ante > 0}
            disabled={(settled && view.dealLocked) || view.pendingStart}
            onOption={onOption}
            onDeal={() => void act({ type: 'deal' })}
            onClear={clearBets}
            onRebet={() => void act({ type: 'deal' })}
            onChangeBets={() => void act({ type: 'clear' })}
          />
          {result?.outcome === 'fold' ? <FoldReveal result={result} /> : null}
        </>
      }
      chips={
        betting && scene.ui?.showChipRack !== false && !view.betsLocked ? (
          <ChipRack chips={scene.ui?.chips ?? CHIP_DENOMS} selected={chip} onSelect={setChip} />
        ) : null
      }
      rail={<>{stepPanel}</>}
      sheet={sheet}
    />
  );

  return (
    <div
      class={`sim-container${view.pendingStart ? ' is-pending' : ''}`}
      data-testid="simulator"
      data-street={street}
      data-hands={state.stats.hands}
      data-mode={mode}
      data-ev={pv.status}
      data-equity={eq}
      style={orientation === 'landscape' ? '--sim-table-h: calc(100dvh - 100px)' : undefined}
    >
      {orientation === 'portrait' ? stepPanel : null}
      {autoOnly ? null : table}
      {sandbox && scene.ui?.showSettings ? (
        <div class="sim-tools">
          <label>
            <input
              type="checkbox"
              checked={practice}
              onChange={(e) => d.setPractice(e.currentTarget.checked)}
              data-testid="practice-toggle"
            />
            Practice mode (hide EV until I confirm)
          </label>
          <button
            type="button"
            class="sim-btn sim-btn-secondary"
            onClick={() => d.newSession(scene.bankroll ?? 50_000)}
          >
            New session ({formatMoney(scene.bankroll ?? 50_000)})
          </button>
        </div>
      ) : null}
      {showSession ? <SessionPanel session={view.session} onTap={() => d.tap('session')} /> : null}
      {sandbox && autoPanel ? (
        <details class="sim-autoplay" open={!!ap?.defaultStrategy}>
          <summary>Auto-play</summary>
          {autoPanel}
        </details>
      ) : (
        autoPanel
      )}
    </div>
  );
}
