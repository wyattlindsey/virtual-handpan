/**
 * Rhythmic feels: how many eighth-note slots a bar has, how each slot is
 * accented, which rhythmic cells a bar can be built from, and where the
 * grooving hand falls. Velocity follows the meter through these accents,
 * so a sampled instrument's layers respond to musical position.
 */

export type FeelId = 'straight' | 'halftime' | 'lilt' | 'waltz' | 'seven';

export interface Feel {
  id: FeelId;
  name: string;
  /** Eighth-note slots per bar. */
  slots: number;
  /** Accent per slot, added to the mean velocity. */
  accents: number[];
  /** Rhythmic cells as note durations in beats; each sums to slots / 2. */
  cells: number[][];
  /** Slots where the grooving hand plays, first one on the ding. */
  grooveSlots: number[];
}

export const FEELS: Feel[] = [
  {
    id: 'straight',
    name: 'Straight 4/4',
    slots: 8,
    accents: [0.08, -0.05, 0, -0.05, 0.04, -0.05, 0, -0.05],
    cells: [
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      [1, 0.5, 0.5, 1, 0.5, 0.5],
      [0.5, 0.5, 1, 0.5, 0.5, 1],
      [1, 1, 0.5, 0.5, 1],
      [0.5, 1, 0.5, 0.5, 1, 0.5],
      [1.5, 0.5, 1, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5, 1, 1],
      [0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      [1, 1, 2],
      [2, 1, 1],
    ],
    grooveSlots: [0, 4],
  },
  {
    id: 'halftime',
    name: 'Half-time',
    slots: 8,
    accents: [0.08, -0.06, -0.02, -0.06, 0.06, -0.06, -0.02, -0.05],
    cells: [
      [1, 1, 2],
      [2, 1, 1],
      [1.5, 0.5, 2],
      [1, 0.5, 0.5, 2],
      [2, 0.5, 0.5, 1],
      [1, 1, 1, 1],
      [1.5, 1.5, 1],
      [3, 1],
    ],
    grooveSlots: [0, 4],
  },
  {
    id: 'lilt',
    name: '6/8 lilt',
    slots: 6,
    accents: [0.08, -0.05, -0.03, 0.05, -0.05, -0.03],
    cells: [
      [1.5, 1.5],
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      [1, 0.5, 1, 0.5],
      [0.5, 1, 0.5, 1],
      [1.5, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 1.5],
      [1, 0.5, 0.5, 0.5, 0.5],
    ],
    grooveSlots: [0, 3],
  },
  {
    id: 'waltz',
    name: 'Waltz 3/4',
    slots: 6,
    accents: [0.08, -0.05, -0.02, -0.05, 0, -0.05],
    cells: [
      [1, 1, 1],
      [1, 0.5, 0.5, 1],
      [0.5, 0.5, 1, 1],
      [1.5, 0.5, 1],
      [1, 1, 0.5, 0.5],
      [2, 1],
      [1, 2],
    ],
    grooveSlots: [0, 2, 4],
  },
  {
    id: 'seven',
    name: '7/8 (2+2+3)',
    slots: 7,
    accents: [0.08, -0.05, 0.03, -0.05, 0.04, -0.05, -0.03],
    cells: [
      [1, 1, 1.5],
      [0.5, 0.5, 1, 1.5],
      [1, 1, 0.5, 1],
      [1, 0.5, 0.5, 0.5, 1],
      [0.5, 0.5, 0.5, 0.5, 1.5],
      [1, 1, 1, 0.5],
      [2, 1.5],
    ],
    grooveSlots: [0, 4],
  },
];

export function getFeel(id: FeelId): Feel {
  return FEELS.find((f) => f.id === id) ?? FEELS[0]!;
}

/** Beats per bar for a feel. */
export function barBeats(feel: Feel): number {
  return feel.slots / 2;
}

/** Accent for a position within the bar, in beats. */
export function accentAt(feel: Feel, beatInBar: number): number {
  const slot = Math.round(beatInBar * 2) % feel.slots;
  return feel.accents[slot] ?? 0;
}
