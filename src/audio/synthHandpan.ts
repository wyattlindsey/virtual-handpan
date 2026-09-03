/**
 * Additive handpan voice.
 *
 * A handpan tone field is tuned so its first three partials sit at 1:2:3
 * (fundamental, octave, compound fifth). Each partial gets its own
 * exponential decay, higher partials die faster and respond more strongly to
 * velocity, a slightly detuned twin of the fundamental gives the slow
 * shimmer of a real field, and a short band-passed noise burst supplies the
 * strike. Lower pitches ring longer.
 */
import { frequencyFromPitch, midiFromPitch } from '../model/pitch';
import type { AudioEngine } from './engine';
import type { FieldRole, Instrument, PercussionKind, VoiceHandle } from './instrument';

interface Partial {
  ratio: number;
  gain: number;
  /** Seconds to decay by 60 dB at velocity 1 and MIDI 60. */
  t60: number;
  /** Velocity exponent: higher means the partial only shows up on hard strikes. */
  velExp: number;
}

const TONE_PARTIALS: Partial[] = [
  { ratio: 1, gain: 1.0, t60: 5.5, velExp: 1.0 },
  { ratio: 1.0028, gain: 0.25, t60: 4.5, velExp: 1.0 },
  { ratio: 2, gain: 0.5, t60: 3.4, velExp: 1.5 },
  { ratio: 3, gain: 0.3, t60: 2.4, velExp: 1.9 },
  { ratio: 4.16, gain: 0.06, t60: 0.7, velExp: 2.6 },
  { ratio: 5.43, gain: 0.035, t60: 0.4, velExp: 3.0 },
  { ratio: 6.8, gain: 0.02, t60: 0.25, velExp: 3.4 },
];

const DING_PARTIALS: Partial[] = [
  { ratio: 1, gain: 0.9, t60: 8.5, velExp: 1.0 },
  { ratio: 1.0018, gain: 0.28, t60: 7.0, velExp: 1.0 },
  { ratio: 2, gain: 0.55, t60: 5.0, velExp: 1.4 },
  { ratio: 3, gain: 0.32, t60: 3.4, velExp: 1.8 },
  { ratio: 4.02, gain: 0.08, t60: 1.6, velExp: 2.2 },
  { ratio: 5.6, gain: 0.03, t60: 0.5, velExp: 3.0 },
];

const MAX_VOICES = 28;
const ATTACK = 0.004;

class Voice implements VoiceHandle {
  private sources: AudioScheduledSourceNode[] = [];
  private stopAt = 0;
  private ended = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: GainNode,
    private readonly onEnd: (v: Voice) => void,
  ) {}

  start(freq: number, velocity: number, when: number, partials: Partial[], decayScale: number, noise: AudioBuffer): void {
    const ctx = this.ctx;
    const vel = Math.min(1, Math.max(0.02, velocity));
    // Whole-note detune of a few cents so repeated strikes are not identical.
    const detune = (Math.random() * 2 - 1) * 3;
    let longest = 0;

    // Low fundamentals dominate small speakers; tilt them down a little and let
    // the upper partials carry more of a low note's identity.
    const tilt = Math.min(1.1, Math.max(0.62, Math.pow(freq / 330, 0.3)));

    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.ratio;
      osc.detune.value = detune;
      const env = ctx.createGain();
      const peak = p.gain * Math.pow(vel, p.velExp) * (p.ratio < 1.5 ? tilt : 1);
      const t60 = p.t60 * decayScale * (0.85 + 0.3 * vel);
      const tau = t60 / 6.91;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(peak, when + ATTACK);
      env.gain.setTargetAtTime(0, when + ATTACK, tau);
      osc.connect(env).connect(this.out);
      osc.start(when);
      const stop = when + ATTACK + t60 * 1.05;
      osc.stop(stop);
      longest = Math.max(longest, stop);
      this.sources.push(osc);
    }

    // Strike transient: band-passed noise centred above the fundamental.
    const burst = ctx.createBufferSource();
    burst.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, 1800 + freq * 4);
    bp.Q.value = 0.9;
    const burstEnv = ctx.createGain();
    const burstPeak = 0.35 * Math.pow(vel, 1.6);
    burstEnv.gain.setValueAtTime(0, when);
    burstEnv.gain.linearRampToValueAtTime(burstPeak, when + 0.0015);
    burstEnv.gain.setTargetAtTime(0, when + 0.0015, 0.012);
    burst.connect(bp).connect(burstEnv).connect(this.out);
    burst.start(when);
    burst.stop(when + 0.12);
    this.sources.push(burst);

    this.stopAt = longest;
    const first = this.sources[0]!;
    first.onended = () => this.finish();
  }

  damp(when = this.ctx.currentTime, fadeSeconds = 0.09): void {
    if (this.ended) return;
    const t = Math.max(when, this.ctx.currentTime);
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.setTargetAtTime(0, t, fadeSeconds / 4);
    const stop = t + fadeSeconds + 0.05;
    for (const s of this.sources) {
      try { s.stop(Math.min(stop, this.stopAt || stop)); } catch { /* already stopped */ }
    }
    this.stopAt = stop;
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    for (const s of this.sources) s.disconnect();
    this.out.disconnect();
    this.onEnd(this);
  }
}

/**
 * Unpitched strokes. A tak is a fingertip on the shoulder: a bright, dry
 * click with a faint metallic ring and almost no body. A slap is the flat of
 * the fingers on the interstitial steel: broader, duller, with a little
 * shell thump. Neither sustains.
 */
class PercussionVoice implements VoiceHandle {
  private sources: AudioScheduledSourceNode[] = [];

  constructor(private readonly ctx: AudioContext, private readonly out: GainNode, private readonly onEnd: () => void) {}

  start(kind: PercussionKind, velocity: number, when: number, noise: AudioBuffer): void {
    const ctx = this.ctx;
    const vel = Math.min(1, Math.max(0.05, velocity));
    const tak = kind === 'tak';

    // The click: a band of noise, bright and very short for the tak, lower and a touch longer for the slap.
    const burst = ctx.createBufferSource();
    burst.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = tak ? 3600 + 800 * vel : 1500 + 400 * vel;
    bp.Q.value = tak ? 1.4 : 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = tak ? 1200 : 400;
    const env = ctx.createGain();
    const peak = (tak ? 0.55 : 0.7) * Math.pow(vel, 1.3);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + 0.0008);
    env.gain.setTargetAtTime(0, when + 0.0008, tak ? 0.006 : 0.014);
    burst.connect(hp).connect(bp).connect(env).connect(this.out);
    burst.start(when);
    burst.stop(when + (tak ? 0.05 : 0.09));
    this.sources.push(burst);

    // A metallic tink for the tak: two high partials dying in a few milliseconds.
    if (tak) {
      for (const [freq, gain, tau] of [[2650 + 300 * vel, 0.22, 0.009], [4150, 0.12, 0.005]] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain * vel, when + 0.0006);
        g.gain.setTargetAtTime(0, when + 0.0006, tau);
        osc.connect(g).connect(this.out);
        osc.start(when);
        osc.stop(when + 0.08);
        this.sources.push(osc);
      }
    }

    // Shell thump: the steel moves a little under the hand, more for the slap.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(tak ? 240 : 170, when);
    thump.frequency.exponentialRampToValueAtTime(tak ? 150 : 95, when + 0.04);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, when);
    tg.gain.linearRampToValueAtTime((tak ? 0.08 : 0.22) * vel, when + 0.002);
    tg.gain.setTargetAtTime(0, when + 0.002, tak ? 0.018 : 0.03);
    thump.connect(tg).connect(this.out);
    thump.start(when);
    thump.stop(when + 0.16);
    this.sources.push(thump);

    burst.onended = () => {
      for (const s of this.sources) s.disconnect();
      this.out.disconnect();
      this.onEnd();
    };
  }

  damp(): void {
    // Nothing to damp: these are over before a hand could reach them.
  }
}

export class SynthHandpan implements Instrument {
  readonly name = 'Synth handpan';
  private readonly bus: GainNode;
  private readonly noise: AudioBuffer;
  private readonly voices = new Set<Voice>();

  constructor(private readonly engine: AudioEngine) {
    const ctx = engine.context;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.3;
    this.bus.connect(engine.input);
    this.noise = makeNoise(ctx, 0.15);
  }

  noteOn(pitch: string, velocity: number, when?: number, role: FieldRole = 'top'): VoiceHandle {
    const ctx = this.engine.context;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    if (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.values().next().value;
      oldest?.damp(t, 0.06);
      if (oldest) this.voices.delete(oldest);
    }
    const out = ctx.createGain();
    out.gain.value = role === 'ding' ? 0.8 : 1;
    out.connect(this.bus);
    const voice = new Voice(ctx, out, (v) => this.voices.delete(v));
    const midi = midiFromPitch(pitch);
    // Lower notes ring longer; bottom notes are a touch shorter than top fields.
    let decayScale = Math.min(1.6, Math.max(0.55, Math.pow(2, (60 - midi) / 22)));
    if (role === 'bottom') decayScale *= 0.85;
    voice.start(
      frequencyFromPitch(pitch), velocity, t,
      role === 'ding' ? DING_PARTIALS : TONE_PARTIALS, decayScale, this.noise,
    );
    this.voices.add(voice);
    return voice;
  }

  hit(kind: PercussionKind, velocity: number, when?: number): VoiceHandle {
    const ctx = this.engine.context;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const out = ctx.createGain();
    out.connect(this.bus);
    const voice = new PercussionVoice(ctx, out, () => {});
    voice.start(kind, velocity, t, this.noise);
    return voice;
  }

  allNotesOff(fadeSeconds = 0.08): void {
    const now = this.engine.context.currentTime;
    for (const v of this.voices) v.damp(now, fadeSeconds);
    this.voices.clear();
  }

  dispose(): void {
    this.allNotesOff(0.02);
    this.bus.disconnect();
  }
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
