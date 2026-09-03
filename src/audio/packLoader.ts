/**
 * Fetches a sample pack manifest and decodes its audio into a SamplePack.
 * Decoded buffers are cached by URL so packs sharing files load once.
 */
import {
  type LayerManifest, type SamplePack, type SamplePackManifest, type Zone, parseManifest, resolveSampleUrl,
  zoneFromManifest,
} from './samplePack';

export interface LoadProgress {
  loaded: number;
  total: number;
}

const decoded = new Map<string, Promise<AudioBuffer>>();

export function fetchAndDecode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const cached = decoded.get(url);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sample ${url}: ${res.status} ${res.statusText}`);
    const bytes = await res.arrayBuffer();
    return ctx.decodeAudioData(bytes);
  })();
  p.catch(() => decoded.delete(url));
  decoded.set(url, p);
  return p;
}

export async function fetchManifest(manifestUrl: string): Promise<SamplePackManifest> {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch manifest ${manifestUrl}: ${res.status} ${res.statusText}`);
  return parseManifest(await res.json());
}

/** Load every sample in a manifest, a few at a time, reporting progress. */
export async function loadSamplePack(
  ctx: BaseAudioContext,
  manifestUrl: string,
  onProgress?: (p: LoadProgress) => void,
  concurrency = 6,
): Promise<SamplePack> {
  const manifest = await fetchManifest(manifestUrl);
  const urls = new Set<string>();
  for (const z of manifest.zones) for (const l of z.layers) for (const f of l.files) urls.add(resolveSampleUrl(manifestUrl, manifest.baseUrl, f));
  const list = [...urls];
  const buffers = new Map<string, AudioBuffer>();
  let loaded = 0;
  onProgress?.({ loaded, total: list.length });

  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const url = list[next++]!;
      buffers.set(url, await fetchAndDecode(ctx, url));
      loaded++;
      onProgress?.({ loaded, total: list.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));

  const takesFor = (l: LayerManifest): AudioBuffer[] =>
    l.files.map((f) => buffers.get(resolveSampleUrl(manifestUrl, manifest.baseUrl, f))!);
  return packFromZones(manifest.name, manifest.zones.map((z) => zoneFromManifest(z, takesFor)), manifest);
}

/** Assemble a pack from already-built zones, e.g. rendered in memory. */
export function packFromZones(
  name: string,
  zones: Zone[],
  opts: { a4?: number; crossfade?: number; maxShift?: number } = {},
): SamplePack {
  return {
    name,
    zones,
    a4: opts.a4 ?? 440,
    crossfade: opts.crossfade ?? 0.08,
    maxShift: opts.maxShift ?? 2,
  };
}
