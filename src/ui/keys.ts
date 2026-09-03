/** Keyboard mapping: home row for the top ring, bottom row for underside notes, space for the ding. */
import type { Layout } from '../model/layout';

export const DING_KEY = ' ';
export const TOP_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"] as const;
export const BOTTOM_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'] as const;

export const TAK_KEY = '1';
export const SLAP_KEY = '2';

export interface KeyTarget {
  fieldId: string;
  pitch: string;
  side: 'ding' | 'top' | 'bottom' | 'rim';
  kind?: 'tak' | 'slap';
}

/** Lowercase key to the field it plays. */
export function keyMap(layout: Layout): Map<string, KeyTarget> {
  const m = new Map<string, KeyTarget>();
  m.set(DING_KEY, { fieldId: 'ding', pitch: layout.ding, side: 'ding' });
  m.set(TAK_KEY, { fieldId: 'rim', pitch: '', side: 'rim', kind: 'tak' });
  m.set(SLAP_KEY, { fieldId: 'rim', pitch: '', side: 'rim', kind: 'slap' });
  layout.top.forEach((pitch, i) => {
    const k = TOP_KEYS[i];
    if (k) m.set(k, { fieldId: `top-${i}`, pitch, side: 'top' });
  });
  layout.bottom.forEach((pitch, i) => {
    const k = BOTTOM_KEYS[i];
    if (k) m.set(k, { fieldId: `bottom-${i}`, pitch, side: 'bottom' });
  });
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
