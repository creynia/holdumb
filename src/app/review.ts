// Spaced review of Drill misses (I067): Leitner boxes 1..5 on a clock of answers given, never wall
// time, so everything here is pure and deterministic.

export const REVIEW_BOXES = 5;
/** Answers until a spot is due again, by the box it sits in (box 5's is its last turn). */
export const REVIEW_INTERVALS: readonly number[] = [3, 8, 20, 50, 50];
export const MAX_REVIEW = 200;
/** While anything is due, at most this share of dealt spots are reviews. */
export const MAX_REVIEW_SHARE = 0.3;

export interface ReviewItem {
  code: string;
  /** 1..5 */
  box: number;
  /** Due once this many answers have been given (this lens). */
  due: number;
}

/**
 * The deck after one answer. `clock` = answers given BEFORE this one (this lens).
 * - a miss: box 1, due 3 answers from now (also for a spot that was not in the deck yet);
 * - a correct answer to a spot that is due: up one box, due after that box's interval; correct in
 *   box 5 and it leaves the deck;
 * - a correct answer to a spot that is not yet due changes nothing.
 */
export function reviewAfterAnswer(
  deck: readonly ReviewItem[],
  code: string,
  correct: boolean,
  clock: number,
): ReviewItem[] {
  const now = clock + 1;
  const rest = deck.filter((i) => i.code !== code);
  const item = deck.find((i) => i.code === code);
  if (!correct)
    return [{ code, box: 1, due: now + REVIEW_INTERVALS[0]! }, ...rest].slice(0, MAX_REVIEW);
  if (!item || item.due > clock) return [...deck];
  if (item.box >= REVIEW_BOXES) return rest;
  const box = item.box + 1;
  return [{ code, box, due: now + REVIEW_INTERVALS[box - 1]! }, ...rest].slice(0, MAX_REVIEW);
}

/** Spot codes due at `clock` (answers given), longest overdue first. */
export function dueCodes(deck: readonly ReviewItem[], clock: number): string[] {
  return deck
    .filter((i) => i.due <= clock)
    .sort((a, b) => a.due - b.due)
    .map((i) => i.code);
}

/** May the next spot be a review? Keeps reviews at or under MAX_REVIEW_SHARE of all dealt. */
export function reviewAllowed(dealt: number, reviews: number): boolean {
  return reviews + 1 <= MAX_REVIEW_SHARE * (dealt + 1);
}
