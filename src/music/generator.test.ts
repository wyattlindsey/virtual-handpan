import { layoutFromNotes } from '../model/layout';
import { DEFAULT_GENERATOR_PARAMS, generatePhrase, generatorPitches, humanize } from './generator';
import { Rng } from './rng';

const kurd = layoutFromNotes('D Kurd', [
  'D3', 'A3', 'A#3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5',
].map((pitch) => ({ pitch })));

const withBottom = layoutFromNotes('x', [
  { pitch: 'D3' }, { pitch: 'A3' }, { pitch: 'C4' }, { pitch: 'F5', bottom: true },
]);

describe('Rng', () => {
  it('is deterministic for a seed and roughly uniform', () => {
    const a = new Rng(42), b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
    const r = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 5000; i++) sum += r.next();
    expect(sum / 5000).toBeCloseTo(0.5, 1);
  });

  it('draws weighted indices in proportion', () => {
    const r = new Rng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[r.weighted([1, 2, 3])]!++;
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.3);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.8);
  });
});

describe('generatePhrase', () => {
  it('lists the ding first then everything ascending', () => {
    expect(generatorPitches(withBottom)).toEqual(['D3', 'A3', 'C4', 'F5']);
  });

  it('scale mode goes up through top and bottom notes and back to the ding', () => {
    const notes = generatePhrase(withBottom, { ...DEFAULT_GENERATOR_PARAMS, mode: 'scale' });
    expect(notes.map((n) => n.pitch)).toEqual(['D3', 'A3', 'C4', 'F5', 'C4', 'A3', 'D3']);
    expect(notes[0]!.beat).toBe(0);
    expect(notes[1]!.beat).toBe(0.5);
  });

  it('random mode fills an eighth grid from the layout, honouring rests', () => {
    const p = { ...DEFAULT_GENERATOR_PARAMS, mode: 'random' as const, bars: 4, restDensity: 0 };
    const notes = generatePhrase(kurd, p);
    expect(notes).toHaveLength(32);
    const pitches = new Set(generatorPitches(kurd));
    for (const n of notes) expect(pitches.has(n.pitch)).toBe(true);
    const sparse = generatePhrase(kurd, { ...p, restDensity: 0.5 });
    expect(sparse.length).toBeLessThan(32);
    expect(sparse.length).toBeGreaterThan(5);
  });

  it('melodic mode is reproducible, stays in the scale and favours small steps', () => {
    const p = { ...DEFAULT_GENERATOR_PARAMS, mode: 'melodic' as const, bars: 16, seed: 11 };
    const a = generatePhrase(kurd, p);
    const b = generatePhrase(kurd, p);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(40);
    const order = generatorPitches(kurd);
    let small = 0;
    for (let i = 1; i < a.length; i++) {
      const d = Math.abs(order.indexOf(a[i]!.pitch) - order.indexOf(a[i - 1]!.pitch));
      expect(order.indexOf(a[i]!.pitch)).toBeGreaterThanOrEqual(0);
      if (d <= 2) small++;
    }
    expect(small / (a.length - 1)).toBeGreaterThan(0.6);
    for (let i = 1; i < a.length; i++) expect(a[i]!.beat).toBeGreaterThan(a[i - 1]!.beat);
    expect(a[0]!.beat).toBe(0);
  });

  it('a different seed gives a different phrase', () => {
    const a = generatePhrase(kurd, { ...DEFAULT_GENERATOR_PARAMS, seed: 1 });
    const b = generatePhrase(kurd, { ...DEFAULT_GENERATOR_PARAMS, seed: 2 });
    expect(a.map((n) => n.pitch).join()).not.toEqual(b.map((n) => n.pitch).join());
  });
});

describe('humanize', () => {
  const notes = generatePhrase(kurd, { ...DEFAULT_GENERATOR_PARAMS, mode: 'scale' });

  it('maps beats to seconds exactly when jitter and variation are zero', () => {
    const out = humanize(notes, { ...DEFAULT_GENERATOR_PARAMS, bpm: 120, jitterMs: 0, velocityVariation: 0 });
    expect(out[1]!.time).toBeCloseTo(0.25);
    expect(out[2]!.time).toBeCloseTo(0.5);
    expect(out[0]!.velocity).toBeCloseTo(0.8);
  });

  it('jitters onsets within three sigma and keeps velocities in range', () => {
    const p = { ...DEFAULT_GENERATOR_PARAMS, bpm: 120, jitterMs: 20, velocityVariation: 0.3 };
    const out = humanize(notes, p, new Rng(5));
    const straight = humanize(notes, { ...p, jitterMs: 0, velocityVariation: 0 });
    let moved = 0;
    for (let i = 0; i < out.length; i++) {
      const target = notes[i]!.beat * 0.5;
      const actual = out.find((n) => n.pitch === notes[i]!.pitch && Math.abs(n.time - target) < 0.061);
      expect(actual).toBeDefined();
      if (Math.abs(actual!.time - target) > 1e-9) moved++;
      expect(actual!.velocity).toBeGreaterThanOrEqual(0.08);
      expect(actual!.velocity).toBeLessThanOrEqual(1);
    }
    expect(moved).toBeGreaterThan(0);
    expect(straight.every((n, i) => Math.abs(n.time - notes[i]!.beat * 0.5) < 1e-9)).toBe(true);
  });

  it('applies swing to offbeat eighths only', () => {
    const out = humanize(notes, { ...DEFAULT_GENERATOR_PARAMS, bpm: 60, jitterMs: 0, velocityVariation: 0, swing: 1 });
    expect(out[0]!.time).toBeCloseTo(0);
    expect(out[1]!.time).toBeCloseTo(0.5 + 1 / 6);
    expect(out[2]!.time).toBeCloseTo(1);
  });
});
