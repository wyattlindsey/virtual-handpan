import { layoutFromNotes } from '../model/layout';
import { keyHints, keyMap } from './keys';

const LEFT = new Set('12345qwertasdfgzxcvb');
const RIGHT = new Set('67890yuiophjkl;nm,./');

const kurd = layoutFromNotes('D Kurd', [
  'D3', 'A3', 'A#3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5',
].map((pitch) => ({ pitch })));

describe('keyMap', () => {
  it('keeps left-side fields on the left of the keyboard and right-side fields on the right', () => {
    const map = keyMap(kurd);
    const byField = new Map([...map].map(([k, t]) => [t.fieldId, k]));
    // Zigzag from 6 o'clock: odd indices go left, even go right, the last sits near 12 o'clock.
    expect(LEFT.has(byField.get('top-1')!)).toBe(true);
    expect(LEFT.has(byField.get('top-3')!)).toBe(true);
    expect(LEFT.has(byField.get('top-5')!)).toBe(true);
    expect(RIGHT.has(byField.get('top-2')!)).toBe(true);
    expect(RIGHT.has(byField.get('top-4')!)).toBe(true);
    expect(RIGHT.has(byField.get('top-6')!)).toBe(true);
    expect(byField.get('ding')).toBe(' ');
  });

  it('puts higher fields on higher rows and the nearest field low and central', () => {
    const map = keyMap(kurd);
    const byField = new Map([...map].map(([k, t]) => [t.fieldId, k]));
    expect('gvbh'.includes(byField.get('top-0')!)).toBe(true);
    expect('qwertyuiop'.includes(byField.get('top-7')!)).toBe(true);
    expect('qwertyuiop'.includes(byField.get('top-8')!)).toBe(true);
  });

  it('gives every field a distinct key and keeps strokes off the letters', () => {
    const map = keyMap(kurd);
    const ids = [...map.values()].map((t) => t.fieldId);
    expect(new Set(ids).size).toBe(ids.length - 1); // tak and slap share the rim
    expect(map.get('-')?.kind).toBe('tak');
    expect(map.get('=')?.kind).toBe('slap');
    const hints = keyHints(kurd);
    expect(Object.keys(hints)).toHaveLength(10);
    expect(hints['rim']).toBeUndefined();
  });

  it('puts underside notes on the number row by side', () => {
    const layout = layoutFromNotes('x', [
      { pitch: 'D3' }, { pitch: 'A3' }, { pitch: 'C4' }, { pitch: 'C5', bottom: true }, { pitch: 'D5', bottom: true },
    ]);
    const map = keyMap(layout);
    const bottomKeys = [...map].filter(([, t]) => t.side === 'bottom').map(([k]) => k);
    expect(bottomKeys).toHaveLength(2);
    for (const k of bottomKeys) expect('1234567890'.includes(k)).toBe(true);
  });
});
