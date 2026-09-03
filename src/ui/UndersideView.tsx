/**
 * Picture-in-picture view of the underside: the gu (port) in the centre and
 * the bottom notes around it, mirrored because the pan has been turned over.
 */
import { type Layout, bottomFieldPositions, fieldXY } from '../model/layout';
import { type Spelling, formatPitch } from '../model/pitch';
import { type StrikeInfo, pointerVelocity } from './PanView';

interface Props {
  layout: Layout;
  spelling: Spelling;
  flashes: Record<string, number>;
  keyHints?: Record<string, string>;
  onStrike: (info: StrikeInfo) => void;
}

export function UndersideView({ layout, spelling, flashes, keyHints, onStrike }: Props) {
  const bottom = bottomFieldPositions(layout);
  return (
    <svg className="pan underside" viewBox="-1.12 -1.12 2.24 2.24" role="group" aria-label="Handpan, underside">
      <defs>
        <radialGradient id="uv-shell" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#2f343c" />
          <stop offset="70%" stopColor="#262a31" />
          <stop offset="100%" stopColor="#1a1d22" />
        </radialGradient>
        <radialGradient id="uv-gu" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#05060a" />
          <stop offset="80%" stopColor="#0d0f14" />
          <stop offset="100%" stopColor="#3a404a" />
        </radialGradient>
        <radialGradient id="uv-field" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#6c7482" />
          <stop offset="70%" stopColor="#41474f" />
          <stop offset="100%" stopColor="#2c3138" />
        </radialGradient>
      </defs>
      <circle r="1" fill="url(#uv-shell)" />
      <circle r="1" fill="none" stroke="#0f1115" strokeWidth="0.03" />
      <circle r="0.16" fill="url(#uv-gu)" stroke="#4a515c" strokeWidth="0.008" />

      {/* Mirror horizontally: looking at the underside after flipping the pan toward you. */}
      <g transform="scale(-1 1)">
        {bottom.map((f) => {
          const { x, y } = fieldXY(f);
          const rx = 0.135 * f.size;
          const ry = 0.105 * f.size;
          const flash = flashes[f.id];
          return (
            <g
              key={f.id}
              className="field"
              transform={`translate(${x} ${y})`}
              onPointerDown={(e) => onStrike({ fieldId: f.id, pitch: f.pitch, side: 'bottom', velocity: pointerVelocity(e) })}
              role="button"
              aria-label={`${formatPitch(f.pitch, spelling)} bottom note`}
            >
              <g transform={`rotate(${-f.angleDeg})`}>
                <ellipse rx={rx} ry={ry} fill="url(#uv-field)" stroke="#1c2026" strokeWidth="0.006" />
                <circle r={0.03 * f.size} fill="#1d2026" />
                {flash !== undefined && <ellipse key={flash} className="flash" rx={rx} ry={ry} />}
              </g>
              {/* Un-mirror the text so it reads normally. */}
              <g transform="scale(-1 1)">
                <text className="label" y={ry + 0.085} textAnchor="middle">{formatPitch(f.pitch, spelling)}</text>
                {keyHints?.[f.id] && <text className="key-hint" y={-ry - 0.035} textAnchor="middle">{keyHints[f.id]}</text>}
              </g>
            </g>
          );
        })}
      </g>
      {bottom.length === 0 && (
        <text className="label" y="0.55" textAnchor="middle" opacity="0.6">no bottom notes</text>
      )}
    </svg>
  );
}
