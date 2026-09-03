import { LazyPack } from './lazyPack';
import type { SamplePackManifest } from './samplePack';

const manifest: SamplePackManifest = {
  name: 'Lazy', version: 1, maxShift: 2,
  zones: [
    { pitch: 'D3', role: 'ding', layers: [{ lo: 0, hi: 0.5, files: ['d3_v1.wav'] }, { lo: 0.5, hi: 1, files: [['d3_v2.m4a', 'd3_v2.wav']] }] },
    { pitch: 'A3', layers: [{ lo: 0, hi: 0.5, files: ['a3_v1.wav', 'a3_v1b.wav'] }, { lo: 0.5, hi: 1, files: ['a3_v2.wav'] }] },
    { pitch: 'G4', layers: [{ lo: 0, hi: 1, files: ['g4.wav'] }] },
  ],
};

function makePack(opts: { fail?: string[]; delay?: number; canDecode?: (e: string) => boolean } = {}) {
  const calls: string[] = [];
  const released: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const pack = new LazyPack<string>(manifest, 'https://x.test/p/pack.json', {
    load: async (url) => {
      calls.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, opts.delay ?? 1));
      inFlight--;
      if (opts.fail?.some((f) => url.endsWith(f))) throw new Error(`boom ${url}`);
      return `buf:${url.split('/').pop()}`;
    },
    canDecode: opts.canDecode ?? ((e) => e === 'wav'),
    release: (url) => released.push(url),
    sizeOf: (b) => b.length,
    concurrency: 2,
  });
  return { pack, calls, released, max: () => maxInFlight };
}

describe('LazyPack', () => {
  it('loads only the zones the notes need and exposes them live', async () => {
    const { pack, calls } = makePack();
    expect(pack.zones).toEqual([]);
    const notes = [{ pitch: 'D3', role: 'ding' as const }, { pitch: 'A#3', role: 'top' as const }];
    expect(pack.ready(notes)).toBe(false);
    const progress: number[] = [];
    await pack.ensure(notes, (p) => progress.push(p.loaded));
    expect(pack.ready(notes)).toBe(true);
    expect(pack.zones.map((z) => z.pitch)).toEqual(['D3', 'A3']);
    expect(calls.some((u) => u.endsWith('g4.wav'))).toBe(false);
    expect(calls).toHaveLength(5);
    expect(progress.at(-1)).toBe(5);
    expect(pack.zones[1]!.layers[0]!.takes).toEqual(['buf:a3_v1.wav', 'buf:a3_v1b.wav']);
  });

  it('chooses decodable encodings and resolves relative to the manifest', async () => {
    const { pack, calls } = makePack();
    await pack.ensure([{ pitch: 'D3', role: 'ding' }]);
    expect(calls).toContain('https://x.test/p/d3_v2.wav');
    expect(calls).not.toContain('https://x.test/p/d3_v2.m4a');
  });

  it('queues the layer nearest the priority velocity first and respects concurrency', async () => {
    const { pack, calls, max } = makePack({ delay: 3 });
    await pack.ensure([{ pitch: 'D3', role: 'ding' }, { pitch: 'A3', role: 'top' }]);
    // Priority 0.7 sits in the upper layers, so both zones' v2 files come before any v1.
    const firstTwo = calls.slice(0, 2).map((u) => u.split('/').pop());
    expect(firstTwo).toEqual(['d3_v2.wav', 'a3_v2.wav']);
    expect(max()).toBeLessThanOrEqual(2);
  });

  it('does not reload zones already loaded or in flight', async () => {
    const { pack, calls } = makePack({ delay: 4 });
    const a = pack.ensure([{ pitch: 'A3', role: 'top' }]);
    const b = pack.ensure([{ pitch: 'A3', role: 'top' }, { pitch: 'G4', role: 'top' }]);
    await Promise.all([a, b]);
    expect(calls.filter((u) => u.endsWith('a3_v2.wav'))).toHaveLength(1);
    await pack.ensure([{ pitch: 'A3', role: 'top' }]);
    expect(calls).toHaveLength(4);
  });

  it('prunes zones the notes cannot reach and releases their files', async () => {
    const { pack, released } = makePack();
    await pack.ensure([{ pitch: 'D3', role: 'ding' }, { pitch: 'A3', role: 'top' }, { pitch: 'G4', role: 'top' }]);
    expect(pack.stats()).toMatchObject({ loadedZones: 3, totalZones: 3, loadedFiles: 6 });
    expect(pack.prune([{ pitch: 'G4', role: 'top' }])).toBe(2);
    expect(pack.zones.map((z) => z.pitch)).toEqual(['G4']);
    expect(released.map((u) => u.split('/').pop())).toEqual(['d3_v1.wav', 'd3_v2.wav', 'a3_v1.wav', 'a3_v1b.wav', 'a3_v2.wav']);
    expect(pack.stats().bytes).toBe('buf:g4.wav'.length);
  });

  it('rejects when a file fails but still loads the other zones', async () => {
    const { pack } = makePack({ fail: ['a3_v2.wav'] });
    await expect(pack.ensure([{ pitch: 'A3', role: 'top' }, { pitch: 'G4', role: 'top' }])).rejects.toThrow(/boom/);
    expect(pack.zones.map((z) => z.pitch)).toEqual(['G4']);
    expect(pack.ready([{ pitch: 'A3', role: 'top' }])).toBe(false);
  });

  it('ensureAll loads everything', async () => {
    const { pack } = makePack();
    await pack.ensureAll();
    expect(pack.zones).toHaveLength(3);
  });
});
