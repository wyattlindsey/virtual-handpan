/**
 * Keyboard mapping that follows the pan's geometry: a field on the left of
 * the pan gets a key on the left half of a QWERTY keyboard, a field near
 * 12 o'clock gets an upper row, the note nearest the player sits low and
 * central. Space is the ding, the number row plays underside notes, and
 * the minus and equals keys play the tak and slap.
 */
import { type Layout, bottomFieldPositions, fieldXY, topFieldPositions } from '../model/layout';

export const DING_KEY = ' ';
export const TAK_KEY = '-';
export const SLAP_KEY = '=';

export interface KeyTarget {
  fieldId: string;
  pitch: string;
  side: 'ding' | 'top' | 'bottom' | 'rim';
  kind?: 'tak' | 'slap';
}

interface KeyPos {
  key: string;
  /** Column, 0 at the left edge; the number row's 1 is 0, and lower rows shift right as on a real keyboard. */
  x: number;
  /** Row: 0 numbers, 1 QWERTY, 2 home, 3 bottom. */
  y: number;
}

const ROWS: { keys: string; offset: number }[] = [
  { keys: '1234567890', offset: 0 },
  { keys: 'qwertyuiop', offset: 0.5 },
  { keys: "asdfghjkl;", offset: 0.75 },
  { keys: 'zxcvbnm,./', offset: 1.25 },
];

const KEYS: KeyPos[] = ROWS.flatMap((row, y) => [...row.keys].map((key, i) => ({ key, x: row.offset + i, y })));

/** Keyboard midline; keys left of it belong to the left hand. */
const MID_X = 4.75;

/** Pan x (-1..1) and y (-1 top .. 1 near the player) to keyboard coordinates. */
function toKeyboard(x: number, y: number): { kx: number; ky: number } {
  return { kx: MID_X + x * 4.2, ky: 1.5 + y * 1.6 };
}

function sideOf(x: number): 'L' | 'R' | 'C' {
  return x < -0.08 ? 'L' : x > 0.08 ? 'R' : 'C';
}

/** Whether a key may serve a field on a given side: never across the midline; centre fields may use either middle column. */
function allowed(k: KeyPos, side: 'L' | 'R' | 'C'): boolean {
  if (side === 'L') return k.x < MID_X;
  if (side === 'R') return k.x > MID_X;
  return Math.abs(k.x - MID_X) <= 1.1;
}

/** Assign each field the nearest free key on its own side of the keyboard. */
function assign(
  fields: { id: string; pitch: string; x: number; y: number; side: 'top' | 'bottom' }[],
  rows: number[],
  taken: Set<string>,
): Map<string, KeyTarget> {
  const out = new Map<string, KeyTarget>();
  const pool = KEYS.filter((k) => rows.includes(k.y));
  for (const f of fields) {
    const { kx, ky } = toKeyboard(f.x, f.y);
    const side = sideOf(f.x);
    let best: KeyPos | null = null;
    let bestD = Infinity;
    for (const k of pool) {
      if (taken.has(k.key) || !allowed(k, side)) continue;
      const d = Math.hypot(k.x - kx, (k.y - ky) * 1.4);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (!best) continue;
    taken.add(best.key);
    out.set(best.key, { fieldId: f.id, pitch: f.pitch, side: f.side });
  }
  return out;
}

/** Lowercase key to the field or stroke it plays. */
export function keyMap(layout: Layout): Map<string, KeyTarget> {
  const m = new Map<string, KeyTarget>();
  m.set(DING_KEY, { fieldId: 'ding', pitch: layout.ding, side: 'ding' });
  m.set(TAK_KEY, { fieldId: 'rim', pitch: '', side: 'rim', kind: 'tak' });
  m.set(SLAP_KEY, { fieldId: 'rim', pitch: '', side: 'rim', kind: 'slap' });
  const taken = new Set<string>();
  const top = topFieldPositions(layout).map((f) => ({ id: f.id, pitch: f.pitch, ...fieldXY(f), side: 'top' as const }));
  // Lower fields first so the note nearest the player gets the most natural key.
  top.sort((a, b) => b.y - a.y);
  for (const [k, t] of assign(top, [1, 2, 3], taken)) m.set(k, t);
  const bottom = bottomFieldPositions(layout).map((f) => ({ id: f.id, pitch: f.pitch, ...fieldXY(f), side: 'bottom' as const }));
  for (const [k, t] of assign(bottom, [0], taken)) m.set(k, t);
  return m;
}

/** Field id to the label shown on the field. */
export function keyHints(layout: Layout): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const [key, target] of keyMap(layout)) {
    if (target.fieldId === 'rim') continue;
    hints[target.fieldId] = key === ' ' ? 'space' : key;
  }
  return hints;
}
