import {
  allFieldPositions, bottomFieldPositions, fieldXY, layoutFromNotes, layoutPitches,
  ringAngles, topFieldPositions, transposeLayout,
} from './layout';

describe('ringAngles', () => {
  it('places 8 fields in an evenly spaced zigzag ending at 12 o\'clock', () => {
    expect(ringAngles(8)).toEqual([180, 225, 135, 270, 90, 315, 45, 0]);
  });

  it('mirrors when the zigzag starts on the right', () => {
    expect(ringAngles(8, 'right')).toEqual([180, 135, 225, 90, 270, 45, 315, 0]);
  });

  it('keeps slots distinct and evenly spaced for odd counts', () => {
    const a = ringAngles(7);
    const sorted = [...a].sort((x, y) => x - y);
    expect(new Set(a).size).toBe(7);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(360 / 7, 6);
    }
  });

  it('handles empty and single', () => {
    expect(ringAngles(0)).toEqual([]);
    expect(ringAngles(1)).toEqual([180]);
  });
});

describe('layoutFromNotes', () => {
  const kurd = layoutFromNotes('D Kurd 9', [
    { pitch: 'A3' }, { pitch: 'D3' }, { pitch: 'C4' }, { pitch: 'A#3' }, { pitch: 'D4' },
    { pitch: 'E4' }, { pitch: 'F4' }, { pitch: 'G4' }, { pitch: 'A4' }, { pitch: 'C5' },
  ]);

  it('takes the lowest top-side note as the ding and sorts the ring', () => {
    expect(kurd.ding).toBe('D3');
    expect(kurd.top).toEqual(['A3', 'A#3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5']);
    expect(kurd.bottom).toEqual([]);
  });

  it('routes flagged notes to the bottom, even if lower than the ding candidates', () => {
    const l = layoutFromNotes('x', [
      { pitch: 'C#3' }, { pitch: 'G#3' }, { pitch: 'B4', bottom: true }, { pitch: 'C#5', bottom: true },
    ]);
    expect(l.ding).toBe('C#3');
    expect(l.top).toEqual(['G#3']);
    expect(l.bottom).toEqual(['B4', 'C#5']);
  });

  it('lists all pitches ascending and transposes everything', () => {
    expect(layoutPitches(kurd)[0]).toBe('D3');
    expect(layoutPitches(kurd).at(-1)).toBe('C5');
    const up = transposeLayout(kurd, 2);
    expect(up.ding).toBe('E3');
    expect(up.top[0]).toBe('B3');
  });
});

describe('positions', () => {
  const l = layoutFromNotes('t', [
    { pitch: 'D3' }, { pitch: 'A3' }, { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'F5', bottom: true },
  ]);

  it('gives stable ids and puts the ding at the centre', () => {
    const all = allFieldPositions(l);
    expect(all.map((f) => f.id)).toEqual(['ding', 'top-0', 'top-1', 'top-2', 'bottom-0']);
    expect(all[0]!.radius).toBe(0);
    expect(fieldXY(all[0]!)).toEqual({ x: 0, y: -0 });
  });

  it('makes lower fields larger', () => {
    const [a3, , d4] = topFieldPositions(l);
    expect(a3!.size).toBeGreaterThan(d4!.size);
  });

  it('puts the lowest top field at 6 o\'clock (positive y in SVG)', () => {
    const { x, y } = fieldXY(topFieldPositions(l)[0]!);
    expect(x).toBeCloseTo(0);
    expect(y).toBeGreaterThan(0);
  });

  it('offsets bottom fields off the top slots', () => {
    const b = bottomFieldPositions(l);
    expect(b).toHaveLength(1);
    expect(b[0]!.angleDeg).not.toBe(180);
  });
});
