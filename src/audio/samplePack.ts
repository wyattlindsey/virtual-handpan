/**
 * Sample pack manifest and selection logic.
 *
 * A pack is a set of zones, one per recorded pitch (optionally per role),
 * each with velocity layers, each layer with round-robin alternatives.
 * Selection is pure so it can be unit tested without Web Audio: pick the
 * nearest zone, weight the velocity layers with a crossfade at their
 * boundaries, and cycle round robins so no two consecutive strikes of the
 * same layer use the same take.
 */
import { isValidPitch, midiFromPitch } from '../model/pitch';
import type { FieldRole } from './instrument';

export interface SamplePackManifest {
  name: string;
  /** Manifest format version. */
  version: 1;
  /** Prefix for sample paths; defaults to the manifest's directory. */
  baseUrl?: string;
  /** Reference tuning of the recordings, default 440. */
  a4?: number;
  /** Width of the velocity crossfade between adjacent layers, 0..0.5 of the range. Default 0.08. */
  crossfade?: number;
  /** How far a zone may be pitch-shifted to cover a missing note, in semitones. Default 2. */
  maxShift?: number;
  zones: ZoneManifest[];
}

export interface ZoneManifest {
  /** Recorded pitch, e.g. "A3". */
  pitch: string;
  /** Restrict this zone to a field role. A zone without a role covers any. */
  role?: FieldRole;
  layers: LayerManifest[];
}

export interface LayerManifest {
  /** Inclusive velocity range, 0..1. Layers of a zone should tile the range. */
  lo: number;
  hi: number;
  /** Round-robin takes, as paths relative to baseUrl. */
  files: string[];
  /** Level trim in dB. */
  gainDb?: number;
}

/** A zone after loading: buffers instead of paths. */
export interface Zone<B = AudioBuffer> {
  midi: number;
  pitch: string;
  role?: FieldRole;
  layers: Layer<B>[];
}

export interface Layer<B = AudioBuffer> {
  lo: number;
  hi: number;
  gain: number;
  takes: B[];
}

export interface SamplePack<B = AudioBuffer> {
  name: string;
  a4: number;
  crossfade: number;
  maxShift: number;
  zones: Zone<B>[];
}

export class ManifestError extends Error {}

/** Validate and normalise a parsed JSON manifest. Throws ManifestError with a path to the problem. */
export function parseManifest(input: unknown): SamplePackManifest {
  const m = asObject(input, 'manifest');
  const name = m['name'];
  if (typeof name !== 'string' || !name.trim()) throw new ManifestError('manifest.name must be a non-empty string');
  if (m['version'] !== 1) throw new ManifestError('manifest.version must be 1');
  const zonesRaw = m['zones'];
  if (!Array.isArray(zonesRaw) || zonesRaw.length === 0) throw new ManifestError('manifest.zones must be a non-empty array');
  const zones = zonesRaw.map((z, zi) => parseZone(z, `zones[${zi}]`));
  const out: SamplePackManifest = { name: name.trim(), version: 1, zones };
  if (m['baseUrl'] !== undefined) out.baseUrl = expectString(m['baseUrl'], 'manifest.baseUrl');
  if (m['a4'] !== undefined) out.a4 = expectNumber(m['a4'], 'manifest.a4', 400, 480);
  if (m['crossfade'] !== undefined) out.crossfade = expectNumber(m['crossfade'], 'manifest.crossfade', 0, 0.5);
  if (m['maxShift'] !== undefined) out.maxShift = expectNumber(m['maxShift'], 'manifest.maxShift', 0, 12);
  return out;
}

function parseZone(input: unknown, path: string): ZoneManifest {
  const z = asObject(input, path);
  const pitch = expectString(z['pitch'], `${path}.pitch`);
  if (!isValidPitch(pitch)) throw new ManifestError(`${path}.pitch is not a pitch name: "${pitch}"`);
  const layersRaw = z['layers'];
  if (!Array.isArray(layersRaw) || layersRaw.length === 0) throw new ManifestError(`${path}.layers must be a non-empty array`);
  const layers = layersRaw.map((l, li) => parseLayer(l, `${path}.layers[${li}]`));
  const out: ZoneManifest = { pitch, layers };
  if (z['role'] !== undefined) {
    const role = z['role'];
    if (role !== 'ding' && role !== 'top' && role !== 'bottom') throw new ManifestError(`${path}.role must be ding, top or bottom`);
    out.role = role;
  }
  return out;
}

function parseLayer(input: unknown, path: string): LayerManifest {
  const l = asObject(input, path);
  const lo = expectNumber(l['lo'], `${path}.lo`, 0, 1);
  const hi = expectNumber(l['hi'], `${path}.hi`, 0, 1);
  if (hi <= lo) throw new ManifestError(`${path}: hi must be greater than lo`);
  const files = l['files'];
  if (!Array.isArray(files) || files.length === 0 || !files.every((f) => typeof f === 'string' && f)) {
    throw new ManifestError(`${path}.files must be a non-empty array of paths`);
  }
  const out: LayerManifest = { lo, hi, files: files as string[] };
  if (l['gainDb'] !== undefined) out.gainDb = expectNumber(l['gainDb'], `${path}.gainDb`, -60, 24);
  return out;
}

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ManifestError(`${path} must be an object`);
  return v as Record<string, unknown>;
}

function expectString(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new ManifestError(`${path} must be a string`);
  return v;
}

function expectNumber(v: unknown, path: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
    throw new ManifestError(`${path} must be a number between ${lo} and ${hi}`);
  }
  return v;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Resolve a sample path against the manifest location. */
export function resolveSampleUrl(manifestUrl: string, baseUrl: string | undefined, file: string): string {
  const base = baseUrl !== undefined ? new URL(baseUrl, manifestUrl) : new URL('.', manifestUrl);
  return new URL(file, base).href;
}

export interface ZoneMatch<B> {
  zone: Zone<B>;
  /** Semitones the sample must be shifted to reach the requested pitch. */
  shift: number;
}

/**
 * Nearest zone for a pitch. Zones for the requested role win over
 * role-less zones, which win over other roles; ties go to the lower sample
 * (shifting up sounds more natural than shifting down). Returns null when the
 * nearest zone is further than maxShift.
 */
export function selectZone<B>(zones: readonly Zone<B>[], midi: number, role: FieldRole | undefined, maxShift: number): ZoneMatch<B> | null {
  let best: ZoneMatch<B> | null = null;
  let bestScore = Infinity;
  for (const zone of zones) {
    const distance = Math.abs(zone.midi - midi);
    if (distance > maxShift) continue;
    const rolePenalty = zone.role === undefined ? 0.25 : zone.role === role ? 0 : 0.5;
    const direction = zone.midi > midi ? 0.1 : 0;
    const score = distance + rolePenalty + direction;
    if (score < bestScore) {
      bestScore = score;
      best = { zone, shift: midi - zone.midi };
    }
  }
  return best;
}

export interface LayerWeight<B> {
  layer: Layer<B>;
  /** Equal-power weight, 0..1. */
  weight: number;
}

/**
 * Weights for the layers that should sound at a velocity. Inside a layer the
 * weight is 1; within `crossfade` of a boundary shared with a neighbour the
 * two layers blend with an equal-power curve.
 */
export function layerWeights<B>(layers: readonly Layer<B>[], velocity: number, crossfade: number): LayerWeight<B>[] {
  const v = Math.min(1, Math.max(0, velocity));
  const xf = Math.max(0, crossfade);
  const sorted = [...layers].sort((a, b) => a.lo - b.lo);
  const out: LayerWeight<B>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const layer = sorted[i]!;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    // A layer owns [lo, hi); the top layer also owns its hi so velocity 1 has a home.
    const owns = v >= layer.lo && (v < layer.hi || (!next && v <= layer.hi));
    let t: number;
    if (owns) {
      t = 1;
      if (prev && xf > 0 && v < layer.lo + xf) t = (v - (layer.lo - xf)) / (2 * xf);
      if (next && xf > 0 && v > layer.hi - xf) t = 1 - (v - (layer.hi - xf)) / (2 * xf);
    } else if (v < layer.lo) {
      // Below this layer: only sounds inside the crossfade shared with the previous layer.
      if (!prev || xf <= 0 || v < layer.lo - xf) continue;
      t = (v - (layer.lo - xf)) / (2 * xf);
    } else {
      if (!next || xf <= 0 || v > layer.hi + xf) continue;
      t = 1 - (v - (layer.hi - xf)) / (2 * xf);
    }
    const weight = Math.sin((Math.min(1, Math.max(0, t)) * Math.PI) / 2);
    if (weight > 0.001) out.push({ layer, weight });
  }
  // Velocity outside every layer: use the nearest one.
  if (out.length === 0 && sorted.length > 0) {
    const nearest = v < sorted[0]!.lo ? sorted[0]! : sorted[sorted.length - 1]!;
    out.push({ layer: nearest, weight: 1 });
  }
  return out;
}

/** Cycles through takes so consecutive strikes never reuse one when there is a choice. */
export class RoundRobin {
  private cursors = new WeakMap<object, number>();

  constructor(private readonly mode: 'cycle' | 'random' = 'cycle', private readonly random: () => number = Math.random) {}

  next<B>(layer: Layer<B>): B {
    const n = layer.takes.length;
    if (n === 1) return layer.takes[0]!;
    const last = this.cursors.get(layer);
    let idx: number;
    if (this.mode === 'cycle') {
      idx = last === undefined ? Math.floor(this.random() * n) : (last + 1) % n;
    } else {
      idx = Math.floor(this.random() * (n - 1));
      if (last !== undefined && idx >= last) idx += 1;
      if (idx >= n) idx = 0;
    }
    this.cursors.set(layer, idx);
    return layer.takes[idx]!;
  }
}

/** Playback rate for a pitch shift in semitones. */
export function rateForShift(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function zoneFromManifest<B>(z: ZoneManifest, takes: (layer: LayerManifest) => B[]): Zone<B> {
  return {
    midi: midiFromPitch(z.pitch),
    pitch: z.pitch,
    ...(z.role ? { role: z.role } : {}),
    layers: z.layers.map((l) => ({ lo: l.lo, hi: l.hi, gain: dbToGain(l.gainDb ?? 0), takes: takes(l) })),
  };
}
