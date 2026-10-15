import {
  MAX_RECENT_MISSES,
  createStorage,
  decodeImport,
  defaultPersisted,
  emptyDrill,
  encodeExport,
  load,
  save,
  type DrillStats,
  type DrillStreet,
  type LessonProgress,
  type PersistedV1,
  type Settings,
  type StorageLike,
} from './storage';
import type { ContentBundle } from '../content/types';

export type LessonStatus = 'new' | 'progress' | 'done';

const emptyLesson = (): LessonProgress => ({ quizzes: {}, scenes: {} });

export class Store {
  private data: PersistedV1;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** consecutive correct Drill answers this visit (not persisted; the best is) */
  private streak = 0;
  /** false when progress cannot be saved (localStorage unavailable) */
  readonly persistent: boolean;

  constructor(
    storage?: StorageLike,
    private debounceMs = 300,
  ) {
    if (storage) {
      this.storage = storage;
      this.persistent = true;
    } else {
      const h = createStorage();
      this.storage = h.storage;
      this.persistent = h.persistent;
    }
    this.data = load(this.storage);
  }
  private storage: StorageLike;

  get snapshot(): PersistedV1 {
    return this.data;
  }
  get settings(): Settings {
    return this.data.settings;
  }
  get drill(): DrillStats {
    return this.data.drill;
  }
  get drillStreak(): number {
    return this.streak;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private commit(next: PersistedV1) {
    this.data = next; // new object identity on every change
    this.listeners.forEach((l) => l());
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /** Write to storage now. */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    save(this.storage, this.data);
  }

  private patchLesson(id: string, fn: (p: LessonProgress) => LessonProgress) {
    const cur = this.lesson(id) ?? emptyLesson();
    this.commit({ ...this.data, lessons: { ...this.data.lessons, [id]: fn(cur) } });
  }

  lesson(id: string): LessonProgress | undefined {
    return Object.hasOwn(this.data.lessons, id) ? this.data.lessons[id] : undefined;
  }

  /** Clear a lesson's quiz results (keeps completedAt and scene progress), e.g. to retake an exam. */
  resetLesson(id: string) {
    if (!Object.hasOwn(this.data.lessons, id)) return;
    this.patchLesson(id, (l) => ({ ...l, quizzes: {} }));
  }

  status(id: string): LessonStatus {
    const p = this.lesson(id);
    if (!p) return 'new';
    if (p.completedAt) return 'done';
    if (p.startedAt || Object.keys(p.quizzes).length || Object.keys(p.scenes).length)
      return 'progress';
    return 'new';
  }

  /** Called when a lesson is opened. */
  start(id: string, now = Date.now()) {
    if (this.lesson(id)?.startedAt) return;
    this.patchLesson(id, (l) => ({ ...l, startedAt: now }));
  }

  markQuiz(lessonId: string, quizId: string, correct: boolean) {
    this.patchLesson(lessonId, (l) => {
      const prev = l.quizzes[quizId];
      return {
        ...l,
        startedAt: l.startedAt ?? Date.now(),
        quizzes: {
          ...l.quizzes,
          [quizId]: {
            correct: (prev?.correct ?? false) || correct,
            attempts: (prev?.attempts ?? 0) + 1,
            firstTry: prev ? (prev.firstTry ?? (prev.attempts === 1 && prev.correct)) : correct,
          },
        },
      };
    });
  }

  markSceneStep(lessonId: string, sceneId: string, step: number) {
    this.patchLesson(lessonId, (l) => {
      const prev = l.scenes[sceneId];
      return {
        ...l,
        scenes: {
          ...l.scenes,
          [sceneId]: { completed: prev?.completed ?? false, step: Math.max(prev?.step ?? 0, step) },
        },
      };
    });
  }

  markSceneComplete(lessonId: string, sceneId: string) {
    this.patchLesson(lessonId, (l) => ({
      ...l,
      scenes: { ...l.scenes, [sceneId]: { step: l.scenes[sceneId]?.step ?? 0, completed: true } },
    }));
  }

  completeLesson(id: string, done = true, now = Date.now()) {
    this.patchLesson(id, (l) => {
      const { completedAt: _drop, ...rest } = l;
      return done ? { ...rest, startedAt: l.startedAt ?? now, completedAt: now } : rest;
    });
  }

  /** Drill: record one graded answer (correct = tier best or close, D33). */
  recordDrill(street: DrillStreet, correct: boolean, spotCode?: string) {
    this.streak = correct ? this.streak + 1 : 0;
    const d = this.data.drill;
    const cur = d.byStreet[street];
    const misses = spotCode
      ? correct
        ? d.recentMisses.filter((c) => c !== spotCode)
        : [spotCode, ...d.recentMisses.filter((c) => c !== spotCode)].slice(0, MAX_RECENT_MISSES)
      : d.recentMisses;
    this.commit({
      ...this.data,
      drill: {
        bestStreak: Math.max(d.bestStreak, this.streak),
        byStreet: {
          ...d.byStreet,
          [street]: { answered: cur.answered + 1, correct: cur.correct + (correct ? 1 : 0) },
        },
        recentMisses: misses,
      },
    });
  }

  resetDrill() {
    this.streak = 0;
    this.commit({ ...this.data, drill: emptyDrill() });
  }

  updateSettings(patch: Partial<Settings>) {
    this.commit({ ...this.data, settings: { ...this.data.settings, ...patch } });
  }

  exportCode(): string {
    return encodeExport(this.data);
  }

  importCode(code: string): boolean {
    const d = decodeImport(code);
    if (!d) return false;
    this.streak = 0;
    this.commit(d);
    return true;
  }

  /** Clear lesson and drill progress (keeps settings unless `settings` is true). */
  reset(settings = false) {
    const fresh = defaultPersisted();
    this.streak = 0;
    this.commit(settings ? fresh : { ...fresh, settings: this.data.settings });
  }
}

/** First lesson (chapter order) that is not complete, else null. */
export function nextLesson(content: ContentBundle, store: Store): string | null {
  for (const l of content.lessons) if (store.status(l.id) !== 'done') return l.id;
  return null;
}

export function overallProgress(
  content: ContentBundle,
  store: Store,
): { done: number; total: number } {
  const total = content.lessons.length;
  return { total, done: content.lessons.filter((l) => store.status(l.id) === 'done').length };
}

export const FINAL_EXAM_ID = 'final-exam';

/** Score (0..1) of the final exam, counting first attempts only, or null if it has no quizzes. */
export function finalExamScore(content: ContentBundle, store: Store): number | null {
  const lesson = content.lessons.find((l) => l.id === FINAL_EXAM_ID);
  if (!lesson) return null;
  const qs = lesson.blocks.flatMap((b) => (b.kind === 'quiz' ? [b.quiz.id] : []));
  if (qs.length === 0) return null;
  const p = store.lesson(FINAL_EXAM_ID);
  const firstTry = (id: string) => {
    const q = p?.quizzes[id];
    return q ? (q.firstTry ?? (q.attempts === 1 && q.correct)) : false;
  };
  return qs.filter(firstTry).length / qs.length;
}

/** "Perfect Strategy" badge: final-exam score >= 80%. */
export function hasPerfectStrategyBadge(content: ContentBundle, store: Store): boolean {
  const s = finalExamScore(content, store);
  return s !== null && s >= 0.8;
}
