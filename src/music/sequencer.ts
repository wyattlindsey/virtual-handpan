/**
 * Plays a phrase against the audio clock with a short lookahead. Notes are
 * kept in beats and humanized as they are scheduled, so tempo, jitter,
 * swing and velocity settings take effect within a fraction of a second
 * while a phrase is playing; only what the phrase contains needs a restart.
 */
import type { AudioEngine } from '../audio/engine';
import type { FieldRole, Instrument } from '../audio/instrument';
import { type GeneratedNote, type HumanizeParams, type HumanizedNote, humanizeNote, humanizeRng } from './generator';

/** A note in seconds, as humanize() produces for previews and tests. */
export interface ScheduledNote {
  time: number;
  pitch: string;
  velocity: number;
  duration: number;
}

export interface SequencerCallbacks {
  /** Fired on the JS clock at the moment the note is heard. */
  onNote?: (note: GeneratedNote, index: number, velocity: number) => void;
  onEnd?: () => void;
}

const LOOKAHEAD = 0.18;
const TICK_MS = 30;
const START_DELAY = 0.12;

export class Sequencer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private visualTimers = new Set<ReturnType<typeof setTimeout>>();
  private callbacks: SequencerCallbacks = {};

  constructor(
    private readonly engine: AudioEngine,
    /** The instrument may not exist until the first user gesture. */
    private readonly instrument: () => Instrument | null,
    private readonly roleFor: (pitch: string) => FieldRole,
  ) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  /**
   * Start a phrase. `params` is read on every tick so changes apply live;
   * `seed` fixes the humanization so replaying gives the same feel.
   */
  play(notes: GeneratedNote[], params: () => HumanizeParams, seed: number, callbacks: SequencerCallbacks = {}): void {
    this.stop(false);
    this.callbacks = callbacks;
    if (notes.length === 0) { callbacks.onEnd?.(); return; }
    const sorted = [...notes].sort((a, b) => a.beat - b.beat);
    const rng = humanizeRng(seed);
    const last = sorted[sorted.length - 1]!;
    const endBeat = last.beat + Math.min(last.duration, 1);

    // beat -> time mapping, re-anchored whenever the tempo changes.
    let anchorBeat = 0;
    let anchorTime = this.engine.now + START_DELAY;
    let bpm = params().bpm;
    const timeOf = (beat: number) => anchorTime + (beat - anchorBeat) * (60 / bpm);

    let next = 0;
    let peeked: HumanizedNote | null = null;

    const tick = () => {
      const now = this.engine.now;
      const p = params();
      if (p.bpm !== bpm) {
        anchorBeat += (now - anchorTime) * (bpm / 60);
        anchorTime = now;
        bpm = p.bpm;
      }
      while (next < sorted.length) {
        const n = sorted[next]!;
        peeked ??= humanizeNote(n, p, rng);
        const t = timeOf(peeked.beat);
        if (t >= now + LOOKAHEAD) break;
        const at = Math.max(t, now);
        const velocity = peeked.velocity;
        this.instrument()?.noteOn(n.pitch, velocity, at, this.roleFor(n.pitch));
        if (callbacks.onNote) {
          const idx = next;
          const timer = setTimeout(() => { this.visualTimers.delete(timer); callbacks.onNote?.(n, idx, velocity); }, Math.max(0, (at - now) * 1000));
          this.visualTimers.add(timer);
        }
        next++;
        peeked = null;
      }
      if (next >= sorted.length && now >= timeOf(endBeat)) this.stop(true, false);
    };

    tick();
    this.timer = setInterval(tick, TICK_MS);
  }

  /** Stop playback. Damps sounding notes unless the phrase ended naturally. No-op when idle. */
  stop(notify = true, damp = true): void {
    const wasPlaying = this.timer !== null;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    for (const t of this.visualTimers) clearTimeout(t);
    this.visualTimers.clear();
    if (damp && wasPlaying) this.instrument()?.allNotesOff(0.08);
    const cb = this.callbacks.onEnd;
    this.callbacks = {};
    if (notify && wasPlaying) cb?.();
  }
}
