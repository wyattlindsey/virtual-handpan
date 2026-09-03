import {
  comparePitches, formatPitch, formatPitchClass, frequencyFromPitch, isValidPitch,
  midiFromPitch, normalizePitch, parsePitch, pitchFromMidi, transposePitch,
} from './pitch';

describe('parsePitch', () => {
  it('parses sharps, flats and unicode accidentals', () => {
    expect(parsePitch('C#3')).toEqual({ pitchClass: 'C#', octave: 3 });
    expect(parsePitch('Bb3')).toEqual({ pitchClass: 'A#', octave: 3 });
    expect(parsePitch('D♭4')).toEqual({ pitchClass: 'C#', octave: 4 });
    expect(parsePitch('f♯5')).toEqual({ pitchClass: 'F#', octave: 5 });
  });

  it('wraps enharmonic edge cases across the octave boundary', () => {
    expect(parsePitch('Cb4')).toEqual({ pitchClass: 'B', octave: 3 });
    expect(parsePitch('B#3')).toEqual({ pitchClass: 'C', octave: 4 });
  });

  it('rejects garbage', () => {
    expect(() => parsePitch('H3')).toThrow();
    expect(() => parsePitch('C')).toThrow();
    expect(isValidPitch('Ebb3')).toBe(false);
    expect(isValidPitch('Eb3')).toBe(true);
  });
});

describe('midi and frequency', () => {
  it('maps C4 to 60 and A4 to 69', () => {
    expect(midiFromPitch('C4')).toBe(60);
    expect(midiFromPitch('A4')).toBe(69);
    expect(midiFromPitch('A2')).toBe(45);
    expect(midiFromPitch('B5')).toBe(83);
  });

  it('round-trips through pitchFromMidi in both spellings', () => {
    expect(pitchFromMidi(61)).toBe('C#4');
    expect(pitchFromMidi(61, 'flat')).toBe('Db4');
    expect(pitchFromMidi(59)).toBe('B3');
    for (let m = 45; m <= 83; m++) expect(midiFromPitch(pitchFromMidi(m))).toBe(m);
  });

  it('uses 12-TET with A4 = 440 by default', () => {
    expect(frequencyFromPitch('A4')).toBeCloseTo(440);
    expect(frequencyFromPitch('A3')).toBeCloseTo(220);
    expect(frequencyFromPitch('C4')).toBeCloseTo(261.63, 1);
    expect(frequencyFromPitch('A4', 442)).toBeCloseTo(442);
  });
});

describe('helpers', () => {
  it('normalises and transposes', () => {
    expect(normalizePitch('bb3')).toBe('A#3');
    expect(transposePitch('A3', 5)).toBe('D4');
    expect(transposePitch('D3', -2)).toBe('C3');
  });

  it('compares and formats', () => {
    expect(['E4', 'D3', 'C#5'].sort(comparePitches)).toEqual(['D3', 'E4', 'C#5']);
    expect(formatPitch('A#3')).toBe('A♯3');
    expect(formatPitch('A#3', 'flat')).toBe('B♭3');
    expect(formatPitchClass('C#4', 'flat')).toBe('D♭');
    expect(formatPitchClass('D3')).toBe('D');
  });
});
