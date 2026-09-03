/**
 * Geometry of the shell as two heightfields over a disc: a shallow dome for
 * the top with raised tone fields and concave dimples, and a mirrored dome
 * for the underside with its bottom notes and the gu.
 *
 * Coordinates follow the layout module: x to the right, "y" from fieldXY
 * runs toward the player, and height is the third axis. Pure functions so
 * the shape can be unit tested and rebuilt whenever the layout changes.
 */
import { type FieldPosition, type Layout, bottomFieldPositions, dingPosition, fieldXY, topFieldPositions } from './layout';

export interface ShellParams {
  /** Height of the top dome at its centre, in shell radii. */
  topHeight: number;
  /** Depth of the bottom dome at its centre. */
  bottomHeight: number;
  /** Radius of the gu (port) on the underside. */
  guRadius: number;
  /** Width of the flat rim band. */
  rimWidth: number;
  rings: number;
  segments: number;
}

export const DEFAULT_SHELL: ShellParams = {
  topHeight: 0.22,
  bottomHeight: 0.2,
  guRadius: 0.15,
  rimWidth: 0.035,
  rings: 150,
  segments: 240,
};

/** A raised oval with a concave dimple at its centre. */
export interface Bump {
  id: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  angleDeg: number;
  height: number;
  dimpleRadius: number;
  dimpleDepth: number;
}

export function bumpFromField(f: FieldPosition): Bump {
  const { x, y } = fieldXY(f);
  if (f.side === 'ding') {
    const r = 0.17 * f.size * 1.08;
    return { id: f.id, x, y, rx: r, ry: r, angleDeg: 0, height: 0.05, dimpleRadius: r * 0.32, dimpleDepth: 0.028 };
  }
  const scale = f.side === 'bottom' ? 1.0 : 1.12;
  return {
    id: f.id, x, y,
    rx: 0.135 * f.size * scale,
    ry: 0.105 * f.size * scale,
    angleDeg: f.angleDeg,
    height: f.side === 'bottom' ? 0.022 : 0.026,
    dimpleRadius: 0.052 * f.size,
    dimpleDepth: 0.026,
  };
}

export function bumpsFromLayout(layout: Layout): { top: Bump[]; bottom: Bump[] } {
  return {
    top: [dingPosition(layout), ...topFieldPositions(layout)].map(bumpFromField),
    bottom: bottomFieldPositions(layout).map(bumpFromField),
  };
}

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Height a bump adds at a point: a plateau-edged oval minus a rounded dimple. */
export function bumpHeight(b: Bump, x: number, y: number): number {
  const dx = x - b.x;
  const dy = y - b.y;
  const rad = (b.angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Rotate into the oval's frame: rx runs along the tangent, ry along the radius.
  const u = dx * c + dy * s;
  const v = -dx * s + dy * c;
  const d = Math.sqrt((u / b.rx) ** 2 + (v / b.ry) ** 2);
  // A gentle bulge: flat over the dimple, then a long rounded shoulder.
  let h = b.height * (1 - smoothstep(0.3, 1.2, d));
  const dd = Math.hypot(dx, dy) / b.dimpleRadius;
  if (dd < 1) h -= b.dimpleDepth * (1 - dd * dd);
  return h;
}

/** Spherical-cap dome of height h over radius 1, flattening into the rim band. */
export function domeHeight(r: number, h: number, rimWidth: number): number {
  const sphereR = (1 + h * h) / (2 * h);
  const cap = Math.sqrt(Math.max(0, sphereR * sphereR - r * r)) - (sphereR - h);
  // Blend to zero across the rim band.
  const t = smoothstep(1 - rimWidth * 2.2, 1 - rimWidth * 0.2, r);
  return cap * (1 - t);
}

/** Height of the top surface at a point (positive up). */
export function topHeightAt(x: number, y: number, bumps: readonly Bump[], p: ShellParams = DEFAULT_SHELL): number {
  const r = Math.hypot(x, y);
  let h = domeHeight(r, p.topHeight, p.rimWidth);
  for (const b of bumps) h += bumpHeight(b, x, y);
  return h;
}

/** Height of the bottom surface at a point (negative, bumps protrude downward). */
export function bottomHeightAt(x: number, y: number, bumps: readonly Bump[], p: ShellParams = DEFAULT_SHELL): number {
  const r = Math.hypot(x, y);
  let h = domeHeight(r, p.bottomHeight, p.rimWidth);
  for (const b of bumps) h += bumpHeight(b, x, y);
  return -h;
}

export interface SurfaceData {
  /** x, height, y triples, ready for a three.js position attribute (y up). */
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * Tessellate a heightfield over an annulus [innerR, 1] as a polar grid.
 * `heightAt(x, y)` gives the surface height; `up` is +1 for a surface whose
 * normal points up, -1 for the underside.
 */
export function buildSurface(
  heightAt: (x: number, y: number) => number,
  up: 1 | -1,
  p: ShellParams = DEFAULT_SHELL,
  innerR = 0,
): SurfaceData {
  const rings = p.rings;
  const segs = p.segments;
  const cols = segs + 1;
  const count = (rings + 1) * cols;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const eps = 1e-3;
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    // Slightly denser toward the outside where the fields sit.
    const t = i / rings;
    const r = innerR + (1 - innerR) * Math.pow(t, 0.85);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const h = heightAt(x, y);
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = y;
      // Normal from finite differences of the height field.
      const hx = (heightAt(x + eps, y) - heightAt(x - eps, y)) / (2 * eps);
      const hy = (heightAt(x, y + eps) - heightAt(x, y - eps)) / (2 * eps);
      let nx = -hx, ny = 1, nz = -hy;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      normals[k * 3] = nx * up;
      normals[k * 3 + 1] = ny * up;
      normals[k * 3 + 2] = nz * up;
      uvs[k * 2] = 0.5 + x / 2;
      uvs[k * 2 + 1] = 0.5 - y / 2;
      k++;
    }
  }
  const indices = new Uint32Array(rings * segs * 6);
  let q = 0;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Angle increases clockwise seen from above, so (a, b, c) faces up.
      if (up === 1) {
        indices[q++] = a; indices[q++] = b; indices[q++] = c;
        indices[q++] = b; indices[q++] = d; indices[q++] = c;
      } else {
        indices[q++] = a; indices[q++] = c; indices[q++] = b;
        indices[q++] = b; indices[q++] = c; indices[q++] = d;
      }
    }
  }
  return { positions, normals, uvs, indices };
}

export interface ShellGeometry {
  top: SurfaceData;
  bottom: SurfaceData;
  bumps: { top: Bump[]; bottom: Bump[] };
}

export function buildShell(layout: Layout, p: ShellParams = DEFAULT_SHELL): ShellGeometry {
  const bumps = bumpsFromLayout(layout);
  return {
    top: buildSurface((x, y) => topHeightAt(x, y, bumps.top, p), 1, p),
    bottom: buildSurface((x, y) => bottomHeightAt(x, y, bumps.bottom, p), -1, p, p.guRadius),
    bumps,
  };
}
