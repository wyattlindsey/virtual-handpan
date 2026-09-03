/**
 * Owns the AudioContext and the master chain:
 *
 *   instruments -> input -> dry ------------------\
 *                        \-> convolver -> wet ----+-> limiter -> master -> destination
 *
 * The context is created lazily and resumed on the first user gesture.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private dry!: GainNode;
  private wet!: GainNode;
  private master!: GainNode;
  private volume = 0.8;
  private reverbMix = 0.22;

  get context(): AudioContext {
    if (!this.ctx) this.build();
    return this.ctx!;
  }

  /** Where instruments connect. */
  get input(): GainNode {
    if (!this.inputNode) this.build();
    return this.inputNode!;
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

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    this.inputNode.connect(this.dry);
    this.inputNode.connect(convolver);
    convolver.connect(this.wet);
    this.dry.connect(limiter);
    this.wet.connect(limiter);
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
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      // Filter coefficient drifts from bright to dull along the tail.
      const alpha = 0.35 - 0.3 * t;
      lp += alpha * ((Math.random() * 2 - 1) - lp);
      data[i] = lp * env;
    }
  }
  return buffer;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export const engine = new AudioEngine();
