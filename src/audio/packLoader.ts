/**
 * Fetching and decoding sample files.
 *
 * Raw bytes are kept in the Cache API so a pack is downloaded once per
 * device; decoded buffers are memoised in memory until a lazy pack releases
 * them. Encodings are chosen by what this browser reports it can decode.
 */
import { LazyPack, type ZoneSource } from './lazyPack';
import {
  type SamplePackManifest, type Zone, parseManifest,
} from './samplePack';

export interface LoadProgress {
  loaded: number;
  total: number;
}

const CACHE_NAME = 'virtual-handpan-samples-v1';
const decoded = new Map<string, Promise<AudioBuffer>>();

/** Bytes for a URL, served from the Cache API when present. */
export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    if (typeof caches !== 'undefined') cache = await caches.open(CACHE_NAME);
  } catch { cache = null; }
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  if (cache) {
    try { await cache.put(url, res.clone()); } catch { /* storage full or denied; play on without caching */ }
  }
  return res.arrayBuffer();
}

export function fetchAndDecode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const cached = decoded.get(url);
  if (cached) return cached;
  const p = fetchBytes(url).then((bytes) => ctx.decodeAudioData(bytes));
  p.catch(() => decoded.delete(url));
  decoded.set(url, p);
  return p;
}

/** Forget a decoded buffer so it can be collected once no voice holds it. */
export function releaseDecoded(url: string): void {
  decoded.delete(url);
}

/** Remove every cached sample file from this device. */
export async function clearSampleCache(): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' ? caches.delete(CACHE_NAME) : false;
  } catch {
    return false;
  }
}

export async function fetchManifest(manifestUrl: string): Promise<SamplePackManifest> {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch manifest ${manifestUrl}: ${res.status} ${res.statusText}`);
  return parseManifest(await res.json());
}

const MIME: Record<string, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  aac: 'audio/aac',
  ogg: 'audio/ogg; codecs="opus"',
  opus: 'audio/ogg; codecs="opus"',
  oga: 'audio/ogg; codecs="vorbis"',
  webm: 'audio/webm; codecs="opus"',
};

/** Whether this browser reports it can decode files with the extension. Unknown extensions are assumed fine. */
export function browserCanDecode(): (extension: string) => boolean {
  if (typeof document === 'undefined') return () => true;
  const probe = document.createElement('audio');
  const memo = new Map<string, boolean>();
  return (ext) => {
    const mime = MIME[ext];
    if (!mime) return true;
    let ok = memo.get(ext);
    if (ok === undefined) {
      ok = probe.canPlayType(mime) !== '';
      memo.set(ext, ok);
    }
    return ok;
  };
}

export function bufferBytes(b: AudioBuffer): number {
  return b.length * b.numberOfChannels * 4;
}

/** Open a pack for on-demand loading. Nothing is fetched until ensure() is called. */
export async function openLazyPack(ctx: BaseAudioContext, manifestUrl: string): Promise<LazyPack> {
  const manifest = await fetchManifest(manifestUrl);
  return new LazyPack<AudioBuffer>(manifest, manifestUrl, {
    load: (url) => fetchAndDecode(ctx, url),
    canDecode: browserCanDecode(),
    release: releaseDecoded,
    sizeOf: bufferBytes,
  });
}

/** Load every sample in a manifest up front. */
export async function loadSamplePack(
  ctx: BaseAudioContext,
  manifestUrl: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<ZoneSource> {
  const pack = await openLazyPack(ctx, manifestUrl);
  await pack.ensureAll(onProgress);
  return pack;
}

/** Assemble a pack from already-built zones, e.g. rendered in memory. */
export function packFromZones(
  name: string,
  zones: Zone[],
  opts: { a4?: number; crossfade?: number; maxShift?: number } = {},
): ZoneSource {
  return {
    name,
    zones,
    a4: opts.a4 ?? 440,
    crossfade: opts.crossfade ?? 0.08,
    maxShift: opts.maxShift ?? 2,
  };
}
