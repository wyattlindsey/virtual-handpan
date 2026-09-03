/**
 * A sample pack that loads zones on demand and lets go of the ones no
 * longer reachable from the notes on the pan, so a large pack costs only
 * the decoded audio the current layout can use.
 *
 * Generic over the decoded type and given its loader, so the bookkeeping is
 * testable without Web Audio.
 */
import { midiFromPitch } from '../model/pitch';
import {
  type LayerManifest, type NoteRequest, type SamplePackManifest, type Zone, type ZoneManifest, dbToGain, layerFiles,
  neededManifestZones, resolveSampleUrl,
} from './samplePack';

/** What SampledInstrument needs from a pack; zones may change over time. */
export interface ZoneSource<B = AudioBuffer> {
  readonly name: string;
  readonly a4: number;
  readonly crossfade: number;
  readonly maxShift: number;
  readonly zones: readonly Zone<B>[];
}

export interface LazyProgress {
  /** Files settled so far in this request. */
  loaded: number;
  /** Files this request needs in total. */
  total: number;
}

export interface LazyPackStats {
  loadedZones: number;
  totalZones: number;
  loadedFiles: number;
  /** Estimated bytes of decoded audio held, when a size function was given. */
  bytes: number;
}

export interface LazyPackOptions<B> {
  /** Fetch and decode one file. Called once per URL per load; callers may cache. */
  load: (url: string) => Promise<B>;
  /** Extensions the runtime can decode; decides between alternative encodings. */
  canDecode: (extension: string) => boolean;
  /** Called for each file of an evicted zone so caches can drop it. */
  release?: (url: string) => void;
  sizeOf?: (buffer: B) => number;
  concurrency?: number;
  /** Velocity whose layer should arrive first, so the likeliest strike is playable soonest. */
  priorityVelocity?: number;
}

/** Runs at most n promises at once, starting them in the order they were queued. */
class Limiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly n: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        fn().then(resolve, reject).finally(() => {
          this.active--;
          this.queue.shift()?.();
        });
      };
      if (this.active < this.n) start();
      else this.queue.push(start);
    });
  }
}

export class LazyPack<B = AudioBuffer> implements ZoneSource<B> {
  readonly name: string;
  readonly a4: number;
  readonly crossfade: number;
  readonly maxShift: number;
  private readonly loaded = new Map<ZoneManifest, Zone<B>>();
  private readonly pending = new Map<ZoneManifest, Promise<Zone<B>>>();
  private live: Zone<B>[] = [];
  private readonly limiter: Limiter;
  private readonly priorityVelocity: number;

  constructor(
    readonly manifest: SamplePackManifest,
    readonly manifestUrl: string,
    private readonly opts: LazyPackOptions<B>,
  ) {
    this.name = manifest.name;
    this.a4 = manifest.a4 ?? 440;
    this.crossfade = manifest.crossfade ?? 0.08;
    this.maxShift = manifest.maxShift ?? 2;
    this.limiter = new Limiter(opts.concurrency ?? 6);
    this.priorityVelocity = opts.priorityVelocity ?? 0.7;
  }

  /** Zones currently decoded, in manifest order. */
  get zones(): readonly Zone<B>[] {
    return this.live;
  }

  /** Manifest zones the given notes would use. */
  needed(notes: readonly NoteRequest[]): ZoneManifest[] {
    return neededManifestZones(this.manifest.zones, notes, this.maxShift);
  }

  /** Whether every zone the notes need is decoded. */
  ready(notes: readonly NoteRequest[]): boolean {
    return this.needed(notes).every((z) => this.loaded.has(z));
  }

  /** Load the zones these notes need. Resolves when all are decoded; zones become playable one by one. */
  ensure(notes: readonly NoteRequest[], onProgress?: (p: LazyProgress) => void): Promise<void> {
    return this.ensureZones(this.needed(notes), onProgress);
  }

  /** Load every zone in the manifest. */
  ensureAll(onProgress?: (p: LazyProgress) => void): Promise<void> {
    return this.ensureZones(this.manifest.zones, onProgress);
  }

  /** Drop decoded zones the notes cannot reach. Returns how many were evicted. */
  prune(notes: readonly NoteRequest[]): number {
    const keep = new Set(this.needed(notes));
    let evicted = 0;
    for (const zm of [...this.loaded.keys()]) {
      if (keep.has(zm)) continue;
      this.loaded.delete(zm);
      evicted++;
      if (this.opts.release) for (const url of this.zoneUrls(zm)) this.opts.release(url);
    }
    if (evicted) this.rebuild();
    return evicted;
  }

  stats(): LazyPackStats {
    let loadedFiles = 0;
    let bytes = 0;
    for (const z of this.loaded.values()) {
      for (const l of z.layers) {
        loadedFiles += l.takes.length;
        if (this.opts.sizeOf) for (const t of l.takes) bytes += this.opts.sizeOf(t);
      }
    }
    return { loadedZones: this.loaded.size, totalZones: this.manifest.zones.length, loadedFiles, bytes };
  }

  /** URLs of every file a zone uses, in manifest order. */
  zoneUrls(zm: ZoneManifest): string[] {
    return zm.layers.flatMap((l) => this.layerUrls(l));
  }

  private layerUrls(l: LayerManifest): string[] {
    return layerFiles(l, this.opts.canDecode).map((f) => resolveSampleUrl(this.manifestUrl, this.manifest.baseUrl, f));
  }

  /** Layer indices nearest the priority velocity first. */
  private layerPriority(zm: ZoneManifest): number[] {
    const v = this.priorityVelocity;
    return zm.layers
      .map((l, i) => ({ i, d: Math.abs((l.lo + l.hi) / 2 - v) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.i);
  }

  private async ensureZones(zones: readonly ZoneManifest[], onProgress?: (p: LazyProgress) => void): Promise<void> {
    const todo = zones.filter((z) => !this.loaded.has(z) && !this.pending.has(z));
    const waiting = zones.filter((z) => this.pending.has(z)).map((z) => this.pending.get(z)!);
    const total = todo.reduce((n, z) => n + this.zoneUrls(z).length, 0);
    let settled = 0;
    onProgress?.({ loaded: settled, total });

    // Queue files so every zone's likeliest layer goes before any zone's least likely one.
    const promises = new Map<string, Promise<B>>();
    const enqueue = (url: string) => {
      if (promises.has(url)) return;
      const p = this.limiter.run(() => this.opts.load(url));
      p.finally(() => { settled++; onProgress?.({ loaded: settled, total }); }).catch(() => {});
      promises.set(url, p);
    };
    const priorities = todo.map((zm) => this.layerPriority(zm));
    const maxLayers = Math.max(0, ...todo.map((z) => z.layers.length));
    for (let rank = 0; rank < maxLayers; rank++) {
      todo.forEach((zm, zi) => {
        const li = priorities[zi]![rank];
        if (li !== undefined) for (const url of this.layerUrls(zm.layers[li]!)) enqueue(url);
      });
    }

    const zonePromises = todo.map((zm) => {
      const p = (async (): Promise<Zone<B>> => {
        const layers = [];
        for (const l of zm.layers) {
          const takes = await Promise.all(this.layerUrls(l).map((url) => promises.get(url)!));
          layers.push({ lo: l.lo, hi: l.hi, gain: dbToGain(l.gainDb ?? 0), takes });
        }
        const zone: Zone<B> = { midi: midiFromPitch(zm.pitch), pitch: zm.pitch, ...(zm.role ? { role: zm.role } : {}), layers };
        this.loaded.set(zm, zone);
        this.rebuild();
        return zone;
      })();
      this.pending.set(zm, p);
      p.finally(() => this.pending.delete(zm)).catch(() => {});
      return p;
    });
    await Promise.all([...zonePromises, ...waiting]);
  }

  private rebuild(): void {
    this.live = this.manifest.zones.filter((z) => this.loaded.has(z)).map((z) => this.loaded.get(z)!);
  }
}
