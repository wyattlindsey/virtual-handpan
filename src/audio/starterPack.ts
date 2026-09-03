/**
 * A stand-in sample pack rendered from the synth voice, so the sampled
 * engine (zones, velocity layers, round robin, loading UI) can be exercised
 * before real recordings exist. Each pitch gets three velocity layers with
 * three takes each; the synth's per-strike detune and noise make the takes
 * genuinely different.
 */
import { midiFromPitch } from '../model/pitch';
import type { FieldRole } from './instrument';
import type { ZoneSource } from './lazyPack';
import { packFromZones } from './packLoader';
import type { Zone } from './samplePack';
import { SynthHandpan } from './synthHandpan';

export const STARTER_LAYERS = [
  { lo: 0, hi: 0.4, strike: 0.3 },
  { lo: 0.4, hi: 0.75, strike: 0.62 },
  { lo: 0.75, hi: 1, strike: 0.95 },
] as const;

export const STARTER_TAKES = 3;

export interface StarterNote {
  pitch: string;
  role: FieldRole;
}

export interface RenderProgress {
  done: number;
  total: number;
  pitch: string;
}

const zoneCache = new Map<string, Promise<Zone>>();

/** Render (or reuse) one zone for a pitch and role. */
export function renderStarterZone(sampleRate: number, note: StarterNote): Promise<Zone> {
  const key = `${note.pitch}|${note.role}|${sampleRate}`;
  const cached = zoneCache.get(key);
  if (cached) return cached;
  const p = renderZone(sampleRate, note);
  p.catch(() => zoneCache.delete(key));
  zoneCache.set(key, p);
  return p;
}

async function renderZone(sampleRate: number, note: StarterNote): Promise<Zone> {
  const slot = note.role === 'ding' ? 8 : 5.5;
  const count = STARTER_LAYERS.length * STARTER_TAKES;
  const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * slot * count), sampleRate);
  const input = ctx.createGain();
  input.connect(ctx.destination);
  // The synth only needs a context and an input bus from the engine.
  const synth = new SynthHandpan({ context: ctx, input } as unknown as ConstructorParameters<typeof SynthHandpan>[0]);
  let i = 0;
  for (const layer of STARTER_LAYERS) {
    for (let take = 0; take < STARTER_TAKES; take++) {
      synth.noteOn(note.pitch, layer.strike, i * slot + 0.01, note.role);
      i++;
    }
  }
  const rendered = await ctx.startRendering();
  const src = rendered.getChannelData(0);
  const slotFrames = Math.floor(slot * sampleRate);

  i = 0;
  const layers = STARTER_LAYERS.map((layer) => {
    const takes: AudioBuffer[] = [];
    for (let take = 0; take < STARTER_TAKES; take++) {
      const buf = ctx.createBuffer(1, slotFrames, sampleRate);
      buf.copyToChannel(src.subarray(i * slotFrames, (i + 1) * slotFrames), 0);
      // A short fade at the tail so slicing never clicks.
      const data = buf.getChannelData(0);
      const fade = Math.min(data.length, Math.floor(sampleRate * 0.25));
      for (let k = 0; k < fade; k++) data[data.length - 1 - k]! *= k / fade;
      takes.push(buf);
      i++;
    }
    return { lo: layer.lo, hi: layer.hi, gain: 1, takes };
  });

  return { pitch: note.pitch, midi: midiFromPitch(note.pitch), role: note.role, layers };
}

/** Render zones for a set of notes and assemble them into a pack. */
export async function renderStarterPack(
  sampleRate: number,
  notes: StarterNote[],
  onProgress?: (p: RenderProgress) => void,
): Promise<ZoneSource> {
  const zones: Zone[] = [];
  let done = 0;
  onProgress?.({ done, total: notes.length, pitch: notes[0]?.pitch ?? '' });
  for (const note of notes) {
    zones.push(await renderStarterZone(sampleRate, note));
    done++;
    onProgress?.({ done, total: notes.length, pitch: note.pitch });
  }
  return packFromZones('Starter pack (rendered synth)', zones, { maxShift: 0 });
}
