// The Simulator container: wires the SimDriver (engine + scene runner + EV previews) to the table-ui
// components, the step panel, the session panel and the auto-play panel (simulator.md 3.4, 4.3).
// State lives in hooks/: the driver and toasts, the EV sheet, the bet handlers and the preview bar.
import './sim.css';
import './container.css';
import type { SceneConfig } from '../scene';
import { ActionBar } from './ActionBar';
import { ChipRack } from './ChipRack';
import { CHIP_DENOMS } from './ChipStack';
import { EvSheet } from './EvSheet';
import { Felt } from './Felt';
import { FoldReveal } from './FoldReveal';
import { SessionPanel } from './SessionPanel';
import { SimAutoPlay } from './SimAutoPlay';
import { SimTools } from './SimTools';
import { StatusBar } from './StatusBar';
import { StepPanel } from './StepPanel';
import { Table, useOrientation } from './Table';
import { Toasts } from './Toasts';
import { buildTimeline, useSkippableMotion } from './animation';
import { useBetHandlers } from './hooks/useBetHandlers';
import { useEvSheet } from './hooks/useEvSheet';
import { usePreviewBar } from './hooks/usePreviewBar';
import { useSandboxSync, useSimDriver } from './hooks/useSimDriver';
import { resolvePractice, resolveSpeed } from './settings';
import { tableView } from './tableView';
import type { SimulatorProps } from './types';

export function Simulator(props: SimulatorProps) {
  const mode: 'sandbox' | 'scene' =
    props.mode ?? (props.scene?.steps?.length ? 'scene' : 'sandbox');
  const sandbox = mode === 'sandbox';
  const baseScene: SceneConfig = props.scene ?? { id: 'sandbox', version: 1 };
  const sim = useSimDriver(props, mode);
  const { d, toast, setToast, act } = sim;

  const view = d.view;
  const { settings, evClient } = props;
  const scene = view.scene;
  const step = view.step;
  const orientation = useOrientation(scene.ui?.orientation ?? 'auto');
  const speed = resolveSpeed(settings, scene);
  const state = view.state;
  const hand = state.hand;
  const street = state.street;
  const settled = street === 'settled';
  // The app's settings are the source of truth for practice mode; the table follows them at once.
  const practice =
    sandbox && props.onPracticeChange ? resolvePractice(settings, baseScene) : view.practice;
  const pv = view.preview;

  const ev = useEvSheet(sim, { settings, sandbox, practice, orientation });
  const bets = useBetHandlers(d, act, scene.ui?.defaultChip ?? 500);

  useSandboxSync(sim, sandbox, baseScene, settings);

  const timeline = buildTimeline(view.lastEvents, speed);
  const motion = useSkippableMotion(view.eventSeq, timeline.totalMs);
  const { showPreviewOnBar, barStatus } = usePreviewBar(view);

  const { result, dealerShown, labels, board, onFelt, eq, circleHl, optionHl } = tableView(view);

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

  const ap = scene.autoPlay;
  const autoOnly =
    !!ap?.enabled && scene.allowedActions?.length === 0 && !scene.deals && !scene.startAt;
  const showSession = scene.ui?.showSession ?? sandbox;
  const betting = street === 'betting' || settled;
  const bank = scene.bankroll ?? 50_000;
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
          onCircle={bets.onCircle}
        />
      }
      actions={
        <>
          <ActionBar
            street={street}
            layout={orientation === 'landscape' ? 'rail' : 'bar'}
            preview={showPreviewOnBar}
            hideEv={practice}
            evStatus={barStatus}
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
          {result?.outcome === 'fold' ? <FoldReveal result={result} /> : null}
        </>
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
      data-ev={pv.status}
      data-equity={eq}
      style={orientation === 'landscape' ? '--sim-table-h: calc(100dvh - 100px)' : undefined}
    >
      {orientation === 'portrait' || autoOnly ? stepPanel : null}
      {autoOnly ? null : table}
      {sandbox && scene.ui?.showSettings ? (
        <SimTools
          practice={practice}
          onPractice={(on) =>
            props.onPracticeChange ? props.onPracticeChange(on) : d.setPractice(on)
          }
          bankroll={bank}
          onNewSession={() => d.newSession(bank)}
        />
      ) : null}
      {showSession ? <SessionPanel session={view.session} onTap={() => d.tap('session')} /> : null}
      <SimAutoPlay d={d} scene={scene} sandbox={sandbox} settings={settings} evClient={evClient} />
    </div>
  );
}
