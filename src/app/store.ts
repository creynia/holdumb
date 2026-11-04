import { dueCodes, reviewAfterAnswer } from './review';
import {
  DRILL_STREETS,
  MAX_RECENT_ANSWERS,
  createStorage,
  decodeImport,
  defaultPersisted,
  emptyDrill,
  encodeExport,
  loadDetailed,
  save,
  type DrillLens,
  type DrillStats,
  type LensStats,
  lensStats,
  type DrillStreet,
  type LessonProgress,
  type PersistedV1,
  type Settings,
  type StorageLike,
} from './storage';
import type { DrillCategoryId } from '../sim/strategy';
import type { ContentBundle } from '../content/types';

export type LessonStatus = 'new' | 'progress' | 'done';

const emptyLesson = (): LessonProgress => ({ quizzes: {}, scenes: {} });

export class Store {
  private data: PersistedV1;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** consecutive correct Drill answers this visit (not persisted; the best is) */
  // Deliberately per lens, like bestStreak: a Basic card run never extends or breaks a Perfect run.
  private streaks: Record<DrillLens, number> = { perfect: 0, practical: 0 };
  private unavailable = false; // localStorage missing: memory only
  private readOnly = false; // stored data is from a newer app: never overwrite it
  private saveFailed = false; // a write was refused (quota)

  /** false when progress cannot be saved; the app shows a banner. Observable via subscribe(). */
  get persistent(): boolean {
    return !this.unavailable && !this.readOnly && !this.saveFailed;
  }

  constructor(
    storage?: StorageLike,
    private debounceMs = 300,
  ) {
    if (storage) {
      this.storage = storage;
    } else {
      const h = createStorage();
      this.storage = h.storage;
      this.unavailable = !h.persistent;
    }
    const loaded = loadDetailed(this.storage);
    this.data = loaded.data;
    this.readOnly = loaded.readOnly;
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
  /** The sim's opaque sandbox snapshot (PersistedV1.sandbox); included in export/import. */
  get sandbox(): unknown {
    return this.data.sandbox;
  }
  get drillStreak(): number {
    return this.streaks[this.data.drill.lens];
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
    if (this.readOnly || this.unavailable) return;
    const ok = save(this.storage, this.data);
    if (ok === this.saveFailed) {
      this.saveFailed = !ok;
      this.listeners.forEach((l) => l());
    }
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
  recordDrill(
    street: DrillStreet,
    correct: boolean,
    spotCode?: string,
    category?: DrillCategoryId,
  ) {
    const d = this.data.drill;
    const lens = d.lens;
    const streak = correct ? this.streaks[lens] + 1 : 0;
    this.streaks[lens] = streak;
    const cur = lensStats(d);
    const row = cur.byStreet[street];
    const cat = category ? cur.byCategory[category] : undefined;
    const clock = DRILL_STREETS.reduce((n, s) => n + cur.byStreet[s].answered, 0);
    const review = spotCode ? reviewAfterAnswer(cur.review, spotCode, correct, clock) : cur.review;
    const next: LensStats = {
      bestStreak: Math.max(cur.bestStreak, streak),
      byStreet: {
        ...cur.byStreet,
        [street]: { answered: row.answered + 1, correct: row.correct + (correct ? 1 : 0) },
      },
      byCategory: category
        ? {
            ...cur.byCategory,
            [category]: {
              answered: (cat?.answered ?? 0) + 1,
              correct: (cat?.correct ?? 0) + (correct ? 1 : 0),
            },
          }
        : cur.byCategory,
      review,
      recent: category
        ? [...cur.recent, `${category}:${correct ? 1 : 0}`].slice(-MAX_RECENT_ANSWERS)
        : cur.recent,
    };
    this.commit({
      ...this.data,
      drill: lens === 'practical' ? { ...d, practical: next } : { ...d, ...next },
    });
  }

  /** Drill: spot codes due for review now in the current lens, longest overdue first (I067). */
  dueReview(): string[] {
    const cur = lensStats(this.data.drill);
    return dueCodes(
      cur.review,
      DRILL_STREETS.reduce((n, s) => n + cur.byStreet[s].answered, 0),
    );
  }

  /** Drill: choose the grading lens (kept across visits; accuracy is tracked per lens). */
  setDrillLens(lens: DrillLens) {
    if (lens === this.data.drill.lens) return;
    this.commit({ ...this.data, drill: { ...this.data.drill, lens } });
  }

  /** Drill: the "Close calls" mix on or off (persisted). */
  setDrillCloseCalls(on: boolean) {
    if (on === this.data.drill.closeCalls) return;
    this.commit({ ...this.data, drill: { ...this.data.drill, closeCalls: on } });
  }

  resetDrill() {
    this.streaks = { perfect: 0, practical: 0 };
    this.commit({ ...this.data, drill: emptyDrill() });
  }

  /**
   * Store the sandbox snapshot. Saved with the debounce but does not notify subscribers: it changes
   * on every table action and nothing in the app renders it.
   */
  setSandbox(snap: unknown) {
    const { sandbox: _old, ...rest } = this.data;
    this.data = snap === undefined ? rest : { ...rest, sandbox: snap };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
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
    this.streaks = { perfect: 0, practical: 0 };
    this.commit(d);
    return true;
  }

  /** Clear lesson and drill progress (keeps settings unless `settings` is true). */
  reset(settings = false) {
    const fresh = defaultPersisted();
    this.streaks = { perfect: 0, practical: 0 };
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
