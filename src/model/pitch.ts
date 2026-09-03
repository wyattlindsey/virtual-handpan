/**
 * Pitch names, MIDI numbers and frequencies.
 *
 * Canonical pitch strings use sharp spelling with a scientific octave, e.g.
 * "C#3". C4 is MIDI 60. Parsing accepts flats ("Bb3"), unicode accidentals
 * ("B♭3", "C♯3") and lowercase letters, and normalises to the canonical form.
 */

export const PITCH_CLASSES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export type PitchClass = (typeof PITCH_CLASSES)[number];

const FLAT_SPELLING: Record<PitchClass, string> = {
  C: 'C', 'C#': 'Db', D: 'D', 'D#': 'Eb', E: 'E', F: 'F',
  'F#': 'Gb', G: 'G', 'G#': 'Ab', A: 'A', 'A#': 'Bb', B: 'B',
};

const LETTER_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const PITCH_RE = /^\s*([A-Ga-g])\s*([#♯]|b|♭|)\s*(-?\d+)\s*$/;

export interface ParsedPitch {
  /** Canonical sharp-spelled pitch class. */
  pitchClass: PitchClass;
  /** Scientific octave number (C4 = middle C). */
  octave: number;
}

export function parsePitch(name: string): ParsedPitch {
  const m = PITCH_RE.exec(name);
  if (!m) throw new Error(`Invalid pitch name: "${name}"`);
  const letter = m[1]!.toUpperCase();
  const accidental = m[2]!;
  let octave = Number(m[3]);
  let semitone = LETTER_SEMITONE[letter]!;
  if (accidental === '#' || accidental === '♯') semitone += 1;
  if (accidental === 'b' || accidental === '♭') semitone -= 1;
  // Cb4 is B3, B#3 is C4: carry the octave with the wrap.
  if (semitone < 0) { semitone += 12; octave -= 1; }
  if (semitone > 11) { semitone -= 12; octave += 1; }
  return { pitchClass: PITCH_CLASSES[semitone]!, octave };
}

export function isValidPitch(name: string): boolean {
  return PITCH_RE.test(name);
}

/** MIDI note number, with C4 = 60. */
export function midiFromPitch(name: string): number {
  const { pitchClass, octave } = parsePitch(name);
  return 12 * (octave + 1) + PITCH_CLASSES.indexOf(pitchClass);
}

export type Spelling = 'sharp' | 'flat';

export function pitchFromMidi(midi: number, spelling: Spelling = 'sharp'): string {
  if (!Number.isInteger(midi)) throw new Error(`MIDI number must be an integer: ${midi}`);
  const pc = PITCH_CLASSES[((midi % 12) + 12) % 12]!;
  const octave = Math.floor(midi / 12) - 1;
  const name = spelling === 'flat' ? FLAT_SPELLING[pc] : pc;
  return `${name}${octave}`;
}

/** Normalise any accepted spelling to the canonical sharp form. */
export function normalizePitch(name: string): string {
  return pitchFromMidi(midiFromPitch(name));
}

export function frequencyFromMidi(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyFromPitch(name: string, a4 = 440): number {
  return frequencyFromMidi(midiFromPitch(name), a4);
}

export function transposePitch(name: string, semitones: number): string {
  return pitchFromMidi(midiFromPitch(name) + semitones);
}

/** Sort comparator: ascending by pitch. */
export function comparePitches(a: string, b: string): number {
  return midiFromPitch(a) - midiFromPitch(b);
}

/** Display form with unicode accidentals, e.g. "C♯3" or "D♭3". */
export function formatPitch(name: string, spelling: Spelling = 'sharp'): string {
  const { pitchClass, octave } = parsePitch(name);
  const base = spelling === 'flat' ? FLAT_SPELLING[pitchClass] : pitchClass;
  return `${base.replace('#', '♯').replace(/b$/, '♭')}${octave}`;
}

/** Pitch class only, for labels that omit the octave. */
export function formatPitchClass(name: string, spelling: Spelling = 'sharp'): string {
  return formatPitch(name, spelling).replace(/-?\d+$/, '');
}
