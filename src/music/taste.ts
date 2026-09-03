/**
 * Taste weights: thumbs up and down on phrases nudge how often each
 * rhythmic cell of a feel is chosen and how much the generator likes
 * dyads. Small, local, and persisted by the app.
 */
import { type Feel, type FeelId } from './feels';

export interface TasteWeights {
  cells: Partial<Record<FeelId, number[]>>;
  /** Added to the dyad probability, -0.2..0.2. */
  dyadBias: number;
}

export function emptyTaste(): TasteWeights {
  return { cells: {}, dyadBias: 0 };
}

export function cellWeights(taste: TasteWeights | undefined, feel: Feel): number[] {
  const stored = taste?.cells[feel.id];
  return feel.cells.map((_, i) => stored?.[i] ?? 1);
}

/** Apply feedback on a phrase that used the given cells and dyad count. */
export function applyFeedback(taste: TasteWeights, feel: Feel, usedCells: number[], hadDyads: boolean, up: boolean): TasteWeights {
  const weights = cellWeights(taste, feel);
  const step = up ? 1.25 : 0.8;
  for (const i of new Set(usedCells)) {
    if (weights[i] !== undefined) weights[i] = clamp(weights[i]! * step, 0.2, 5);
  }
  const dyadBias = hadDyads ? clamp(taste.dyadBias + (up ? 0.03 : -0.03), -0.2, 0.2) : taste.dyadBias;
  return { cells: { ...taste.cells, [feel.id]: weights }, dyadBias };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
