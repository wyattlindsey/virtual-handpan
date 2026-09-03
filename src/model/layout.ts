/**
 * A handpan layout: which pitch is the ding, which pitches sit in the ring of
 * top tone fields, and which are on the underside.
 *
 * Positions are derived from the standard zigzag arrangement (lowest tone
 * field at 6 o'clock, then alternating sides while ascending toward 12
 * o'clock). Each field can later carry an explicit position override; the
 * derived positions are the defaults.
 */
import { comparePitches, midiFromPitch, transposePitch } from './pitch';

/** Which side of the pan the second-lowest top field sits on. */
export type Zigzag = 'left' | 'right';

export interface Layout {
  name: string;
  /** Central note. */
  ding: string;
  /** Top tone fields, ascending. */
  top: string[];
  /** Bottom (underside) notes, ascending. */
  bottom: string[];
  zigzag: Zigzag;
}

export type FieldSide = 'ding' | 'top' | 'bottom';

export interface FieldPosition {
  /** Stable id: "ding", "top-0", "bottom-2", ... */
  id: string;
  pitch: string;
  side: FieldSide;
  /** Degrees clockwise from 12 o'clock, in the top-down frame. */
  angleDeg: number;
  /** Distance from the centre as a fraction of the shell radius. */
  radius: number;
  /** Field size relative to a nominal tone field (lower pitches are larger). */
  size: number;
}

export interface NoteSpec {
  pitch: string;
  bottom?: boolean;
}

/** Build a layout from a bag of notes: the lowest top-side note becomes the ding. */
export function layoutFromNotes(name: string, notes: NoteSpec[], zigzag: Zigzag = 'left'): Layout {
  const topSide = notes.filter((n) => !n.bottom).map((n) => n.pitch).sort(comparePitches);
  const bottom = notes.filter((n) => n.bottom).map((n) => n.pitch).sort(comparePitches);
  const [ding, ...top] = topSide;
  if (!ding) throw new Error(`Layout "${name}" needs at least one top-side note`);
  return { name, ding, top, bottom, zigzag };
}

/** Every pitch on the instrument, ascending, with duplicates removed. */
export function layoutPitches(layout: Layout): string[] {
  return [...new Set([layout.ding, ...layout.top, ...layout.bottom])].sort(comparePitches);
}

export function transposeLayout(layout: Layout, semitones: number): Layout {
  return {
    ...layout,
    ding: transposePitch(layout.ding, semitones),
    top: layout.top.map((p) => transposePitch(p, semitones)),
    bottom: layout.bottom.map((p) => transposePitch(p, semitones)),
  };
}

/**
 * Ring angles for n fields in zigzag order. Index 0 is at 6 o'clock (180°);
 * odd indices step away on the zigzag side, even indices on the other, so the
 * highest field ends nearest 12 o'clock. Slots are evenly spaced.
 */
export function ringAngles(n: number, zigzag: Zigzag = 'left'): number[] {
  if (n <= 0) return [];
  const step = 360 / n;
  // Clockwise from 12 o'clock, so "left" (9 o'clock) is 270°, i.e. increasing angle from 180°.
  const sign = zigzag === 'left' ? 1 : -1;
  const angles: number[] = [];
  for (let k = 0; k < n; k++) {
    const hops = Math.ceil(k / 2);
    const dir = k % 2 === 1 ? sign : -sign;
    angles.push(((180 + dir * hops * step) % 360 + 360) % 360);
  }
  return angles;
}

/** Relative field size by pitch: roughly 1.1 for A3, 0.75 for E5. */
export function fieldSizeForPitch(pitch: string): number {
  const midi = midiFromPitch(pitch);
  return clamp(1.25 - (midi - 50) * 0.02, 0.6, 1.15);
}

export function dingPosition(layout: Layout): FieldPosition {
  return {
    id: 'ding', pitch: layout.ding, side: 'ding', angleDeg: 0, radius: 0,
    size: clamp(fieldSizeForPitch(layout.ding) * 1.35, 1.2, 1.6),
  };
}

export function topFieldPositions(layout: Layout): FieldPosition[] {
  const angles = ringAngles(layout.top.length, layout.zigzag);
  return layout.top.map((pitch, i) => ({
    id: `top-${i}`, pitch, side: 'top', angleDeg: angles[i]!, radius: 0.62,
    size: fieldSizeForPitch(pitch),
  }));
}

/**
 * Bottom fields in the top-down frame (as if seen through the shell). The
 * underside view mirrors these. They sit further out than the top ring and
 * start half a slot off 6 o'clock so they fall between top fields.
 */
export function bottomFieldPositions(layout: Layout): FieldPosition[] {
  const n = layout.bottom.length;
  const angles = ringAngles(n, layout.zigzag);
  const offset = n > 0 ? 180 / Math.max(n, 2) : 0;
  return layout.bottom.map((pitch, i) => ({
    id: `bottom-${i}`, pitch, side: 'bottom', angleDeg: (angles[i]! + offset) % 360, radius: 0.66,
    size: fieldSizeForPitch(pitch) * 0.85,
  }));
}

export function allFieldPositions(layout: Layout): FieldPosition[] {
  return [dingPosition(layout), ...topFieldPositions(layout), ...bottomFieldPositions(layout)];
}

/** Cartesian offset for a field, with +y downward (SVG convention), in shell-radius units. */
export function fieldXY(pos: FieldPosition): { x: number; y: number } {
  const rad = (pos.angleDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * pos.radius, y: -Math.cos(rad) * pos.radius };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
