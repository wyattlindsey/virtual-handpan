import { layoutFromNotes } from '../model/layout';
import { midiFromPitch } from '../model/pitch';
import { FEELS, barBeats, getFeel } from './feels';
import {
  DEFAULT_GENERATOR_PARAMS, type GeneratorParams, generatePhrase, generatePhraseDetailed, generatorPitches, handMap, humanize,
  humanizeNote, humanizeRng, phraseKey, phraseSeconds, pickPartner, positionMap, reachFactor,
} from './generator';
import { Rng } from './rng';

const kurd = layoutFromNotes('D Kurd', [
  'D3', 'A3', 'A#3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5',
].map((pitch) => ({ pitch })));

const withBottom = layoutFromNotes('x', [
  { pitch: 'D3' }, { pitch: 'A3' }, { pitch: 'C4' }, { pitch: 'F5', bottom: true },
]);

const P: GeneratorParams = { ...DEFAULT_GENERATOR_PARAMS, dyads: 0, groove: 0, taks: 0, drift: 0, lean: 0 };

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

describe('feels', () => {
  it('have consistent slots, accents and cells', () => {
    for (const f of FEELS) {
      expect(f.accents).toHaveLength(f.slots);
      for (const cell of f.cells) expect(cell.reduce((a, b) => a + b, 0)).toBeCloseTo(f.slots / 2, 9);
      expect(f.grooveSlots[0]).toBe(0);
      expect(f.accents[0]).toBeGreaterThan(0);
      for (const t of f.takSlots) { expect(t).toBeGreaterThan(0); expect(t).toBeLessThan(f.slots); }
    }
  });
});

describe('generatePhrase', () => {
  it('lists the ding first then everything ascending', () => {
    expect(generatorPitches(withBottom)).toEqual(['D3', 'A3', 'C4', 'F5']);
  });

  it('scale mode goes up through top and bottom notes and back to the ding', () => {
    const notes = generatePhrase(withBottom, { ...P, mode: 'scale' });
    expect(notes.map((n) => n.pitch)).toEqual(['D3', 'A3', 'C4', 'F5', 'C4', 'A3', 'D3']);
    expect(notes[0]!.beat).toBe(0);
    expect(notes[1]!.beat).toBe(0.5);
  });

  it('random mode fills the feel grid from the layout, honouring rests', () => {
    const p = { ...P, mode: 'random' as const, bars: 4, restDensity: 0 };
    const notes = generatePhrase(kurd, p);
    expect(notes).toHaveLength(32);
    const pitches = new Set(generatorPitches(kurd));
    for (const n of notes) expect(pitches.has(n.pitch)).toBe(true);
    expect(generatePhrase(kurd, { ...p, feel: 'lilt' })).toHaveLength(24);
    const sparse = generatePhrase(kurd, { ...p, restDensity: 0.5 });
    expect(sparse.length).toBeLessThan(32);
    expect(sparse.length).toBeGreaterThan(5);
  });

  it('melodic mode is reproducible, stays in the scale and favours small steps', () => {
    const p = { ...P, mode: 'melodic' as const, bars: 16, seed: 11 };
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
    for (let i = 1; i < a.length; i++) expect(a[i]!.beat).toBeGreaterThanOrEqual(a[i - 1]!.beat);
    expect(a[0]!.beat).toBe(0);
  });

  it('keeps every note inside the bars of the chosen feel', () => {
    for (const feel of FEELS) {
      const bars = 6;
      const notes = generatePhrase(kurd, { ...P, feel: feel.id, bars, seed: 5, dyads: 0.5, groove: 1 });
      for (const n of notes) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(bars * barBeats(feel));
      }
    }
  });

  it('starts most bars on the ding', () => {
    const bars = 32;
    const notes = generatePhrase(kurd, { ...P, bars, restDensity: 0, seed: 21 });
    let onDing = 0;
    for (let bar = 0; bar < bars; bar++) {
      const first = notes.find((n) => n.beat === bar * 4 && n.role === 'melody' && !n.partner);
      if (first?.pitch === 'D3') onDing++;
    }
    expect(onDing / bars).toBeGreaterThan(0.65);
    // With the groove hand on, the bar still opens on the ding one way or the other.
    const grooved = generatePhrase(kurd, { ...P, bars, groove: 1, restDensity: 0, seed: 22 });
    let opens = 0;
    for (let bar = 0; bar < bars; bar++) if (grooved.some((n) => n.beat === bar * 4 && n.pitch === 'D3')) opens++;
    expect(opens / bars).toBeGreaterThan(0.85);
  });

  it('a different seed gives a different phrase', () => {
    const a = generatePhrase(kurd, { ...P, seed: 1 });
    const b = generatePhrase(kurd, { ...P, seed: 2 });
    expect(a.map((n) => n.pitch).join()).not.toEqual(b.map((n) => n.pitch).join());
  });

  it('adds dyads with a partner from the scale at the same beat', () => {
    const none = generatePhraseDetailed(kurd, { ...P, dyads: 0 });
    expect(none.notes.some((n) => n.partner)).toBe(false);
    expect(none.hadDyads).toBe(false);
    const all = generatePhraseDetailed(kurd, { ...P, dyads: 1, bars: 8, seed: 3 });
    const partners = all.notes.filter((n) => n.partner);
    const melody = all.notes.filter((n) => n.role === 'melody' && !n.partner);
    expect(all.hadDyads).toBe(true);
    expect(partners.length).toBeGreaterThan(melody.length * 0.5);
    const scale = new Set(generatorPitches(kurd));
    for (const p of partners) {
      expect(scale.has(p.pitch)).toBe(true);
      const lead = melody.find((m) => m.beat === p.beat);
      expect(lead).toBeDefined();
      expect(lead!.pitch).not.toBe(p.pitch);
      expect(p.accent).toBeLessThan(lead!.accent);
    }
  });

  it('puts the grooving hand on the ding and low field at the feel slots', () => {
    const bars = 8;
    const notes = generatePhrase(kurd, { ...P, groove: 1, bars, seed: 4 });
    const groove = notes.filter((n) => n.role === 'groove');
    expect(groove.length).toBeGreaterThan(bars * 1.2);
    for (const g of groove) {
      expect(['D3', 'A3']).toContain(g.pitch);
      expect(g.hand).toBe('L');
      expect(g.beat % 1).toBe(0);
      // Whatever the melody plays at that moment is on the other hand.
      for (const m of notes) if (m.beat === g.beat && m !== g) expect(m.hand).toBe('R');
    }
    expect(generatePhrase(kurd, { ...P, groove: 0 }).some((n) => n.role === 'groove')).toBe(false);
  });

  it('alternates hands on fast runs more than chance', () => {
    const hands = handMap(kurd, generatorPitches(kurd));
    expect(hands[0]).toBeNull();
    expect(hands.filter((h) => h === 'L').length).toBeGreaterThan(2);
    expect(hands.filter((h) => h === 'R').length).toBeGreaterThan(2);
    const notes = generatePhrase(kurd, { ...P, bars: 32, restDensity: 0, seed: 8 }).filter((n) => n.role === 'melody');
    let same = 0, pairs = 0;
    for (let i = 1; i < notes.length; i++) {
      const a = notes[i - 1]!, b = notes[i]!;
      if (a.duration > 0.5 || !a.hand || !b.hand) continue;
      pairs++;
      if (a.hand === b.hand) same++;
    }
    expect(pairs).toBeGreaterThan(20);
    expect(same / pairs).toBeLessThan(0.42);
  });

  it('puts taks on the backbeat with a free hand', () => {
    const bars = 8;
    const notes = generatePhrase(kurd, { ...P, taks: 1, groove: 1, dyads: 0.5, bars, seed: 7 });
    const taks = notes.filter((n) => n.kind === 'tak');
    expect(taks.length).toBeGreaterThan(bars * 1.2);
    for (const t of taks) {
      expect(t.pitch).toBe('');
      expect([1, 3]).toContain(t.beat % 4);
      for (const other of notes) if (other !== t && other.beat === t.beat) expect(other.hand).not.toBe(t.hand);
    }
    expect(generatePhrase(kurd, { ...P, taks: 0 }).some((n) => n.kind)).toBe(false);
    // The low end of the slider still produces taks you can hear over a phrase.
    let low = 0;
    for (let seed = 1; seed <= 10; seed++) low += generatePhrase(kurd, { ...P, taks: 0.1, bars: 8, seed }).filter((n) => n.kind === 'tak').length;
    expect(low / 10).toBeGreaterThan(2.5);
    expect(phraseKey({ ...P, taks: 1 })).not.toBe(phraseKey(P));
    const lilt = generatePhrase(kurd, { ...P, taks: 1, feel: 'lilt', bars: 4, seed: 2 }).filter((n) => n.kind === 'tak');
    for (const t of lilt) expect(t.beat % 3).toBe(1.5);
  });

  it('keeps every simultaneous pair on two different hands and never asks for three', () => {
    const notes = generatePhrase(kurd, { ...P, dyads: 1, groove: 1, taks: 1, bars: 16, seed: 6 });
    const byBeat = new Map<number, typeof notes>();
    for (const n of notes) byBeat.set(n.beat, [...(byBeat.get(n.beat) ?? []), n]);
    const hands = handMap(kurd, generatorPitches(kurd));
    const order = generatorPitches(kurd);
    for (const group of byBeat.values()) {
      expect(group.length).toBeLessThanOrEqual(2);
      if (group.length === 2) {
        const [a, b] = group;
        expect(a!.hand).not.toBe(b!.hand);
        const sideA = hands[order.indexOf(a!.pitch)];
        const sideB = hands[order.indexOf(b!.pitch)];
        if (sideA && sideB) expect(sideA).not.toBe(sideB);
      }
    }
  });

  it('keeps each hand within a comfortable speed', () => {
    const pitches = generatorPitches(kurd);
    const positions = positionMap(kurd, pitches);
    const notes = generatePhrase(kurd, { ...P, dyads: 0.5, groove: 1, bars: 32, restDensity: 0, seed: 12 });
    const lastByHand: Record<string, { pos: { x: number; y: number }; beat: number }> = {};
    let moves = 0, rushed = 0;
    for (const n of notes) {
      if (n.kind) continue;
      const hand = n.hand!;
      const pos = positions[pitches.indexOf(n.pitch)]!;
      const prev = lastByHand[hand];
      if (prev && n.beat > prev.beat) {
        moves++;
        const speed = Math.hypot(pos.x - prev.pos.x, pos.y - prev.pos.y) / Math.max(0.25, n.beat - prev.beat);
        if (speed > 2.2) rushed++;
      }
      lastByHand[hand] = { pos, beat: n.beat };
    }
    expect(moves).toBeGreaterThan(80);
    expect(rushed / moves).toBeLessThan(0.08);
    expect(reachFactor(null, 0, { x: 1, y: 0 }, 0.25)).toBe(1);
    expect(reachFactor({ x: -0.6, y: 0 }, 0, { x: 0.6, y: 0 }, 0.5)).toBeLessThan(0.2);
    expect(reachFactor({ x: -0.6, y: 0 }, 0, { x: 0.6, y: 0 }, 2)).toBe(1);
  });

  it('reports the cells it used and learned mode falls back without a model', () => {
    const d = generatePhraseDetailed(kurd, { ...P, bars: 8, seed: 2 });
    expect(d.cellsUsed.length).toBeGreaterThan(0);
    for (const i of d.cellsUsed) expect(i).toBeLessThan(getFeel('straight').cells.length);
    const learned = generatePhrase(kurd, { ...P, mode: 'learned', seed: 2 });
    expect(learned).toEqual(generatePhrase(kurd, { ...P, mode: 'melodic', seed: 2 }));
  });

  it('honours taste weights for cells', () => {
    const feel = getFeel('straight');
    const only = feel.cells.map((_, i) => (i === 3 ? 5 : 0.2));
    const d = generatePhraseDetailed(kurd, { ...P, bars: 16, seed: 9 }, { taste: { cells: { straight: only }, dyadBias: 0 } });
    const share = d.cellsUsed.filter((i) => i === 3).length / d.cellsUsed.length;
    expect(share).toBeGreaterThan(0.5);
  });
});

describe('pickPartner', () => {
  it('prefers the ding, octaves and fifths and returns null with nothing consonant', () => {
    const midis = generatorPitches(kurd).map(midiFromPitch);
    const rng = new Rng(1);
    const counts = new Map<number, number>();
    for (let i = 0; i < 400; i++) {
      const p = pickPartner(4, midis, rng); // D4
      counts.set(p!, (counts.get(p!) ?? 0) + 1);
    }
    expect(counts.get(0)).toBeGreaterThan(60);      // ding
    expect(counts.get(1)).toBeGreaterThan(40);      // A3, a fourth below
    expect(counts.get(8)).toBeGreaterThan(40);      // A4, a fifth above
    expect(pickPartner(0, [50, 51], new Rng(1))).toBeNull();
  });

  it('never offers a partner on the lead hand\'s side', () => {
    const pitches = generatorPitches(kurd);
    const midis = pitches.map(midiFromPitch);
    const hands = handMap(kurd, pitches);
    const rng = new Rng(2);
    for (let i = 0; i < 300; i++) {
      const lead = 1 + rng.int(pitches.length - 1);
      const leadHand = hands[lead] ?? 'R';
      const p = pickPartner(lead, midis, rng, hands, leadHand);
      if (p !== null) expect(hands[p]).not.toBe(leadHand);
    }
  });
});

describe('humanize', () => {
  const notes = generatePhrase(kurd, { ...P, mode: 'scale' });
  const flat = { ...P, bpm: 120, jitterMs: 0, velocityVariation: 0, swing: 0, lean: 0, drift: 0, flamMs: 0 };

  it('maps beats to seconds exactly when everything human is off', () => {
    const out = humanize(notes, flat);
    expect(out[1]!.time).toBeCloseTo(0.25);
    expect(out[2]!.time).toBeCloseTo(0.5);
    expect(out[0]!.velocity).toBeCloseTo(0.8);
  });

  it('applies the mean velocity live through accents', () => {
    const n = { beat: 4, pitch: 'D3', accent: 0.08, duration: 1 };
    const quiet = humanizeNote(n, { ...flat, velocity: 0.4 }, humanizeRng(1));
    const loud = humanizeNote(n, { ...flat, velocity: 0.9 }, humanizeRng(1));
    expect(quiet.velocity).toBeCloseTo(0.48);
    expect(loud.velocity).toBeCloseTo(0.98);
    expect(quiet.beat).toBe(4);
  });

  it('delays a dyad partner by the flam and leans offbeats', () => {
    const lead = { beat: 2, pitch: 'D3', accent: 0, duration: 1 };
    const trail = { ...lead, pitch: 'A3', partner: true };
    const p = { ...flat, bpm: 60, flamMs: 20 };
    expect(humanizeNote(lead, p, humanizeRng(1)).beat).toBe(2);
    expect(humanizeNote(trail, p, humanizeRng(1)).beat).toBeCloseTo(2.02);
    const off = { beat: 2.5, pitch: 'D3', accent: 0, duration: 0.5 };
    expect(humanizeNote(off, { ...flat, bpm: 60, lean: 1 }, humanizeRng(1)).beat).toBeCloseTo(2.512);
    expect(humanizeNote(off, { ...flat, bpm: 60, lean: -1 }, humanizeRng(1)).beat).toBeCloseTo(2.488);
  });

  it('treats missing or bad parameters as neutral', () => {
    const n = { beat: 2.5, pitch: 'D3', accent: 0.05, duration: 0.5 };
    const partial = { bpm: 120, velocity: 0.6 } as unknown as Parameters<typeof humanizeNote>[1];
    const h = humanizeNote({ ...n, partner: true }, partial, humanizeRng(1));
    expect(Number.isFinite(h.beat)).toBe(true);
    expect(h.beat).toBeCloseTo(2.5);
    expect(h.velocity).toBeCloseTo(0.65);
    const nan = { ...flat, lean: Number.NaN, bpm: Number.NaN };
    const g = humanizeNote(n, nan, humanizeRng(1));
    expect(Number.isFinite(g.beat)).toBe(true);
  });

  it('drifts slowly and stays bounded', () => {
    const p = { ...flat, bpm: 60, drift: 1 };
    let maxAbs = 0;
    for (let b = 0; b < 48; b++) {
      const h = humanizeNote({ beat: b, pitch: 'D3', accent: 0, duration: 1 }, p, humanizeRng(1));
      maxAbs = Math.max(maxAbs, Math.abs(h.beat - b));
    }
    expect(maxAbs).toBeGreaterThan(0.02);
    expect(maxAbs).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('jitters onsets within three sigma and keeps velocities in range', () => {
    const p = { ...P, bpm: 120, jitterMs: 20, velocityVariation: 0.3 };
    const out = humanize(notes, p, new Rng(5));
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
  });

  it('applies swing to offbeat eighths only', () => {
    const out = humanize(notes, { ...flat, bpm: 60, swing: 1 });
    expect(out[0]!.time).toBeCloseTo(0);
    expect(out[1]!.time).toBeCloseTo(0.5 + 1 / 6);
    expect(out[2]!.time).toBeCloseTo(1);
  });

  it('separates what is played from how it is played', () => {
    const a = phraseKey(DEFAULT_GENERATOR_PARAMS);
    expect(phraseKey({ ...DEFAULT_GENERATOR_PARAMS, bpm: 200, jitterMs: 50, swing: 1, lean: 1, drift: 1, flamMs: 40 })).toBe(a);
    expect(phraseKey({ ...DEFAULT_GENERATOR_PARAMS, seed: 9 })).not.toBe(a);
    expect(phraseKey({ ...DEFAULT_GENERATOR_PARAMS, feel: 'lilt' })).not.toBe(a);
    expect(phraseSeconds([{ beat: 7.5, pitch: 'D3', accent: 0, duration: 2 }], 60)).toBeCloseTo(8.5);
  });
});
