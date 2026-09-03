/**
 * Phrase generation.
 *
 * A phrase is produced in beats, then humanized into seconds note by note
 * as the sequencer schedules it: timing jitter, swing, lean, drift, flams
 * and velocity variation live there, so the same phrase can be re-felt
 * without regenerating it. Velocity follows the meter through the feel's
 * accents, so sampled layers respond to musical position.
 */
import { type Layout, topFieldPositions } from '../model/layout';
import { comparePitches, midiFromPitch } from '../model/pitch';
import { type Feel, type FeelId, accentAt, barBeats, getFeel } from './feels';
import { type NgramModel, generateFromModel } from './learn';
import { Rng } from './rng';
import type { ScheduledNote } from './sequencer';
import { type TasteWeights, cellWeights } from './taste';

export type GeneratorMode = 'scale' | 'random' | 'melodic' | 'learned';
export type Hand = 'L' | 'R';

export interface GeneratorParams {
  mode: GeneratorMode;
  feel: FeelId;
  /** Length in bars for random, melodic and learned modes. */
  bars: number;
  bpm: number;
  /** Standard deviation of onset timing offset, in milliseconds. */
  jitterMs: number;
  /** Mean velocity 0..1. */
  velocity: number;
  /** Standard deviation of velocity. */
  velocityVariation: number;
  /** Probability that a slot is silent, 0..1. */
  restDensity: number;
  /** 0 = straight eighths, 1 = triplet swing. */
  swing: number;
  /** Probability a melody note gets a second note under it, 0..1. */
  dyads: number;
  /** Density of the grooving hand's ostinato on the ding and low fields, 0..1. */
  groove: number;
  /** Delay of the trailing note of a dyad, in milliseconds. */
  flamMs: number;
  /** Offbeats late (positive) or early (negative), -1..1. */
  lean: number;
  /** Slow push and pull against the grid, 0..1. */
  drift: number;
  seed: number;
  /** Bumped whenever taste weights change so the phrase regenerates. */
  tasteVersion: number;
}

export const DEFAULT_GENERATOR_PARAMS: GeneratorParams = {
  mode: 'melodic',
  feel: 'straight',
  bars: 8,
  bpm: 84,
  jitterMs: 10,
  velocity: 0.72,
  velocityVariation: 0.1,
  restDensity: 0.18,
  swing: 0,
  dyads: 0.25,
  groove: 0.5,
  flamMs: 18,
  lean: 0.15,
  drift: 0.2,
  seed: 1,
  tasteVersion: 0,
};

export interface GeneratedNote {
  /** Onset in beats from the phrase start. */
  beat: number;
  pitch: string;
  /** Offset from the mean velocity: positive on accents, negative on weak beats. */
  accent: number;
  /** Nominal length in beats. */
  duration: number;
  hand?: Hand;
  /** The trailing note of a dyad; humanize delays it by the flam. */
  partner?: boolean;
  role?: 'melody' | 'groove';
}

/** The parameters the humanize layer reads; they may change while a phrase plays. */
export type HumanizeParams = Pick<GeneratorParams, 'bpm' | 'jitterMs' | 'velocity' | 'velocityVariation' | 'swing' | 'flamMs' | 'lean' | 'drift' | 'seed'>;

/** Parameters that change what a phrase contains, as opposed to how it is played. */
export function phraseKey(p: GeneratorParams): string {
  return [p.mode, p.feel, p.bars, p.restDensity, p.dyads, p.groove, p.seed, p.tasteVersion].join('|');
}

/** Pitches available to the generator: the ding first, then everything else ascending. */
export function generatorPitches(layout: Layout): string[] {
  const rest = [...new Set([...layout.top, ...layout.bottom])]
    .filter((p) => p !== layout.ding)
    .sort(comparePitches);
  return [layout.ding, ...rest];
}

export interface GenerateOptions {
  taste?: TasteWeights;
  /** Model for learned mode; without one it falls back to melodic. */
  model?: NgramModel | null;
}

export interface GeneratedPhrase {
  notes: GeneratedNote[];
  /** Indices of the feel's cells used, for taste feedback. */
  cellsUsed: number[];
  hadDyads: boolean;
}

export function generatePhrase(layout: Layout, params: GeneratorParams, options: GenerateOptions = {}): GeneratedNote[] {
  return generatePhraseDetailed(layout, params, options).notes;
}

export function generatePhraseDetailed(layout: Layout, params: GeneratorParams, options: GenerateOptions = {}): GeneratedPhrase {
  const rng = new Rng(params.seed);
  const pitches = generatorPitches(layout);
  const feel = getFeel(params.feel);
  switch (params.mode) {
    case 'scale': return { notes: scalePhrase(layout), cellsUsed: [], hadDyads: false };
    case 'random': return { notes: randomPhrase(pitches, feel, params, rng), cellsUsed: [], hadDyads: false };
    case 'learned': {
      if (options.model && options.model.noteCount > 0) {
        return { notes: generateFromModel(options.model, pitches, params.bars, feel, rng), cellsUsed: [], hadDyads: false };
      }
      return melodicPhrase(layout, pitches, feel, params, rng, options.taste);
    }
    case 'melodic': return melodicPhrase(layout, pitches, feel, params, rng, options.taste);
  }
}

/** Ding, then up the top ring, then the bottom notes, then back down, ending on the ding. */
function scalePhrase(layout: Layout): GeneratedNote[] {
  const up = [layout.ding, ...layout.top, ...layout.bottom];
  const down = [...up].reverse().slice(1);
  const seq = [...up, ...down];
  return seq.map((pitch, i) => ({
    beat: i * 0.5,
    pitch,
    accent: pitch === layout.ding ? 0.08 : 0,
    duration: i === seq.length - 1 ? 2 : 0.5,
    role: 'melody',
  }));
}

/** Uniform draws on the feel's eighth grid, as in the Isthmus randomizer, plus rests. */
function randomPhrase(pitches: string[], feel: Feel, params: GeneratorParams, rng: Rng): GeneratedNote[] {
  const notes: GeneratedNote[] = [];
  for (let s = 0; s < params.bars * feel.slots; s++) {
    if (rng.chance(params.restDensity)) continue;
    const beat = s * 0.5;
    notes.push({ beat, pitch: rng.pick(pitches), accent: accentAt(feel, beat % barBeats(feel)), duration: 0.5, role: 'melody' });
  }
  return notes;
}

/** Which hand a pitch naturally falls under: left side of the ring, right side, or either. */
export function handMap(layout: Layout, pitches: string[]): (Hand | null)[] {
  const byPitch = new Map<string, Hand | null>();
  for (const f of topFieldPositions(layout)) {
    const a = f.angleDeg;
    byPitch.set(f.pitch, a > 180.5 ? 'L' : a > 0.5 && a < 179.5 ? 'R' : null);
  }
  return pitches.map((p) => (p === layout.ding ? null : byPitch.get(p) ?? null));
}

/** A second note to strike with a melody note: the ding, an octave, a fifth, a fourth, a third or a sixth. */
export function pickPartner(idx: number, midis: number[], rng: Rng): number | null {
  const candidates: { j: number; w: number }[] = [];
  for (let j = 0; j < midis.length; j++) {
    if (j === idx) continue;
    const d = Math.abs(midis[j]! - midis[idx]!);
    let w = 0;
    if (j === 0) w = 3;
    else if (d === 12) w = 3;
    else if (d === 7) w = 2.5;
    else if (d === 5) w = 1.5;
    else if (d === 3 || d === 4) w = 1.5;
    else if (d === 8 || d === 9) w = 1;
    if (w > 0) candidates.push({ j, w });
  }
  if (candidates.length === 0) return null;
  return candidates[rng.weighted(candidates.map((c) => c.w))]!.j;
}

interface BarEvent {
  beatInBar: number;
  idx: number;
  dur: number;
}

const PHRASE_BARS = 4;

/**
 * A step-biased random walk over the scale played by two hands: small
 * intervals are likely, fast notes alternate hands, the walk is pulled back
 * toward the middle at the extremes, downbeats often return to the ding,
 * phrases breathe and resolve, two-bar motifs come back shifted a step, a
 * grooving hand keeps an ostinato under it, and dyads land with a flam.
 */
function melodicPhrase(layout: Layout, pitches: string[], feel: Feel, params: GeneratorParams, rng: Rng, taste?: TasteWeights): GeneratedPhrase {
  const n = pitches.length;
  const notes: GeneratedNote[] = [];
  const cellsUsed: number[] = [];
  let hadDyads = false;
  if (n === 0) return { notes, cellsUsed, hadDyads };
  const beatsPerBar = barBeats(feel);
  const hands = handMap(layout, pitches);
  const midis = pitches.map(midiFromPitch);
  const weights = cellWeights(taste, feel);
  const dyadChance = Math.min(1, Math.max(0, params.dyads + (taste?.dyadBias ?? 0)));
  const mid = (n - 1) / 2;

  let current = Math.min(1, n - 1);
  let prevHand: Hand | null = null;
  let prevFast = false;
  const history: BarEvent[][] = [];
  const replay: { events: BarEvent[]; shift: number }[] = [];

  const chooseIndex = (isDownbeat: boolean, resolve: boolean): number => {
    if (isDownbeat && rng.chance(0.4)) return 0;
    if (resolve) return rng.chance(0.6) ? 0 : Math.min(1, n - 1);
    const w: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i - current);
      let x = d === 0 ? 0.5 : d === 1 ? 3 : d === 2 ? 1.7 : d === 3 ? 0.9 : d === 4 ? 0.45 : 0.15;
      const away = Math.sign(i - current) === Math.sign(current - mid) && Math.abs(current - mid) > mid * 0.6;
      if (away && d > 0) x *= 0.45;
      if (i === 0) x *= 1.25;
      // Fast runs alternate hands.
      if (prevFast && prevHand && hands[i] === prevHand) x *= 0.45;
      w.push(x);
    }
    return rng.weighted(w);
  };

  const emit = (bar: number, ev: BarEvent, isDownbeat: boolean, arc: number) => {
    const beat = bar * beatsPerBar + ev.beatInBar;
    const accent = accentAt(feel, ev.beatInBar) + (ev.idx === 0 && isDownbeat ? 0.08 : 0) + (ev.dur >= 1 ? 0.03 : 0) + arc;
    const hand: Hand = hands[ev.idx] ?? (prevHand === 'L' ? 'R' : 'L');
    notes.push({ beat, pitch: pitches[ev.idx]!, accent, duration: ev.dur, hand, role: 'melody' });
    if (ev.dur >= 0.5 && rng.chance(dyadChance)) {
      const p = pickPartner(ev.idx, midis, rng);
      if (p !== null) {
        hadDyads = true;
        notes.push({ beat, pitch: pitches[p]!, accent: accent - 0.06, duration: ev.dur, hand: hand === 'L' ? 'R' : 'L', partner: true, role: 'melody' });
      }
    }
    prevHand = hand;
    prevFast = ev.dur <= 0.5;
    current = ev.idx;
  };

  for (let bar = 0; bar < params.bars; bar++) {
    const posInPhrase = bar % PHRASE_BARS;
    const lastBar = bar === params.bars - 1;
    const phraseEnd = posInPhrase === PHRASE_BARS - 1 || lastBar;
    // Dynamics rise into the middle of the phrase and settle at its end.
    const arc = 0.05 * Math.sin((Math.PI * (posInPhrase + 0.5)) / PHRASE_BARS) - 0.02;

    // Bring back the last two bars, shifted a step, at the start of a phrase's second half.
    if (posInPhrase === 2 && replay.length === 0 && history.length >= 2 && !lastBar && rng.chance(0.5)) {
      const shift = rng.pick([-1, 0, 0, 1]);
      replay.push({ events: history[history.length - 2]!, shift }, { events: history[history.length - 1]!, shift });
    }

    const events: BarEvent[] = [];
    const queued = replay.shift();
    if (queued) {
      for (const ev of queued.events) {
        const idx = Math.min(n - 1, Math.max(0, ev.idx + queued.shift));
        const e = { ...ev, idx };
        emit(bar, e, ev.beatInBar === 0, arc);
        events.push(e);
      }
    } else {
      // Phrase ends favour sparser cells so there is room to breathe.
      const w = feel.cells.map((c, i) => weights[i]! * (phraseEnd ? 1 / c.length : 1));
      const cellIndex = rng.weighted(w);
      cellsUsed.push(cellIndex);
      const cell = feel.cells[cellIndex]!;
      let beatInBar = 0;
      for (let c = 0; c < cell.length; c++) {
        const dur = cell[c]!;
        const at = beatInBar;
        const isDownbeat = at === 0;
        const isLast = c === cell.length - 1;
        beatInBar += dur;
        if (!isDownbeat && rng.chance(params.restDensity * (dur < 0.5 ? 1.4 : 1))) continue;
        if (phraseEnd && isLast && !lastBar && rng.chance(0.35)) continue; // a breath
        const resolve = isLast && phraseEnd && rng.chance(0.7);
        const idx = chooseIndex(isDownbeat, resolve);
        const e: BarEvent = { beatInBar: at, idx, dur: isLast && lastBar ? 2 : dur };
        emit(bar, e, isDownbeat, arc);
        events.push(e);
      }
    }
    history.push(events);

    // The grooving hand: ding on the first groove slot, the lowest ring note on the others.
    feel.grooveSlots.forEach((slot, gi) => {
      if (!rng.chance(params.groove)) return;
      const beatInBar = slot / 2;
      const beat = bar * beatsPerBar + beatInBar;
      const idx = gi === 0 ? 0 : Math.min(1, n - 1);
      const pitch = pitches[idx]!;
      if (notes.some((x) => x.beat === beat && x.pitch === pitch)) return;
      notes.push({ beat, pitch, accent: accentAt(feel, beatInBar) - 0.12 + arc, duration: 0.5, hand: 'L', role: 'groove' });
    });
  }

  notes.sort((a, b) => a.beat - b.beat || (a.partner ? 1 : 0) - (b.partner ? 1 : 0));
  return { notes, cellsUsed, hadDyads };
}

export interface HumanizedNote {
  /** Onset in beats including swing, lean, drift, flam and jitter. */
  beat: number;
  velocity: number;
}

/**
 * The human layer for one note: swing and lean on offbeat eighths, a slow
 * drift against the grid, the flam on a dyad's trailing note, gaussian
 * timing jitter clamped to three sigma (all in beats at the current tempo),
 * and velocity around the mean with gaussian variation. Draws two numbers
 * from the RNG per note so results are reproducible for a seed.
 */
export function humanizeNote(n: GeneratedNote, params: HumanizeParams, rng: Rng): HumanizedNote {
  const bps = params.bpm / 60;
  let beat = n.beat;
  const frac = beat % 1;
  if (Math.abs(frac - 0.5) < 1e-6) beat += params.swing * (1 / 6) + params.lean * 0.012 * bps;
  if (n.partner) beat += (params.flamMs / 1000) * bps;
  if (params.drift > 0) {
    const phase = ((params.seed % 1000) / 1000) * Math.PI * 2;
    beat += params.drift * 0.05 * bps * Math.sin((Math.PI * 2 * n.beat) / 24 + phase);
  }
  const jitterBeats = (params.jitterMs / 1000) * bps;
  const j = clamp(rng.gaussian(), -3, 3) * jitterBeats;
  const v = clamp(rng.gaussian(), -2.5, 2.5) * params.velocityVariation;
  return {
    beat: Math.max(0, beat + j),
    velocity: clamp(params.velocity + n.accent + v, 0.08, 1),
  };
}

export function humanizeRng(seed: number): Rng {
  return new Rng(seed ^ 0x9e3779b9);
}

/**
 * Convert a whole phrase to seconds at a fixed tempo. The sequencer applies
 * humanizeNote live instead; this is for tests and previews.
 */
export function humanize(notes: GeneratedNote[], params: GeneratorParams, rng: Rng = humanizeRng(params.seed)): ScheduledNote[] {
  const secPerBeat = 60 / params.bpm;
  const out: ScheduledNote[] = notes.map((n) => {
    const h = humanizeNote(n, params, rng);
    return { time: h.beat * secPerBeat, pitch: n.pitch, velocity: h.velocity, duration: n.duration * secPerBeat };
  });
  return out.sort((a, b) => a.time - b.time);
}

/** Seconds a phrase lasts at the given tempo, with a little room for the last note. */
export function phraseSeconds(notes: GeneratedNote[], bpm: number): number {
  if (notes.length === 0) return 0;
  let end = 0;
  for (const n of notes) end = Math.max(end, n.beat + Math.min(n.duration, 1));
  return end * (60 / bpm);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
