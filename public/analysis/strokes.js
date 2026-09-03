// Spectrogram-based stroke finder for handpan recordings.
// Taks and slaps are broadband clicks with no new tonal energy below ~1 kHz; note attacks
// bring a ringing fundamental with them. We compare the attack frame with the frames just
// before it, band by band, and time how fast the high band falls back.

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export async function decode(url) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const buf = await ctx.decodeAudioData(bytes);
  const n = buf.length, x = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / buf.numberOfChannels; }
  return { x, sr: buf.sampleRate, seconds: buf.duration };
}

/** Magnitude spectrogram frames (n = 1024, hop = 256) over [start, end) seconds. */
export function stft(x, sr, start = 0, end = Infinity, n = 1024, hop = 256) {
  const s0 = Math.floor(start * sr), s1 = Math.min(x.length, Math.floor(end * sr));
  const frames = Math.max(0, Math.floor((s1 - s0 - n) / hop));
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  const mags = new Array(frames);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let f = 0; f < frames; f++) {
    const base = s0 + f * hop;
    for (let i = 0; i < n; i++) { re[i] = x[base + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const m = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]);
    mags[f] = m;
  }
  return { mags, hop, n, s0, hz: (i) => i * sr / n };
}

const BANDS = [['sub', 0, 300], ['low', 300, 1000], ['mid', 1000, 3000], ['high', 3000, 8000], ['air', 8000, 24000]];

function bandEnergy(m, hz, lo, hi) {
  let e = 0;
  for (let i = 1; i < m.length; i++) { const f = hz(i); if (f >= lo && f < hi) e += m[i] * m[i]; }
  return e;
}

/**
 * Find strokes. An onset is a jump in the 2 to 9 kHz band; its residual spectrum is the
 * attack frame minus the median of the four frames before it. A stroke has most of its
 * residual above 1 kHz and its high band falls 20 dB within a few frames.
 */
export function findStrokes(x, sr, { start = 0, end = Infinity, minGapMs = 70 } = {}) {
  const { mags, hop, n, s0, hz } = stft(x, sr, start, end);
  const frameMs = hop / sr * 1000;
  const hf = new Float64Array(mags.length);
  for (let f = 0; f < mags.length; f++) hf[f] = bandEnergy(mags[f], hz, 2000, 9000);
  // Adaptive floor: median of a 0.5 s window of the high band.
  const w = Math.round(500 / frameMs);
  const events = [];
  let lastOnset = -Infinity;
  const maxHf = Math.max(...hf) || 1;
  for (let f = 4; f < mags.length - 20; f++) {
    const prev = hf[f - 1], jump = hf[f] / (prev + 1e-12);
    if (jump < 6 || hf[f] < maxHf * 1e-4) continue;
    if ((f - lastOnset) * frameMs < minGapMs) continue;
    // Peak of the high band within the next 3 frames.
    let pk = f, pv = hf[f];
    for (let g = f; g <= f + 3 && g < hf.length; g++) if (hf[g] > pv) { pv = hf[g]; pk = g; }
    const decayTo = (db) => { const target = pv * Math.pow(10, db / 10); for (let g = pk; g < hf.length; g++) if (hf[g] < target) return (g - pk) * frameMs; return Infinity; };
    const hf20 = decayTo(-20), hf30 = decayTo(-30);
    // Residual spectrum: attack minus the median of the four frames before the onset.
    const attack = mags[pk];
    const res = new Float64Array(attack.length);
    for (let i = 0; i < attack.length; i++) {
      const b = [mags[f - 1][i], mags[f - 2][i], mags[f - 3][i], mags[f - 4][i]].sort((p, q) => p - q);
      res[i] = Math.max(0, attack[i] - (b[1] + b[2]) / 2);
    }
    const bands = {};
    let total = 0;
    for (const [name, lo, hi] of BANDS) { bands[name] = bandEnergy(res, hz, lo, hi); total += bands[name]; }
    for (const k in bands) bands[k] = +(bands[k] / (total || 1)).toFixed(3);
    let num = 0, den = 0;
    for (let i = 1; i < res.length; i++) { num += hz(i) * res[i]; den += res[i]; }
    const peaks = [];
    for (let i = 2; i < res.length - 2; i++) if (res[i] > res[i - 1] && res[i] > res[i + 1] && res[i] > res[i - 2] && res[i] > res[i + 2]) peaks.push({ hz: Math.round(hz(i)), mag: res[i] });
    peaks.sort((a, b) => b.mag - a.mag);
    const top = peaks[0]?.mag || 1;
    // Does a new low tone ring after the attack? Compare the low band 150 ms later with before.
    const later = Math.min(mags.length - 1, pk + Math.round(150 / frameMs));
    const lowBefore = bandEnergy(mags[f - 2], hz, 100, 1000), lowLater = bandEnergy(mags[later], hz, 100, 1000);
    events.push({
      t: +((s0 + pk * hop) / sr).toFixed(3), level: +(10 * Math.log10(pv / maxHf)).toFixed(1),
      hf20, hf30, bands, centroid: Math.round(den > 0 ? num / den : 0),
      peaks: peaks.slice(0, 6).map((p) => ({ hz: p.hz, db: +(20 * Math.log10(p.mag / top)).toFixed(1) })),
      lowRise: +(10 * Math.log10((lowLater + 1e-12) / (lowBefore + 1e-12))).toFixed(1),
      stroke: (bands.mid + bands.high + bands.air) >= 0.6 && hf20 <= 60,
    });
    lastOnset = pk;
  }
  return events;
}

export function summarize(events) {
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) * p)] : null; };
  const avg = {};
  for (const [name] of BANDS) avg[name] = +(events.reduce((s, e) => s + e.bands[name], 0) / (events.length || 1)).toFixed(3);
  const hist = {};
  for (const e of events) for (const p of e.peaks.slice(0, 4)) { const b = Math.round(p.hz / 250) * 250; hist[b] = (hist[b] || 0) + 1; }
  return {
    count: events.length,
    hf20: { q25: q(events.map((e) => e.hf20), 0.25), median: med(events.map((e) => e.hf20)), q75: q(events.map((e) => e.hf20), 0.75) },
    hf30: { median: med(events.map((e) => e.hf30)) },
    centroid: { q25: q(events.map((e) => e.centroid), 0.25), median: med(events.map((e) => e.centroid)), q75: q(events.map((e) => e.centroid), 0.75) },
    lowRise: med(events.map((e) => e.lowRise)),
    bands: avg,
    peakHz: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([hz, c]) => `${hz}:${c}`),
  };
}

export async function analyze(url, opts = {}) {
  const { x, sr, seconds } = await decode(url);
  const events = findStrokes(x, sr, opts);
  const strokes = events.filter((e) => e.stroke);
  const notes = events.filter((e) => !e.stroke && e.bands.low + e.bands.sub >= 0.5);
  return { seconds: +seconds.toFixed(1), onsets: events.length, strokes: summarize(strokes), noteAttacks: summarize(notes), examples: strokes.slice(0, 6) };
}
