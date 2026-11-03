import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Simulator } from '../../sim';
import type { EvClient, SceneConfig, SimulatorEvent } from '../../sim';
import { useStore } from '../context';
import { getEvClient } from '../evClient';
import { simSettings } from '../theme';

/**
 * Renders <Simulator scene onEvent>. Guided steps are owned by the sim scene runner; this only
 * persists progress from step-completed / scene-completed events. The table (real step panel, felt
 * and action bar) is mounted at once so its height never changes while the reader scrolls (I038);
 * only the EV worker is deferred: previews start once the scene is scrolled near the viewport
 * (long lessons stay fast on phones).
 */
export function LessonScene(props: { lessonId: string; scene: SceneConfig }) {
  const store = useStore();
  const { lessonId, scene } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // The simulator's only expensive dependency is the EV client; hold its requests until visible.
  const liveRef = useRef<{ live: boolean; wake: (() => void)[] }>({ live: false, wake: [] });
  liveRef.current.live = visible;
  if (visible) {
    const w = liveRef.current.wake.splice(0);
    for (const f of w) f();
  }
  const evClient = useMemo<EvClient>(() => {
    const st = liveRef.current;
    return {
      get mode() {
        return getEvClient().mode;
      },
      dispose: () => {},
      run: (kind, req, opts) =>
        st.live
          ? getEvClient().run(kind, req, opts)
          : new Promise<void>((resolve) => st.wake.push(resolve)).then(() =>
              getEvClient().run(kind, req, opts),
            ),
    };
  }, []);

  const done = store.lesson(lessonId)?.scenes[scene.id]?.completed === true;
  const onEvent = (e: SimulatorEvent) => {
    if (e.type === 'step-completed') {
      const idx = scene.steps?.findIndex((s) => s.id === e.stepId) ?? -1;
      store.markSceneStep(lessonId, scene.id, idx + 1);
    } else if (e.type === 'scene-completed') store.markSceneComplete(lessonId, scene.id);
  };
  return (
    <section class="scene card" aria-label={scene.title ?? 'Practice table'}>
      <header class="scene-head">
        <h3>{scene.title ?? 'Try it'}</h3>
        {done && <span class="badge tier-good">Done</span>}
      </header>
      <div ref={ref} class="scene-body" data-live={visible ? 'true' : 'false'}>
        <Simulator
          scene={scene}
          mode="scene"
          settings={simSettings(store.settings)}
          evClient={evClient}
          onEvent={onEvent}
        />
      </div>
    </section>
  );
}
