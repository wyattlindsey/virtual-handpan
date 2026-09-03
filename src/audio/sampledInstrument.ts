/**
 * Sample playback behind the Instrument interface: nearest-zone selection
 * with pitch shifting for uncovered notes, velocity layers with an
 * equal-power crossfade, round robin per layer, and a fallback instrument
 * for pitches the pack does not reach.
 */
import { midiFromPitch } from '../model/pitch';
import type { AudioEngine } from './engine';
import type { FieldRole, Instrument, PercussionKind, VoiceHandle } from './instrument';
import type { ZoneSource } from './lazyPack';
import { RoundRobin, layerWeights, rateForShift, selectZone } from './samplePack';

export interface SampledInstrumentOptions {
  /** Plays pitches the pack cannot reach. Without one those strikes are silent. */
  fallback?: Instrument;
  roundRobin?: 'cycle' | 'random';
  /** Exponent mapping velocity to level on top of the layers' own dynamics. Default 0.6. */
  velocityCurve?: number;
}

const MAX_VOICES = 32;
const SILENT: VoiceHandle = { damp() {} };

class SampleVoice implements VoiceHandle {
  private sources: AudioBufferSourceNode[] = [];
  private ended = false;
  private stopAt = Infinity;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: GainNode,
    private readonly onEnd: (v: SampleVoice) => void,
  ) {}

  add(buffer: AudioBuffer, gain: number, rate: number, when: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.out);
    src.start(when);
    this.sources.push(src);
  }

  arm(): void {
    if (this.sources.length === 0) { this.finish(); return; }
    let remaining = this.sources.length;
    for (const s of this.sources) s.onended = () => { if (--remaining === 0) this.finish(); };
  }

  damp(when = this.ctx.currentTime, fadeSeconds = 0.09): void {
    if (this.ended) return;
    const t = Math.max(when, this.ctx.currentTime);
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.setTargetAtTime(0, t, fadeSeconds / 4);
    const stop = t + fadeSeconds + 0.05;
    if (stop < this.stopAt) {
      this.stopAt = stop;
      for (const s of this.sources) { try { s.stop(stop); } catch { /* not started or already stopped */ } }
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    for (const s of this.sources) s.disconnect();
    this.out.disconnect();
    this.onEnd(this);
  }
}

export class SampledInstrument implements Instrument {
  readonly name: string;
  private readonly bus: GainNode;
  private readonly voices = new Set<SampleVoice>();
  private readonly rr: RoundRobin;
  private readonly fallback: Instrument | undefined;
  private readonly velocityCurve: number;

  /** The pack may be lazy: its zones can grow and shrink while the instrument lives. */
  constructor(private readonly engine: AudioEngine, readonly pack: ZoneSource, opts: SampledInstrumentOptions = {}) {
    this.name = pack.name;
    this.fallback = opts.fallback;
    this.rr = new RoundRobin(opts.roundRobin ?? 'cycle');
    this.velocityCurve = opts.velocityCurve ?? 0.6;
    const ctx = engine.context;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.8;
    this.bus.connect(engine.input);
  }

  /** True when the pack has a zone within reach of the pitch. */
  covers(pitch: string, role?: FieldRole): boolean {
    return selectZone(this.pack.zones, midiFromPitch(pitch), role, this.pack.maxShift) !== null;
  }

  noteOn(pitch: string, velocity: number, when?: number, role: FieldRole = 'top'): VoiceHandle {
    const ctx = this.engine.context;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const midi = midiFromPitch(pitch);
    const match = selectZone(this.pack.zones, midi, role, this.pack.maxShift);
    if (!match) return this.fallback ? this.fallback.noteOn(pitch, velocity, t, role) : SILENT;

    if (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.values().next().value;
      if (oldest) { oldest.damp(t, 0.06); this.voices.delete(oldest); }
    }

    const vel = Math.min(1, Math.max(0.02, velocity));
    const level = Math.pow(vel, this.velocityCurve);
    const rate = rateForShift(match.shift) * (440 / this.pack.a4);
    const out = ctx.createGain();
    out.connect(this.bus);
    const voice = new SampleVoice(ctx, out, (v) => this.voices.delete(v));
    for (const { layer, weight } of layerWeights(match.zone.layers, vel, this.pack.crossfade)) {
      voice.add(this.rr.next(layer), layer.gain * weight * level, rate, t);
    }
    voice.arm();
    this.voices.add(voice);
    return voice;
  }

  /** Packs carry no percussion zones yet; the synth's strokes stand in. */
  hit(kind: PercussionKind, velocity: number, when?: number): VoiceHandle {
    return this.fallback ? this.fallback.hit(kind, velocity, when) : SILENT;
  }

  allNotesOff(fadeSeconds = 0.08): void {
    const now = this.engine.context.currentTime;
    for (const v of this.voices) v.damp(now, fadeSeconds);
    this.voices.clear();
    this.fallback?.allNotesOff(fadeSeconds);
  }

  dispose(): void {
    this.allNotesOff(0.02);
    this.bus.disconnect();
  }
}
