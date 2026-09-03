import { layoutFromNotes } from './layout';
import { DEFAULT_SHELL, bottomHeightAt, buildShell, bumpHeight, bumpsFromLayout, domeHeight, topHeightAt } from './shell3d';

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
    expect(top[0]).toMatchObject({ x: 0, y: -0, height: 0.05 });
  });

  it('raises the oval and sinks the dimple', () => {
    const b = top[1]!;
    const centre = bumpHeight(b, b.x, b.y);
    const ring = bumpHeight(b, b.x + b.dimpleRadius * 1.6, b.y);
    const far = bumpHeight(b, b.x + b.rx * 2, b.y);
    expect(ring).toBeCloseTo(b.height, 3);
    expect(centre).toBeCloseTo(b.height - b.dimpleDepth, 3);
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
    const onField = topHeightAt(f.x + f.dimpleRadius * 1.6, f.y, top);
    const offField = topHeightAt(f.x + f.rx * 2.2, f.y, top);
    expect(onField).toBeGreaterThan(offField);
    const b = bottom[0]!;
    expect(bottomHeightAt(b.x + b.dimpleRadius * 1.6, b.y, bottom)).toBeLessThan(bottomHeightAt(b.x + b.rx * 2.2, b.y, bottom));
    expect(bottomHeightAt(0.5, 0, bottom)).toBeLessThan(0);
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
