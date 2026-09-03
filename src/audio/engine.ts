/**
 * Owns the AudioContext and the master chain:
 *
 *   instruments -> input -> dry ---------------------------\
 *                        \-> high-pass -> convolver -> wet --+-> bass shelf -> rumble cut -> limiter -> master -> out
 *
 * The reverb send is high-passed so the room never carries bass, and a
 * low shelf on the sum lets the listener trim low-mid weight for their
 * speakers. The context is created lazily and resumed on the first gesture.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private sendNode: GainNode | null = null;
  private dry!: GainNode;
  private wet!: GainNode;
  private master!: GainNode;
  private shelf!: BiquadFilterNode;
  private volume = 0.8;
  private reverbMix = 0.22;
  private bassDb = -3;

  get context(): AudioContext {
    if (!this.ctx) this.build();
    return this.ctx!;
  }

  /** Where instruments connect. */
  get input(): GainNode {
    if (!this.inputNode) this.build();
    return this.inputNode!;
  }

  /** An extra, wet-only send: short strokes need more room than sustained notes to sit in the same space. */
  get reverbSend(): GainNode {
    if (!this.sendNode) this.build();
    return this.sendNode!;
  }

  get now(): number {
    return this.context.currentTime;
  }

  /** Call from a user gesture; browsers keep the context suspended until then. */
  async resume(): Promise<void> {
    const ctx = this.context;
    if (ctx.state !== 'running') await ctx.resume();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    if (this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  getVolume(): number {
    return this.volume;
  }

  /** 0 = dry, 1 = fully wet. Uses an equal-power crossfade. */
  setReverb(mix: number): void {
    this.reverbMix = clamp01(mix);
    if (this.ctx) this.applyReverb();
  }

  getReverb(): number {
    return this.reverbMix;
  }

  /** Low shelf below about 220 Hz, in dB. Negative values thin out low-mid weight. */
  setBass(db: number): void {
    this.bassDb = Math.min(6, Math.max(-18, db));
    if (this.ctx) this.shelf.gain.setTargetAtTime(this.bassDb, this.ctx.currentTime, 0.02);
  }

  getBass(): number {
    return this.bassDb;
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.inputNode = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulseResponse(ctx, 2.6, 2.8);

    // Keep bass out of the room: it only muddies the sustain.
    const sendFilter = ctx.createBiquadFilter();
    sendFilter.type = 'highpass';
    sendFilter.frequency.value = 280;
    sendFilter.Q.value = 0.7;

    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 220;
    this.shelf.gain.value = this.bassDb;

    const rumble = ctx.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 50;
    rumble.Q.value = 0.7;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    this.sendNode = ctx.createGain();
    this.inputNode.connect(this.dry);
    this.inputNode.connect(sendFilter);
    this.sendNode.connect(sendFilter);
    sendFilter.connect(convolver);
    convolver.connect(this.wet);
    this.dry.connect(this.shelf);
    this.wet.connect(this.shelf);
    this.shelf.connect(rumble);
    rumble.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(ctx.destination);
    this.applyReverb();
  }

  private applyReverb(): void {
    const t = this.ctx!.currentTime;
    const mix = this.reverbMix;
    this.dry.gain.setTargetAtTime(Math.cos((mix * Math.PI) / 2), t, 0.02);
    this.wet.gain.setTargetAtTime(Math.sin((mix * Math.PI) / 2), t, 0.02);
  }
}

/**
 * A synthetic room: stereo exponentially decaying noise with a one-pole
 * low-pass that closes as the tail decays, so highs die first.
 */
export function makeImpulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    let dc = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      // Filter coefficient drifts from bright to dull along the tail.
      const alpha = 0.35 - 0.3 * t;
      lp += alpha * ((Math.random() * 2 - 1) - lp);
      // Remove the slow drift so the tail carries no rumble.
      dc += 0.002 * (lp - dc);
      data[i] = (lp - dc) * env;
    }
  }
  return buffer;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export const engine = new AudioEngine();
