/**
 * The seam between the UI/generator and sound. Everything above this speaks
 * in pitch, velocity and audio-clock time. A synthesized voice implements it
 * today; a sampled instrument with velocity layers and round robin will
 * implement the same interface later.
 */
import type { FieldSide } from '../model/layout';

export type FieldRole = FieldSide;

/** Unpitched strokes on the shell: the tak (fingertip click on the shoulder) and the slap (flat fingers). */
export type PercussionKind = 'tak' | 'slap';

export interface VoiceHandle {
  /** Damp the note early (a palm on the field). */
  damp(when?: number, fadeSeconds?: number): void;
}

export interface Instrument {
  readonly name: string;
  /**
   * Strike a note.
   * @param pitch canonical pitch name, e.g. "A3"
   * @param velocity 0..1
   * @param when AudioContext time in seconds; defaults to now
   * @param role where the field sits, for role-specific timbre
   */
  noteOn(pitch: string, velocity: number, when?: number, role?: FieldRole): VoiceHandle;
  /** An unpitched stroke on the shoulder or shell. */
  hit(kind: PercussionKind, velocity: number, when?: number): VoiceHandle;
  /** Fade out every sounding and scheduled note. */
  allNotesOff(fadeSeconds?: number): void;
  dispose(): void;
}
