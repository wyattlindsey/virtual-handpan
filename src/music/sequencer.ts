/**
 * Plays a list of timed notes against the audio clock with a short lookahead,
 * so stopping is instant and UI callbacks land in step with what is heard.
 */
import type { AudioEngine } from '../audio/engine';
import type { FieldRole, Instrument } from '../audio/instrument';

export interface ScheduledNote {
  /** Seconds from the start of the phrase. */
  time: number;
  pitch: string;
  /** 0..1 */
  velocity: number;
  /** Seconds, informational. Handpan notes ring out on their own. */
  duration: number;
}

export interface SequencerCallbacks {
  /** Fired (on the JS clock) at the moment the note is heard. */
  onNote?: (note: ScheduledNote, index: number) => void;
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

  play(notes: ScheduledNote[], callbacks: SequencerCallbacks = {}): void {
    this.stop(false);
    this.callbacks = callbacks;
    if (notes.length === 0) { callbacks.onEnd?.(); return; }
    const sorted = [...notes].sort((a, b) => a.time - b.time);
    const startAt = this.engine.now + START_DELAY;
    const end = startAt + sorted[sorted.length - 1]!.time + 0.05;
    let next = 0;

    const tick = () => {
      const now = this.engine.now;
      while (next < sorted.length && startAt + sorted[next]!.time < now + LOOKAHEAD) {
        const n = sorted[next]!;
        const at = Math.max(startAt + n.time, now);
        this.instrument()?.noteOn(n.pitch, n.velocity, at, this.roleFor(n.pitch));
        if (callbacks.onNote) {
          const idx = next;
          const t = setTimeout(() => { this.visualTimers.delete(t); callbacks.onNote?.(n, idx); }, Math.max(0, (at - now) * 1000));
          this.visualTimers.add(t);
        }
        next++;
      }
      if (next >= sorted.length && now >= end) this.stop(true, false);
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
    if (notify) cb?.();
  }
}
