import { getFeel } from './feels';
import { generateFromModel, quantizeEighths, trainModel } from './learn';
import { type Recording, Recorder, recordingSeconds, recordingToPhrase } from './recorder';
import { Rng } from './rng';
import { applyFeedback, cellWeights, emptyTaste } from './taste';

const pitches = ['D3', 'A3', 'A#3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5'];

function ascending(): Recording {
  // An ascending scale in steady eighths at 120 bpm, then back down.
  const seq = [...pitches, ...[...pitches].reverse().slice(1)];
  return {
    id: 'r1', name: 'up and down', createdAt: '2026-09-03T00:00:00Z', bpm: 120, pitches,
    notes: seq.map((p, i) => ({ time: i * 0.25, pitch: p, velocity: 0.7 })),
  };
}

describe('Recorder', () => {
  it('starts its clock at the first strike and returns a recording', () => {
    const r = new Recorder();
    expect(r.recording).toBe(false);
    r.start();
    expect(r.recording).toBe(true);
    r.add('D3', 0.8, 10.5);
    r.add('A3', 0.6, 11.0);
    r.add('C4', 0.7, 11.25);
    const rec = r.stop(90, ['C4', 'D3', 'A3', 'D3'], 'take')!;
    expect(r.recording).toBe(false);
    expect(rec.notes.map((n) => n.time)).toEqual([0, 0.5, 0.75]);
    expect(rec.pitches).toEqual(['D3', 'A3', 'C4']);
    expect(recordingSeconds(rec)).toBeCloseTo(1.75);
    expect(new Recorder().stop(90, [], 'empty')).toBeNull();
    const phrase = recordingToPhrase(rec);
    expect(phrase.map((n) => n.beat)).toEqual([0, 0.75, 1.125]);
    expect(phrase[0]!.accent).toBeCloseTo(0.08);
    expect(phrase[1]!.duration).toBeCloseTo(0.375);
  });

  it('keeps strokes as unpitched kinds and out of the model', () => {
    const r = new Recorder();
    r.start();
    r.add('D3', 0.7, 1);
    r.add('#tak', 0.5, 1.5);
    r.add('A3', 0.7, 2);
    const rec = r.stop(120, ['D3', 'A3'], 't')!;
    const phrase = recordingToPhrase(rec);
    expect(phrase[1]).toMatchObject({ pitch: '', kind: 'tak', role: 'groove' });
    expect(trainModel([rec]).noteCount).toBe(1);
  });
});

describe('trainModel and generateFromModel', () => {
  it('quantizes durations to eighths within limits', () => {
    expect(quantizeEighths(0.5)).toBe(1);
    expect(quantizeEighths(0.26)).toBe(1);
    expect(quantizeEighths(1.4)).toBe(3);
    expect(quantizeEighths(40)).toBe(16);
  });

  it('learns steps and eighths from a scale and generates in that style', () => {
    const model = trainModel([ascending()]);
    expect(model.recordingCount).toBe(1);
    expect(model.noteCount).toBe(18);
    expect(model.intervalMarginal.get(1)).toBe(9);
    expect(model.intervalMarginal.get(-1)).toBe(9);
    expect(model.durationMarginal.get(1)).toBe(18);
    const notes = generateFromModel(model, pitches, 4, getFeel('straight'), new Rng(3));
    expect(notes.length).toBeGreaterThan(20);
    for (const n of notes) {
      expect(n.duration).toBeCloseTo(0.5);
      expect(pitches).toContain(n.pitch);
      expect(n.beat).toBeLessThan(16);
    }
    let steps = 0;
    for (let i = 1; i < notes.length; i++) {
      if (Math.abs(pitches.indexOf(notes[i]!.pitch) - pitches.indexOf(notes[i - 1]!.pitch)) === 1) steps++;
    }
    expect(steps / (notes.length - 1)).toBeGreaterThan(0.9);
  });

  it('collapses near-simultaneous strikes and ignores unknown pitches', () => {
    const rec = ascending();
    rec.notes.splice(1, 0, { time: 0.02, pitch: 'A3', velocity: 0.5 });
    rec.notes.push({ time: 99, pitch: 'Z9', velocity: 0.5 });
    const model = trainModel([rec]);
    expect(model.noteCount).toBe(18);
    expect(generateFromModel(trainModel([]), pitches, 2, getFeel('straight'), new Rng(1))).toEqual([]);
  });
});

describe('taste', () => {
  it('nudges cell weights and dyad bias with feedback', () => {
    const feel = getFeel('straight');
    let taste = emptyTaste();
    expect(cellWeights(taste, feel).every((w) => w === 1)).toBe(true);
    taste = applyFeedback(taste, feel, [2, 2, 5], true, true);
    const w = cellWeights(taste, feel);
    expect(w[2]).toBeCloseTo(1.25);
    expect(w[5]).toBeCloseTo(1.25);
    expect(w[0]).toBe(1);
    expect(taste.dyadBias).toBeCloseTo(0.03);
    taste = applyFeedback(taste, feel, [2], false, false);
    expect(cellWeights(taste, feel)[2]).toBeCloseTo(1);
    expect(taste.dyadBias).toBeCloseTo(0.03);
    for (let i = 0; i < 30; i++) taste = applyFeedback(taste, feel, [0], true, true);
    expect(cellWeights(taste, feel)[0]).toBe(5);
    expect(taste.dyadBias).toBe(0.2);
  });
});
