import { SCALES, findScale, layoutFromScale, scalesByMaker } from './scales';
import { isValidPitch } from './pitch';

describe('scale library', () => {
  it('loads every scale from the sheet with valid pitches', () => {
    expect(SCALES.length).toBe(93);
    for (const s of SCALES) {
      expect(s.notes.length).toBeGreaterThanOrEqual(8);
      for (const n of s.notes) expect(isValidPitch(n.pitch)).toBe(true);
    }
  });

  it('gives every scale a unique id and disambiguates duplicates', () => {
    const ids = SCALES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findScale('Meraki/Dune')).toBeDefined();
    expect(findScale('Meraki/Dune#2')).toBeDefined();
  });

  it('groups by maker', () => {
    const groups = scalesByMaker();
    expect(groups.size).toBe(17);
    expect(groups.get('Halo')?.length).toBe(16);
  });

  it('builds a layout with bottom notes from a scale', () => {
    const saladin = SCALES.find((s) => s.name.startsWith('SalaDin (with bottom'));
    expect(saladin).toBeDefined();
    const layout = layoutFromScale(saladin!);
    expect(layout.ding).toBe('D3');
    expect(layout.bottom).toEqual(['C5', 'D5']);
    expect(layout.top).not.toContain('C5');
  });

  it('flags flat-spelling makers', () => {
    expect(findScale('CFoulke/Celtic8 G')?.prefersFlats).toBe(true);
    expect(findScale('AsaChan/AmaRa')?.prefersFlats).toBe(false);
  });
});
