/**
 * Procedural colour and roughness maps for nitrided steel: cobalt base,
 * violet and teal heat blotches, fine grain. Drawn once onto canvases and
 * reused as textures.
 */

export interface HeatTintMaps {
  color: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeHeatTintMaps(size = 1024, seed = 11): HeatTintMaps {
  const color = document.createElement('canvas');
  color.width = color.height = size;
  const ctx = color.getContext('2d')!;
  const rnd = mulberry(seed);
  const c = size / 2;

  // Base: cobalt, darker toward the rim.
  const base = ctx.createRadialGradient(c * 0.85, c * 0.8, size * 0.05, c, c, c);
  base.addColorStop(0, '#3b73aa');
  base.addColorStop(0.45, '#264d82');
  base.addColorStop(0.85, '#162b50');
  base.addColorStop(1, '#0f1d36');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Heat blotches: layered soft discs in violet, then fewer in teal and a hint of bronze.
  const blotch = (n: number, rgb: string, rMin: number, rMax: number, alpha: number) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * c * 0.98;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      const r = (rMin + rnd() * (rMax - rMin)) * size;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(0.6, `rgba(${rgb}, ${alpha * 0.45})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  blotch(26, '108, 82, 160', 0.08, 0.2, 0.2);
  blotch(18, '64, 138, 196', 0.08, 0.22, 0.18);
  blotch(8, '150, 115, 95', 0.03, 0.08, 0.08);
  blotch(22, '84, 62, 138', 0.03, 0.08, 0.16);

  // Fine grain.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] = clamp8(d[i]! + n);
    d[i + 1] = clamp8(d[i + 1]! + n);
    d[i + 2] = clamp8(d[i + 2]! + n);
  }
  ctx.putImageData(img, 0, 0);

  // Roughness: mid grey with soft variation so reflections break up like brushed steel.
  const roughness = document.createElement('canvas');
  roughness.width = roughness.height = size / 2;
  const rc = roughness.getContext('2d')!;
  rc.fillStyle = '#8a8a8a';
  rc.fillRect(0, 0, roughness.width, roughness.height);
  const rr = mulberry(seed + 1);
  for (let i = 0; i < 60; i++) {
    const x = rr() * roughness.width;
    const y = rr() * roughness.height;
    const r = (0.04 + rr() * 0.14) * roughness.width;
    const v = 110 + Math.floor(rr() * 70);
    const g = rc.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v}, ${v}, ${v}, 0.7)`);
    g.addColorStop(1, `rgba(${v}, ${v}, ${v}, 0)`);
    rc.fillStyle = g;
    rc.beginPath();
    rc.arc(x, y, r, 0, Math.PI * 2);
    rc.fill();
  }
  // Brushed streaks.
  rc.globalAlpha = 0.08;
  for (let i = 0; i < 400; i++) {
    const a = rr() * Math.PI * 2;
    const r0 = rr() * roughness.width * 0.5;
    const cx = roughness.width / 2, cy = roughness.height / 2;
    rc.strokeStyle = rr() > 0.5 ? '#c0c0c0' : '#606060';
    rc.beginPath();
    rc.arc(cx, cy, r0, a, a + 0.2 + rr() * 0.6);
    rc.stroke();
  }
  rc.globalAlpha = 1;

  return { color, roughness };
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
