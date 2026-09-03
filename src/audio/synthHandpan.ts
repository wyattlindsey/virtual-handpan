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

/** A damped resonance of the shell excited by a stroke. */
interface Mode {
  freq: number;
  gain: number;
  /** Amplitude time constant in seconds; the mode falls 20 dB in about 2.3 tau. */
  tau: number;
}

/** Jitter a frequency by up to a fraction so no two strokes ring identically. */
function jitter(freq: number, fraction: number): number {
  return freq * (1 + (Math.random() * 2 - 1) * fraction);
}

/**
 * Shell modes rung by a tak, measured from performance recordings: a body
 * thump near 230 Hz, a weak mode around 600 Hz, a cluster around 1.3 to
 * 1.7 kHz, a stronger cluster around 2.2 to 3 kHz, and short bright modes
 * above that which only harder strikes bring out.
 */
function takModes(vel: number): Mode[] {
  return [
    { freq: jitter(230, 0.15), gain: 0.35, tau: 0.012 },
    { freq: jitter(700, 0.15), gain: 0.45, tau: 0.02 },
    { freq: jitter(1300, 0.08), gain: 0.5, tau: 0.028 },
    { freq: jitter(1650, 0.08), gain: 0.45, tau: 0.026 },
    { freq: jitter(2300, 0.06), gain: 0.6, tau: 0.022 },
    { freq: jitter(2750, 0.06), gain: 0.65, tau: 0.02 },
    { freq: jitter(3450, 0.05), gain: 0.8 * (0.5 + vel), tau: 0.016 },
    { freq: jitter(4200, 0.05), gain: 0.75 * (0.4 + vel), tau: 0.014 },
    { freq: jitter(4800, 0.05), gain: 0.2 + 0.6 * vel, tau: 0.012 },
    { freq: jitter(6200, 0.05), gain: 0.1 + 0.45 * vel, tau: 0.009 },
  ];
}

/** Flat fingers on the interstitial steel: the same shell, but the hand stays on it, so the upper modes die fast and the thump is bigger. */
function slapModes(vel: number): Mode[] {
  return [
    { freq: jitter(210, 0.15), gain: 0.55, tau: 0.018 },
    { freq: jitter(330, 0.12), gain: 0.3, tau: 0.016 },
    { freq: jitter(620, 0.12), gain: 0.35, tau: 0.02 },
    { freq: jitter(1250, 0.08), gain: 0.85, tau: 0.032 },
    { freq: jitter(1500, 0.08), gain: 0.75, tau: 0.03 },
    { freq: jitter(1750, 0.08), gain: 0.5, tau: 0.024 },
    { freq: jitter(2400, 0.06), gain: 0.5, tau: 0.016 },
    { freq: jitter(3000, 0.06), gain: 0.4 * vel, tau: 0.012 },
  ];
}

/**
 * Unpitched strokes as modal synthesis: a burst of contact noise for the
 * fingertip, then the shell's own resonances ringing down over roughly a
 * tenth of a second.
 */
class PercussionVoice implements VoiceHandle {
  private sources: AudioScheduledSourceNode[] = [];

  constructor(private readonly ctx: AudioContext, private readonly out: GainNode, private readonly onEnd: () => void) {}

  start(kind: PercussionKind, velocity: number, when: number, noise: AudioBuffer): void {
    const ctx = this.ctx;
    const vel = Math.min(1, Math.max(0.05, velocity));
    const tak = kind === 'tak';
    const level = 0.32 * Math.pow(vel, 1.2);
    let longest = 0;

    for (const m of (tak ? takModes(vel) : slapModes(vel))) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = m.freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(m.gain * level, when + 0.0007);
      g.gain.setTargetAtTime(0, when + 0.0007, m.tau);
      osc.connect(g).connect(this.out);
      osc.start(when);
      const stop = when + m.tau * 8;
      osc.stop(stop);
      longest = Math.max(longest, stop);
      this.sources.push(osc);
    }

    // Contact noise: the fingertip itself, bright and over in a few milliseconds.
    const burst = ctx.createBufferSource();
    burst.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = tak ? 7500 : 2200;
    bp.Q.value = tak ? 0.7 : 0.7;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime((tak ? 1.3 : 0.6) * level, when + 0.0006);
    env.gain.setTargetAtTime(0, when + 0.0006, tak ? 0.004 : 0.007);
    burst.connect(bp).connect(env).connect(this.out);
    burst.start(when);
    burst.stop(when + 0.06);
    this.sources.push(burst);

    const last = this.sources[0]!;
    last.onended = () => {
      for (const s of this.sources) s.disconnect();
      this.out.disconnect();
      this.onEnd();
    };
    void longest;
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
  /** The instrument's notes, ding first, so strokes can ring the pan sympathetically. */
  private resonant: string[] = [];

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

  /** Tell the synth which notes are on the pan; a stroke faintly rings the ding and a nearby field. */
  setResonantPitches(pitches: string[]): void {
    this.resonant = pitches;
  }

  hit(kind: PercussionKind, velocity: number, when?: number): VoiceHandle {
    const ctx = this.engine.context;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const out = ctx.createGain();
    out.connect(this.bus);
    // Short strokes reveal the room more than ringing notes do; give them extra send.
    const room = ctx.createGain();
    room.gain.value = 0.9;
    out.connect(room).connect(this.engine.reverbSend);
    const voice = new PercussionVoice(ctx, out, () => room.disconnect());
    voice.start(kind, velocity, t, this.noise);

    // The whole pan answers a stroke on its shoulder: the ding and one field ring faintly and are damped by the hand.
    const vel = Math.min(1, Math.max(0.05, velocity));
    const ding = this.resonant[0];
    if (ding) {
      const v = this.noteOn(ding, 0.16 * vel, t, 'ding');
      v.damp(t + (kind === 'tak' ? 0.32 : 0.18), 0.22);
    }
    if (this.resonant.length > 1) {
      const field = this.resonant[1 + Math.floor(Math.random() * (this.resonant.length - 1))]!;
      const v = this.noteOn(field, 0.1 * vel, t, 'top');
      v.damp(t + (kind === 'tak' ? 0.24 : 0.14), 0.18);
    }
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
