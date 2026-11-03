// The Simulator container: wires the SimDriver (engine + scene runner + EV previews) to the table-ui
// components, the step panel, the session panel and the auto-play panel (simulator.md 3.4, 4.3).
// State lives in hooks/: the driver and toasts, the EV sheet, the bet handlers and the preview bar.
import './sim.css';
import './container.css';
import { equity } from '../engine';
import type { SceneConfig } from '../scene';
import { ActionBar } from './ActionBar';
import { ChipRack } from './ChipRack';
import { CHIP_DENOMS } from './ChipStack';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { FoldReveal } from './FoldReveal';
import { HandHistory } from './HandHistory';
import { MoveLog } from './MoveLog';
import { SessionPanel } from './SessionPanel';
import { SimAutoPlay } from './SimAutoPlay';
import { SimTools } from './SimTools';
import { SixCardPanelLazy } from './SixCardPanelLazy';
import { StatusBar } from './StatusBar';
import { StepPanel } from './StepPanel';
import { Table, useOrientation } from './Table';
import { Toasts } from './Toasts';
import { buildTimeline, useSkippableMotion } from './animation';
import { useBetHandlers } from './hooks/useBetHandlers';
import { useEvSheet } from './hooks/useEvSheet';
import { useMoveLog } from './hooks/useMoveLog';
import { usePreviewBar } from './hooks/usePreviewBar';
import { useSandboxSync, useSimDriver } from './hooks/useSimDriver';
import { decodeMoveLog } from './moveLog';
import { decodeSnapshot } from './persist';
import { resolveEvShown, resolvePractice, resolveSpeed } from './settings';
import { autoOnlyOf, isDecisionStreet, resultLabels, splitHighlight } from './simView';
import type { SimulatorProps } from './types';
import { isRackRejection, rackShort } from './bankroll';
import type { Cents } from '../engine';

/** The sandbox also reports a chosen starting bankroll so the app can keep it as the default (I083). */
export type SimulatorViewProps = SimulatorProps & { onBankrollChange?: (cents: Cents) => void };

export function Simulator(props: SimulatorViewProps) {
  const mode: 'sandbox' | 'scene' =
    props.mode ?? (props.scene?.steps?.length ? 'scene' : 'sandbox');
  const sandbox = mode === 'sandbox';
  const baseScene: SceneConfig = props.scene ?? { id: 'sandbox', version: 1 };
  const sim = useSimDriver(props, mode);
  const { d, toast, setToast, act } = sim;

  const view = d.view;
  const { settings, evClient } = props;
  const { scene, step, state } = view;
  const orientation = useOrientation(scene.ui?.orientation ?? 'auto');
  const hand = state.hand;
  const street = state.street;
  const settled = street === 'settled';
  const decision = isDecisionStreet(street);
  const evShown = resolveEvShown(settings, scene, sandbox, step);
  // The app's settings are the source of truth for practice mode; the table follows them at once.
  const practice =
    sandbox && props.onPracticeChange ? resolvePractice(settings, baseScene) : view.practice;

  const ev = useEvSheet(sim, practice, orientation, evShown, decision);
  // I092: Details is the way into the EV sheet that does not act (EV shown before the move).
  const detailsOpen = decision && evShown && !practice && ev.open === null && !view.pendingStart;
  const bets = useBetHandlers(d, act, scene.ui?.defaultChip ?? 500);
  // The move log is the sandbox's (Play); a restored session brings its log back.
  const moveLog = useMoveLog(view, () =>
    sandbox && !baseScene.startAt && decodeSnapshot(props.snapshot, settings.paytable)
      ? decodeMoveLog((props.snapshot as { log?: unknown }).log)
      : [],
  );
  useSandboxSync(sim, sandbox, baseScene, settings, moveLog);

  const timeline = buildTimeline(view.lastEvents, resolveSpeed(settings, scene));
  const motion = useSkippableMotion(view.eventSeq, timeline.totalMs);
  const bar = usePreviewBar(view.preview, decision, evShown);

  const result = hand?.result ?? null;
  const dealerShown = settled || !!(step?.revealDealer ?? scene.revealDealer);
  const board = hand ? hand.deal.board.slice(0, hand.boardShown) : [];
  const onFelt = settled ? 0 : Object.values(state.bets).reduce((a, b) => a + b, 0);
  const eq = equity(state);
  const [circleHl, optionHl] = splitHighlight(step?.highlight ?? scene.highlight ?? []);

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

  const autoOnly = autoOnlyOf(scene);
  const showSession = scene.ui?.showSession ?? sandbox;
  // Off unless the scene asks (Play.tsx does); lessons stay focused on the hand being taught.
  const showHistory = !!scene.ui?.showHistory;
  const betting = street === 'betting' || settled;
  const table = (
    <Table
      orientation={orientation}
      toasts={
        toast || result?.outcome === 'fold' ? (
          <>
            {result?.outcome === 'fold' ? <FoldReveal result={result} /> : null}
            {toast ? <Toasts toasts={[toast]} onDismiss={() => setToast(null)} /> : null}
          </>
        ) : null
      }
      status={
        scene.ui?.showBankroll === false ? null : (
          <StatusBar
            bankroll={settled ? eq : state.bankroll}
            onFelt={onFelt}
            sessionNet={state.stats.hands ? view.session.net : undefined}
            hand={settled && result ? result : null}
            onDetails={detailsOpen ? ev.openDetails : undefined}
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
          labels={resultLabels(result, hand?.deal)}
          quiet={result?.outcome === 'fold'}
          timeline={timeline}
          nextHand={settled}
          skipped={motion.skipped}
          onSkip={motion.playing ? motion.skip : undefined}
          onCircle={bets.onCircle}
        />
      }
      actions={
        <ActionBar
          street={street}
          layout={orientation === 'landscape' ? 'rail' : 'bar'}
          preview={bar.showPreviewOnBar}
          hideEv={practice}
          evOff={!evShown}
          evStatus={bar.barStatus}
          selected={ev.open}
          allowed={view.allowedOptions}
          highlight={optionHl}
          bets={{ ante: state.bets.ante, trips: state.bets.trips }}
          canDeal={!view.dealLocked && state.bets.ante > 0}
          canClear={!view.clearLocked}
          disabled={(settled && view.dealLocked) || view.pendingStart}
          onOption={ev.onOption}
          onDeal={() => void act({ type: 'deal' })}
          onClear={bets.clearBets}
          onRebet={() => void act({ type: 'deal' })}
          onChangeBets={() => void act({ type: 'clear' })}
        />
      }
      chips={
        betting && scene.ui?.showChipRack !== false && !view.betsLocked ? (
          <ChipRack
            chips={scene.ui?.chips ?? CHIP_DENOMS}
            selected={bets.chip}
            onSelect={bets.setChip}
          />
        ) : null
      }
      rail={<>{stepPanel}</>}
      sheet={ev.sheet ? <EvSheet {...ev.sheet} /> : null}
    />
  );

  return (
    <div
      class={`sim-container${view.pendingStart ? ' is-pending' : ''}`}
      data-testid="simulator"
      data-street={street}
      data-hands={state.stats.hands}
      data-mode={mode}
      // 'pending' while the double-tap guard ignores taps, so "ready" means a tap will act.
      data-ev={ev.guarding && view.preview.status === 'ready' ? 'pending' : view.preview.status}
      data-equity={eq}
      style={
        orientation === 'landscape'
          ? '--sim-table-h: calc(100dvh - var(--chrome-h, 100px))'
          : undefined
      }
    >
      {orientation === 'portrait' || autoOnly ? stepPanel : null}
      {autoOnly ? null : table}
      {sandbox && scene.ui?.showSettings ? (
        <SimTools
          d={d}
          practice={practice}
          onPracticeChange={props.onPracticeChange}
          bankroll={scene.bankroll ?? 50_000}
          onBankrollChange={props.onBankrollChange}
          short={
            rackShort(street, state.bankroll, state.bets.ante, state.bets.trips) ||
            isRackRejection(view.rejection?.text)
          }
        />
      ) : null}
      {sandbox && scene.ui?.showSettings ? <SixCardPanelLazy d={d} /> : null}
      {showSession ? <SessionPanel session={view.session} onTap={() => d.tap('session')} /> : null}
      {showHistory ? (
        <HandHistory records={view.history} rules={state.rules} replayHref={props.replayHref} />
      ) : null}
      {sandbox ? <MoveLog hands={moveLog} evMode={settings.evMode} /> : null}
      <SimAutoPlay d={d} scene={scene} sandbox={sandbox} settings={settings} evClient={evClient} />
    </div>
  );
}
