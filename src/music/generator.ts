/**
 * Phrase generation.
 *
 * A phrase is produced in beats, then humanized into seconds: timing jitter,
 * velocity variation and swing are applied at that step so the same phrase
 * can be re-humanized without regenerating it.
 */
import type { Layout } from '../model/layout';
import { comparePitches } from '../model/pitch';
import { Rng } from './rng';
import type { ScheduledNote } from './sequencer';

export type GeneratorMode = 'scale' | 'random' | 'melodic';

export interface GeneratorParams {
  mode: GeneratorMode;
  /** Length in bars of 4/4 for random and melodic modes. */
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
  seed: number;
}

export const DEFAULT_GENERATOR_PARAMS: GeneratorParams = {
  mode: 'melodic',
  bars: 4,
  bpm: 84,
  jitterMs: 10,
  velocity: 0.72,
  velocityVariation: 0.1,
  restDensity: 0.18,
  swing: 0,
  seed: 1,
};

export interface GeneratedNote {
  /** Onset in beats from the phrase start. */
  beat: number;
  pitch: string;
  /** Offset from the mean velocity: positive on accents, negative on weak beats. */
  accent: number;
  /** Nominal length in beats. */
  duration: number;
}

/** The parameters the humanize layer reads; they may change while a phrase plays. */
export type HumanizeParams = Pick<GeneratorParams, 'bpm' | 'jitterMs' | 'velocity' | 'velocityVariation' | 'swing'>;

/** Parameters that change what a phrase contains, as opposed to how it is played. */
export function phraseKey(p: GeneratorParams): string {
  return `${p.mode}|${p.bars}|${p.restDensity}|${p.seed}`;
}

/** Pitches available to the generator: the ding first, then everything else ascending. */
export function generatorPitches(layout: Layout): string[] {
  const rest = [...new Set([...layout.top, ...layout.bottom])]
    .filter((p) => p !== layout.ding)
    .sort(comparePitches);
  return [layout.ding, ...rest];
}

export function generatePhrase(layout: Layout, params: GeneratorParams): GeneratedNote[] {
  const rng = new Rng(params.seed);
  const pitches = generatorPitches(layout);
  switch (params.mode) {
    case 'scale': return scalePhrase(layout);
    case 'random': return randomPhrase(pitches, params, rng);
    case 'melodic': return melodicPhrase(pitches, params, rng);
  }
}

/** Ding, then up the top ring, then the bottom notes, then back down, ending on the ding. */
function scalePhrase(layout: Layout): GeneratedNote[] {
  const up = [layout.ding, ...layout.top, ...layout.bottom];
  const down = [...up].reverse().slice(1);
  const seq = [...up, ...down];
  const notes: GeneratedNote[] = [];
  seq.forEach((pitch, i) => {
    const last = i === seq.length - 1;
    notes.push({
      beat: i * 0.5,
      pitch,
      accent: pitch === layout.ding ? 0.08 : 0,
      duration: last ? 2 : 0.5,
    });
  });
  return notes;
}

/** Uniform draws on an eighth-note grid, as in the Isthmus randomizer, plus rests. */
function randomPhrase(pitches: string[], params: GeneratorParams, rng: Rng): GeneratedNote[] {
  const slots = params.bars * 8;
  const notes: GeneratedNote[] = [];
  for (let s = 0; s < slots; s++) {
    if (rng.chance(params.restDensity)) continue;
    notes.push({ beat: s * 0.5, pitch: rng.pick(pitches), accent: accent(s), duration: 0.5 });
  }
  return notes;
}

/** Rhythmic cells for one bar of 4/4, as lists of durations in beats. */
const CELLS: readonly (readonly number[])[] = [
  [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  [1, 0.5, 0.5, 1, 0.5, 0.5],
  [0.5, 0.5, 1, 0.5, 0.5, 1],
  [1, 1, 0.5, 0.5, 1],
  [0.5, 1, 0.5, 0.5, 1, 0.5],
  [1.5, 0.5, 1, 0.5, 0.5],
  [0.5, 0.5, 0.5, 0.5, 1, 1],
  [0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
];

/**
 * A step-biased random walk over the scale: small intervals are likely, the
 * walk is pulled back toward the middle at the extremes, phrases start and
 * end near the ding, and downbeats often return to the ding as a drone.
 */
function melodicPhrase(pitches: string[], params: GeneratorParams, rng: Rng): GeneratedNote[] {
  const n = pitches.length;
  const notes: GeneratedNote[] = [];
  if (n === 0) return notes;
  // Index 0 is the ding; 1..n-1 ascend. Work in "scale step" space where the
  // ding sits below the ring.
  let current = Math.min(1, n - 1);
  const mid = (n - 1) / 2;

  for (let bar = 0; bar < params.bars; bar++) {
    const cell = rng.pick(CELLS);
    let beatInBar = 0;
    const lastBar = bar === params.bars - 1;
    const phraseEnd = lastBar || (bar % 2 === 1);
    for (let c = 0; c < cell.length; c++) {
      const dur = cell[c]!;
      const beat = bar * 4 + beatInBar;
      const isDownbeat = beatInBar === 0;
      const isLast = c === cell.length - 1;
      beatInBar += dur;

      // Rests: never on the downbeat, more likely on short notes.
      if (!isDownbeat && rng.chance(params.restDensity * (dur < 0.5 ? 1.4 : 1))) continue;

      let idx: number;
      if (isDownbeat && rng.chance(0.4)) {
        idx = 0; // ding drone on the one
      } else if (isLast && phraseEnd && rng.chance(0.7)) {
        idx = rng.chance(0.6) ? 0 : Math.min(1, n - 1); // resolve to ding or lowest ring note
      } else {
        const weights: number[] = [];
        for (let i = 0; i < n; i++) {
          const d = Math.abs(i - current);
          let w = d === 0 ? 0.5 : d === 1 ? 3 : d === 2 ? 1.7 : d === 3 ? 0.9 : d === 4 ? 0.45 : 0.15;
          // Gravity toward the centre of the range.
          const away = Math.sign(i - current) === Math.sign(current - mid) && Math.abs(current - mid) > mid * 0.6;
          if (away && d > 0) w *= 0.45;
          // The ding is a destination in its own right.
          if (i === 0) w *= 1.25;
          weights.push(w);
        }
        idx = rng.weighted(weights);
      }
      current = idx;
      const pitch = pitches[idx]!;
      const acc = accent(Math.round(beat * 2)) + (idx === 0 && isDownbeat ? 0.08 : 0) + (dur >= 1 ? 0.03 : 0);
      notes.push({ beat, pitch, accent: acc, duration: isLast && lastBar ? 2 : dur });
    }
  }
  return notes;
}

/** Downbeats a little louder, offbeats a little softer. `slot` is in eighth notes. */
function accent(slot: number): number {
  const inBar = slot % 8;
  if (inBar === 0) return 0.08;
  if (inBar === 4) return 0.04;
  if (inBar % 2 === 1) return -0.05;
  return 0;
}

export interface HumanizedNote {
  /** Onset in beats including swing and jitter. */
  beat: number;
  velocity: number;
}

/**
 * The human layer for one note: swing on offbeat eighths, gaussian timing
 * jitter clamped to three sigma (expressed in beats at the current tempo),
 * and velocity around the mean with gaussian variation. Draws two numbers
 * from the RNG per note so results are reproducible for a seed.
 */
export function humanizeNote(n: GeneratedNote, params: HumanizeParams, rng: Rng): HumanizedNote {
  let beat = n.beat;
  const frac = beat % 1;
  if (Math.abs(frac - 0.5) < 1e-6) beat += params.swing * (1 / 6);
  const jitterBeats = (params.jitterMs / 1000) * (params.bpm / 60);
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
  const last = notes[notes.length - 1]!;
  return (last.beat + Math.min(last.duration, 1)) * (60 / bpm);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
