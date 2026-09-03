import { layoutFromNotes } from './layout';
import {
  DEFAULT_SHELL, bottomHeightAt, buildShell, bumpHeight, bumpsFromLayout, dimpleNormalMap, domeHeight, topHeightAt,
} from './shell3d';

const layout = layoutFromNotes('t', [
  { pitch: 'D3' }, { pitch: 'A3' }, { pitch: 'C4' }, { pitch: 'D4' }, { pitch: 'E4' }, { pitch: 'C5', bottom: true },
]);

describe('domeHeight', () => {
  it('is highest at the centre, zero at the rim, monotonic between', () => {
    expect(domeHeight(0, 0.22, 0.035)).toBeCloseTo(0.22, 5);
    expect(domeHeight(1, 0.22, 0.035)).toBeCloseTo(0, 5);
    let prev = Infinity;
    for (let r = 0; r <= 1; r += 0.05) {
      const h = domeHeight(r, 0.22, 0.035);
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
  });
});

describe('bumps', () => {
  const { top, bottom } = bumpsFromLayout(layout);

  it('makes one bump per field with the ding at the centre', () => {
    expect(top.map((b) => b.id)).toEqual(['ding', 'top-0', 'top-1', 'top-2', 'top-3']);
    expect(bottom.map((b) => b.id)).toEqual(['bottom-0']);
    expect(top[0]).toMatchObject({ x: 0, y: -0, height: 0.045 });
  });

  it('raises the oval and sinks the dimple', () => {
    const b = top[1]!;
    const centre = bumpHeight(b, b.x, b.y);
    const ring = bumpHeight(b, b.x + b.dimpleRadius * 1.2, b.y);
    const shoulder = bumpHeight(b, b.x + b.rx * 0.9, b.y);
    const far = bumpHeight(b, b.x + b.rx * 1.3, b.y);
    expect(centre).toBeCloseTo(b.height - b.dimpleDepth, 3);
    expect(ring).toBeGreaterThan(b.height * 0.7);
    expect(ring).toBeLessThanOrEqual(b.height);
    expect(shoulder).toBeGreaterThan(0);
    expect(shoulder).toBeLessThan(ring);
    expect(far).toBe(0);
  });

  it('follows the oval orientation', () => {
    const b = { ...top[1]!, angleDeg: 90 };
    // With the tangent axis vertical, a point offset in y stays on the plateau longer than one offset in x.
    const alongTangent = bumpHeight(b, b.x, b.y + b.rx * 0.9);
    const alongRadius = bumpHeight(b, b.x + b.rx * 0.9, b.y);
    expect(alongTangent).toBeGreaterThan(alongRadius);
  });
});

describe('surfaces', () => {
  const { top, bottom } = bumpsFromLayout(layout);

  it('adds bumps onto the domes with the right sign', () => {
    const f = top[1]!;
    const x = f.x + f.dimpleRadius * 1.6;
    expect(topHeightAt(x, f.y, top)).toBeGreaterThan(topHeightAt(x, f.y, []));
    const b = bottom[0]!;
    const bx = b.x + b.dimpleRadius * 1.6;
    expect(bottomHeightAt(bx, b.y, bottom)).toBeLessThan(bottomHeightAt(bx, b.y, []));
    expect(bottomHeightAt(0.5, 0, bottom)).toBeLessThan(0);
  });

  it('winds top faces to face up and bottom faces to face down', () => {
    const shell = buildShell(layout, { ...DEFAULT_SHELL, rings: 4, segments: 8 });
    const faceUp = (s: typeof shell.top) => {
      const [a, b, c] = [s.indices[0]!, s.indices[1]!, s.indices[2]!];
      const p = (i: number) => [s.positions[i * 3]!, s.positions[i * 3 + 1]!, s.positions[i * 3 + 2]!] as const;
      const [ax, , az] = p(a), [bx, , bz] = p(b), [cx, , cz] = p(c);
      const ux = bx - ax, uz = bz - az;
      const vx = cx - ax, vz = cz - az;
      // y component of the cross product: counter-clockwise faces have it positive.
      return uz * vx - ux * vz;
    };
    // The first top triangle touches the degenerate centre; use one from the second ring.
    const second = { ...shell.top, indices: shell.top.indices.slice(8 * 6) };
    expect(faceUp(second)).toBeGreaterThan(0);
    expect(faceUp(shell.bottom)).toBeLessThan(0);
  });

  it('builds indexed grids with unit normals and an open gu underneath', () => {
    const shell = buildShell(layout, { ...DEFAULT_SHELL, rings: 20, segments: 32 });
    const verts = 21 * 33;
    expect(shell.top.positions).toHaveLength(verts * 3);
    expect(shell.top.indices).toHaveLength(20 * 32 * 6);
    expect(shell.top.uvs).toHaveLength(verts * 2);
    for (let i = 0; i < verts; i++) {
      const n = shell.top.normals;
      expect(Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!)).toBeCloseTo(1, 5);
      expect(n[i * 3 + 1]).toBeGreaterThan(0);
      expect(shell.bottom.normals[i * 3 + 1]).toBeLessThan(0);
    }
    // First ring of the underside sits on the gu radius, not at the centre.
    expect(Math.hypot(shell.bottom.positions[0]!, shell.bottom.positions[2]!)).toBeCloseTo(DEFAULT_SHELL.guRadius, 5);
    expect(Math.hypot(shell.top.positions[0]!, shell.top.positions[2]!)).toBeCloseTo(0, 5);
  });
});

describe('dimpleNormalMap', () => {
  const { top } = bumpsFromLayout(layout);

  it('is flat away from dimples and at their centres, tilted on their walls', () => {
    const size = 128;
    const map = dimpleNormalMap(top, size);
    const px = (x: number, y: number) => {
      const i = (Math.floor(((y + 1) / 2) * size) * size + Math.floor(((x + 1) / 2) * size)) * 4;
      return [map[i]!, map[i + 1]!, map[i + 2]!];
    };
    expect(px(0.9, 0.9)).toEqual([128, 128, 255]);
    const d = top[0]!; // ding, at the origin
    expect(px(d.x, d.y)[2]).toBe(255);
    // On the +x wall of the concave dimple the surface rises with x, so the normal leans toward -x.
    const wall = px(d.x + d.dimpleRadius * 0.7, d.y);
    expect(wall[0]).toBeLessThan(120);
    expect(wall[2]).toBeLessThan(255);
    const otherWall = px(d.x - d.dimpleRadius * 0.7, d.y);
    expect(otherWall[0]).toBeGreaterThan(136);
  });

  it('keeps dimples out of the geometry but bulges in', () => {
    const shell = buildShell(layout, { ...DEFAULT_SHELL, rings: 60, segments: 90 });
    const d = shell.bumps.top[1]!;
    const geomAtCentre = topHeightAt(d.x, d.y, shell.bumps.top, DEFAULT_SHELL, false);
    const geomOnRing = topHeightAt(d.x + d.dimpleRadius * 0.9, d.y, shell.bumps.top, DEFAULT_SHELL, false);
    expect(Math.abs(geomAtCentre - geomOnRing)).toBeLessThan(d.height * 0.15);
    expect(geomAtCentre).toBeGreaterThan(topHeightAt(d.x, d.y, [], DEFAULT_SHELL));
    expect(shell.top.positions.length).toBe(61 * 91 * 3);
  });
});
