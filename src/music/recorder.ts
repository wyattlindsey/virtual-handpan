/**
 * Capture what the player does on the pan as a phrase: every strike with its
 * audio-clock time, pitch and velocity. Recordings play back through the
 * sequencer and train the learned mode.
 */
import { comparePitches } from '../model/pitch';
import type { GeneratedNote } from './generator';
import { DEFAULT_GENERATOR_PARAMS } from './generator';

export interface RecordedNote {
  /** Seconds from the first strike. */
  time: number;
  /** A pitch name, or "#tak" / "#slap" for an unpitched stroke. */
  pitch: string;
  velocity: number;
}

/** How a percussion stroke is written in a recording. */
export function percussionPitch(kind: 'tak' | 'slap'): string {
  return `#${kind}`;
}

export interface Recording {
  id: string;
  name: string;
  createdAt: string;
  /** Tempo the player had set, used to express the timing in beats. */
  bpm: number;
  /** Every pitch on the instrument at the time, ascending, ding first. */
  pitches: string[];
  notes: RecordedNote[];
}

export class Recorder {
  private startAt: number | null = null;
  private notes: RecordedNote[] = [];

  get recording(): boolean {
    return this.startAt !== null;
  }

  get count(): number {
    return this.notes.length;
  }

  start(): void {
    this.startAt = null;
    this.notes = [];
    // The clock starts at the first strike so leading silence is dropped.
    this.startAt = -1;
  }

  add(pitch: string, velocity: number, now: number): void {
    if (this.startAt === null) return;
    if (this.startAt < 0) this.startAt = now;
    this.notes.push({ time: Math.max(0, now - this.startAt), pitch, velocity });
  }

  /** Stop and return the recording, or null when nothing was played. */
  stop(bpm: number, pitches: string[], name: string): Recording | null {
    const notes = this.notes;
    this.startAt = null;
    this.notes = [];
    if (notes.length === 0) return null;
    return {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name,
      createdAt: new Date().toISOString(),
      bpm,
      pitches: [...new Set(pitches)].sort(comparePitches),
      notes,
    };
  }
}

/** A recording as a phrase in beats at its own tempo, velocities kept. */
export function recordingToPhrase(r: Recording): GeneratedNote[] {
  const bps = r.bpm / 60;
  return r.notes.map((n, i) => {
    const next = r.notes[i + 1];
    const stroke = n.pitch === '#tak' || n.pitch === '#slap' ? n.pitch.slice(1) as 'tak' | 'slap' : undefined;
    return {
      beat: n.time * bps,
      pitch: stroke ? '' : n.pitch,
      accent: n.velocity - DEFAULT_GENERATOR_PARAMS.velocity,
      duration: next ? Math.max(0.25, (next.time - n.time) * bps) : 1,
      role: stroke ? 'groove' : 'melody',
      ...(stroke ? { kind: stroke } : {}),
    };
  });
}

/** Total length of a recording in seconds. */
export function recordingSeconds(r: Recording): number {
  const last = r.notes[r.notes.length - 1];
  return last ? last.time + 1 : 0;
}

export function isRecording(v: unknown): v is Recording {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Recording;
  return typeof r.id === 'string' && typeof r.bpm === 'number' && Array.isArray(r.pitches) && Array.isArray(r.notes)
    && r.notes.every((n) => typeof n.time === 'number' && typeof n.pitch === 'string' && typeof n.velocity === 'number');
}
