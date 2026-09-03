import {
  type Layer, type Zone, ManifestError, RoundRobin, layerWeights, parseManifest, rateForShift, resolveSampleUrl,
  selectZone,
} from './samplePack';

const good = {
  name: 'Test pack', version: 1, crossfade: 0.1,
  zones: [
    { pitch: 'D3', role: 'ding', layers: [{ lo: 0, hi: 0.5, files: ['d3_soft.wav'] }, { lo: 0.5, hi: 1, files: ['d3_hard_1.wav', 'd3_hard_2.wav'], gainDb: -1.5 }] },
    { pitch: 'A3', layers: [{ lo: 0, hi: 1, files: ['a3.wav'] }] },
  ],
};

describe('parseManifest', () => {
  it('accepts a valid manifest and keeps optional fields', () => {
    const m = parseManifest(good);
    expect(m.name).toBe('Test pack');
    expect(m.crossfade).toBe(0.1);
    expect(m.zones[0]!.role).toBe('ding');
    expect(m.zones[0]!.layers[1]!.gainDb).toBe(-1.5);
  });

  it('rejects structural problems with a path', () => {
    expect(() => parseManifest({ ...good, version: 2 })).toThrow(ManifestError);
    expect(() => parseManifest({ ...good, zones: [] })).toThrow(/zones/);
    expect(() => parseManifest({ ...good, zones: [{ pitch: 'H3', layers: [] }] })).toThrow(/zones\[0\].pitch/);
    expect(() => parseManifest({ ...good, zones: [{ pitch: 'D3', layers: [{ lo: 0.5, hi: 0.5, files: ['x'] }] }] })).toThrow(/hi must be greater/);
    expect(() => parseManifest({ ...good, zones: [{ pitch: 'D3', layers: [{ lo: 0, hi: 1, files: [] }] }] })).toThrow(/files/);
    expect(() => parseManifest({ ...good, zones: [{ pitch: 'D3', role: 'side', layers: [{ lo: 0, hi: 1, files: ['x'] }] }] })).toThrow(/role/);
  });
});

describe('resolveSampleUrl', () => {
  it('resolves relative to the manifest directory or an explicit base', () => {
    expect(resolveSampleUrl('https://x.test/packs/p/pack.json', undefined, 'a3.wav')).toBe('https://x.test/packs/p/a3.wav');
    expect(resolveSampleUrl('https://x.test/packs/p/pack.json', 'samples/', 'a3.wav')).toBe('https://x.test/packs/p/samples/a3.wav');
    expect(resolveSampleUrl('https://x.test/packs/p/pack.json', 'https://cdn.test/s/', 'a3.wav')).toBe('https://cdn.test/s/a3.wav');
  });
});

function zone(pitch: string, midi: number, role?: Zone<string>['role']): Zone<string> {
  return { pitch, midi, ...(role ? { role } : {}), layers: [{ lo: 0, hi: 1, gain: 1, takes: [pitch] }] };
}

describe('selectZone', () => {
  const zones = [zone('D3', 50, 'ding'), zone('A3', 57), zone('C4', 60), zone('D4', 62, 'top')];

  it('takes an exact match and reports no shift', () => {
    expect(selectZone(zones, 60, 'top', 2)).toMatchObject({ zone: { pitch: 'C4' }, shift: 0 });
  });

  it('prefers shifting a lower sample up when equidistant', () => {
    const plain = [zone('C4', 60), zone('D4', 62)];
    expect(selectZone(plain, 61, 'top', 2)).toMatchObject({ zone: { pitch: 'C4' }, shift: 1 });
  });

  it('lets a role match outrank shift direction', () => {
    expect(selectZone(zones, 61, 'top', 2)).toMatchObject({ zone: { pitch: 'D4' }, shift: -1 });
  });

  it('prefers the requested role, then role-less zones, then other roles', () => {
    const z = [zone('A3', 57, 'bottom'), zone('A3', 57), zone('A3', 57, 'top')];
    expect(selectZone(z, 57, 'top', 0)!.zone.role).toBe('top');
    expect(selectZone(z, 57, 'ding', 0)!.zone.role).toBeUndefined();
    expect(selectZone([zone('A3', 57, 'bottom')], 57, 'top', 0)!.zone.role).toBe('bottom');
  });

  it('returns null beyond the shift limit', () => {
    expect(selectZone(zones, 70, 'top', 2)).toBeNull();
    expect(selectZone(zones, 70, 'top', 12)).not.toBeNull();
  });
});

describe('layerWeights', () => {
  const layers: Layer<string>[] = [
    { lo: 0, hi: 0.4, gain: 1, takes: ['soft'] },
    { lo: 0.4, hi: 0.75, gain: 1, takes: ['mid'] },
    { lo: 0.75, hi: 1, gain: 1, takes: ['hard'] },
  ];

  it('is a single full-weight layer away from boundaries', () => {
    const w = layerWeights(layers, 0.6, 0.08);
    expect(w).toHaveLength(1);
    expect(w[0]!.layer.takes[0]).toBe('mid');
    expect(w[0]!.weight).toBe(1);
  });

  it('crossfades with equal power at a boundary', () => {
    const w = layerWeights(layers, 0.4, 0.08);
    expect(w.map((x) => x.layer.takes[0])).toEqual(['soft', 'mid']);
    expect(w[0]!.weight).toBeCloseTo(Math.SQRT1_2, 5);
    expect(w[1]!.weight).toBeCloseTo(Math.SQRT1_2, 5);
    expect(w[0]!.weight ** 2 + w[1]!.weight ** 2).toBeCloseTo(1, 5);
  });

  it('leans toward the layer the velocity is inside', () => {
    const w = layerWeights(layers, 0.44, 0.08);
    const mid = w.find((x) => x.layer.takes[0] === 'mid')!;
    const soft = w.find((x) => x.layer.takes[0] === 'soft')!;
    expect(mid.weight).toBeGreaterThan(soft.weight);
  });

  it('does not crossfade at the outer edges or with zero width', () => {
    expect(layerWeights(layers, 0.0, 0.08)).toHaveLength(1);
    expect(layerWeights(layers, 1.0, 0.08)).toHaveLength(1);
    expect(layerWeights(layers, 0.4, 0)).toHaveLength(1);
  });

  it('falls back to the nearest layer when the range has gaps', () => {
    const gappy: Layer<string>[] = [{ lo: 0.3, hi: 0.6, gain: 1, takes: ['only'] }];
    expect(layerWeights(gappy, 0.1, 0.05)[0]!.layer.takes[0]).toBe('only');
    expect(layerWeights(gappy, 0.9, 0.05)[0]!.layer.takes[0]).toBe('only');
  });
});

describe('RoundRobin', () => {
  const layer: Layer<string> = { lo: 0, hi: 1, gain: 1, takes: ['a', 'b', 'c'] };

  it('cycles through every take without immediate repeats', () => {
    const rr = new RoundRobin('cycle', () => 0);
    const seq = Array.from({ length: 7 }, () => rr.next(layer));
    expect(seq).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a']);
  });

  it('random mode never repeats the previous take', () => {
    const rr = new RoundRobin('random');
    let prev = rr.next(layer);
    for (let i = 0; i < 500; i++) {
      const cur = rr.next(layer);
      expect(cur).not.toBe(prev);
      prev = cur;
    }
  });

  it('is per layer and trivial for a single take', () => {
    const rr = new RoundRobin('cycle', () => 0);
    const single: Layer<string> = { lo: 0, hi: 1, gain: 1, takes: ['x'] };
    expect(rr.next(single)).toBe('x');
    expect(rr.next(single)).toBe('x');
    rr.next(layer);
    expect(rr.next(single)).toBe('x');
  });
});

describe('rateForShift', () => {
  it('doubles per octave', () => {
    expect(rateForShift(12)).toBeCloseTo(2);
    expect(rateForShift(-12)).toBeCloseTo(0.5);
    expect(rateForShift(0)).toBe(1);
  });
});
