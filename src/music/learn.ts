/**
 * A small statistical model of the player's own phrases: bigrams over scale
 * step intervals and over note durations, trained on recordings, sampled
 * to generate new phrases in the same style. Runs entirely in the page.
 */
import { type Feel, accentAt, barBeats } from './feels';
import type { GeneratedNote } from './generator';
import type { Recording } from './recorder';
import type { Rng } from './rng';

type Counts = Map<number, number>;

export interface NgramModel {
  /** previous interval -> next interval -> count */
  intervals: Map<number, Counts>;
  /** previous duration (eighths) -> next duration -> count */
  durations: Map<number, Counts>;
  intervalMarginal: Counts;
  durationMarginal: Counts;
  /** Scale-step positions relative to the ding that phrases started on. */
  starts: Counts;
  noteCount: number;
  recordingCount: number;
}

function bump(m: Counts, k: number): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function bump2(m: Map<number, Counts>, ctx: number, k: number): void {
  let c = m.get(ctx);
  if (!c) { c = new Map(); m.set(ctx, c); }
  bump(c, k);
}

/** Durations snap to eighths between one eighth and a whole bar of four. */
export function quantizeEighths(beats: number): number {
  return Math.min(16, Math.max(1, Math.round(beats * 2)));
}

export function trainModel(recordings: readonly Recording[]): NgramModel {
  const model: NgramModel = {
    intervals: new Map(), durations: new Map(), intervalMarginal: new Map(), durationMarginal: new Map(),
    starts: new Map(), noteCount: 0, recordingCount: 0,
  };
  for (const r of recordings) {
    if (r.notes.length < 2) continue;
    model.recordingCount++;
    const index = new Map(r.pitches.map((p, i) => [p, i]));
    const bps = r.bpm / 60;
    // Collapse strikes closer than a 32nd into one event (dyads count as one melodic step).
    const events: { idx: number; beat: number }[] = [];
    for (const n of r.notes) {
      const idx = index.get(n.pitch);
      if (idx === undefined) continue;
      const beat = n.time * bps;
      const last = events[events.length - 1];
      if (last && beat - last.beat < 0.12) continue;
      events.push({ idx, beat });
    }
    if (events.length < 2) continue;
    bump(model.starts, events[0]!.idx);
    let prevInterval: number | null = null;
    let prevDur: number | null = null;
    for (let i = 1; i < events.length; i++) {
      const interval = events[i]!.idx - events[i - 1]!.idx;
      const dur = quantizeEighths(events[i]!.beat - events[i - 1]!.beat);
      bump(model.intervalMarginal, interval);
      bump(model.durationMarginal, dur);
      if (prevInterval !== null) bump2(model.intervals, prevInterval, interval);
      if (prevDur !== null) bump2(model.durations, prevDur, dur);
      prevInterval = interval;
      prevDur = dur;
      model.noteCount++;
    }
  }
  return model;
}

function sample(counts: Counts | undefined, fallback: Counts, rng: Rng): number | null {
  const src = counts && counts.size > 0 ? counts : fallback;
  if (src.size === 0) return null;
  const keys = [...src.keys()];
  const weights = keys.map((k) => src.get(k)!);
  return keys[rng.weighted(weights)]!;
}

/**
 * Generate a phrase from the model over `bars` bars of the feel. Pitches are
 * the instrument's notes with the ding first; intervals are scale steps
 * over that list, reflected at the ends of the range.
 */
export function generateFromModel(model: NgramModel, pitches: string[], bars: number, feel: Feel, rng: Rng): GeneratedNote[] {
  const notes: GeneratedNote[] = [];
  const n = pitches.length;
  if (n === 0 || model.noteCount === 0) return notes;
  const total = bars * barBeats(feel);
  let idx = Math.min(n - 1, sample(model.starts, model.starts, rng) ?? 0);
  let beat = 0;
  let prevInterval: number | null = null;
  let prevDur: number | null = null;
  while (beat < total) {
    const beatInBar = beat % barBeats(feel);
    const durE: number = sample(prevDur === null ? undefined : model.durations.get(prevDur), model.durationMarginal, rng) ?? 2;
    const dur = durE / 2;
    notes.push({
      beat, pitch: pitches[idx]!, accent: accentAt(feel, beatInBar) + (idx === 0 ? 0.04 : 0),
      duration: Math.min(dur, total - beat), role: 'melody',
    });
    const interval: number = sample(prevInterval === null ? undefined : model.intervals.get(prevInterval), model.intervalMarginal, rng) ?? 0;
    let next = idx + interval;
    if (next < 0) next = -next;
    if (next > n - 1) next = 2 * (n - 1) - next;
    idx = Math.min(n - 1, Math.max(0, next));
    prevInterval = interval;
    prevDur = durE;
    beat += dur;
  }
  return notes;
}
