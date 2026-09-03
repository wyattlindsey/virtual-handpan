/**
 * The instrument's look: gradients, filters and the drawing of the shell,
 * tone fields and ding. Modelled on nitrided steel with a heat-tint finish,
 * deep cobalt blue with violet blotches. Light comes from the upper left, so
 * domes are lit on the upper left and concave dimples on their lower right
 * inner wall.
 *
 * Everything is parameterised by an id prefix so two SVGs on one page do not
 * share gradient ids.
 */

interface SkinProps {
  prefix: string;
}

export function SkinDefs({ prefix }: SkinProps) {
  const id = (n: string) => `${prefix}-${n}`;
  return (
    <defs>
      {/* Shell body: satin steel blue, darkest toward the far rim. */}
      <radialGradient id={id('shell')} cx="38%" cy="32%" r="82%">
        <stop offset="0%" stopColor="#4f8dc2" />
        <stop offset="22%" stopColor="#35699d" />
        <stop offset="50%" stopColor="#213f6b" />
        <stop offset="78%" stopColor="#132542" />
        <stop offset="100%" stopColor="#0a1426" />
      </radialGradient>
      <radialGradient id={id('shell-under')} cx="45%" cy="40%" r="80%">
        <stop offset="0%" stopColor="#2e5a86" />
        <stop offset="35%" stopColor="#1e3c62" />
        <stop offset="75%" stopColor="#111f38" />
        <stop offset="100%" stopColor="#080f1d" />
      </radialGradient>
      {/* Darkening band where the shell curves down to the rim. */}
      <radialGradient id={id('rim-shade')} cx="50%" cy="50%" r="50%">
        <stop offset="80%" stopColor="#000" stopOpacity="0" />
        <stop offset="94%" stopColor="#000" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.6" />
      </radialGradient>
      {/* Broad soft window reflection. */}
      <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
        <stop offset="45%" stopColor="#fff" stopOpacity="0.04" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      {/* Heat-tint blotches: noise turned into a violet or teal veil, clipped to the shape. */}
      <filter id={id('blotch-violet')} x="-5%" y="-5%" width="110%" height="110%" primitiveUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="1.35" numOctaves="3" seed="7" result="noise" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.46  0 0 0 0 0.28  0 0 0 0 0.66  0 0 0 2.2 -0.75"
          result="tint"
        />
        <feComposite in="tint" in2="SourceGraphic" operator="in" />
      </filter>
      <filter id={id('blotch-teal')} x="-5%" y="-5%" width="110%" height="110%" primitiveUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="19" result="noise" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.30  0 0 0 0 0.62  0 0 0 0 0.78  0 0 0 2.0 -0.85"
          result="tint"
        />
        <feComposite in="tint" in2="SourceGraphic" operator="in" />
      </filter>
      {/* Fine brushed grain. */}
      <filter id={id('grain')} x="-5%" y="-5%" width="110%" height="110%" primitiveUnits="userSpaceOnUse">
        <feTurbulence type="fractalNoise" baseFrequency="60 6" numOctaves="1" seed="3" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 -0.2" result="g" />
        <feComposite in="g" in2="SourceGraphic" operator="in" />
      </filter>
      <filter id={id('soft')} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="0.018" />
      </filter>
      <filter id={id('softer')} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="0.05" />
      </filter>
      <filter id={id('glow')} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="0.035" />
      </filter>
      {/* Tone field dome: a shade darker than the shell, lit upper left. */}
      <radialGradient id={id('dome')} cx="38%" cy="32%" r="80%">
        <stop offset="0%" stopColor="#3f6e9f" />
        <stop offset="45%" stopColor="#223f68" />
        <stop offset="100%" stopColor="#0f1f38" />
      </radialGradient>
      {/* Violet heat halo around a field. */}
      <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#7a5aa8" stopOpacity="0.55" />
        <stop offset="55%" stopColor="#5f4a92" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#3b3f7a" stopOpacity="0" />
      </radialGradient>
      {/* Concave dimple: dark upper-left wall, bright lower-right wall. */}
      <radialGradient id={id('dimple')} cx="64%" cy="70%" r="75%">
        <stop offset="0%" stopColor="#8fc0ee" />
        <stop offset="28%" stopColor="#3f74ab" />
        <stop offset="62%" stopColor="#172e52" />
        <stop offset="100%" stopColor="#060c18" />
      </radialGradient>
      {/* Thin light catching the upper-left edge of a dome. */}
      <linearGradient id={id('edge')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#dbe9ff" stopOpacity="0.55" />
        <stop offset="50%" stopColor="#dbe9ff" stopOpacity="0" />
      </linearGradient>
      {/* The gu: a dark port with a lit inner lip. */}
      <radialGradient id={id('gu')} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#020407" />
        <stop offset="72%" stopColor="#05080f" />
        <stop offset="90%" stopColor="#1a2c48" />
        <stop offset="100%" stopColor="#4c6f99" />
      </radialGradient>
    </defs>
  );
}

interface ShellProps extends SkinProps {
  underside?: boolean;
}

export function Shell({ prefix, underside = false }: ShellProps) {
  const id = (n: string) => `url(#${prefix}-${n})`;
  return (
    <g className="shell">
      <circle r="1" fill={id(underside ? 'shell-under' : 'shell')} />
      <circle r="1" fill="#6a4aa0" opacity={underside ? 0.35 : 0.6} filter={id('blotch-violet')} />
      <circle r="1" fill="#3a8ab8" opacity={underside ? 0.25 : 0.45} filter={id('blotch-teal')} />
      <circle r="1" fill="#fff" opacity="0.14" filter={id('grain')} />
      {!underside && <ellipse cx="-0.32" cy="-0.42" rx="0.62" ry="0.34" fill={id('sheen')} transform="rotate(-32)" />}
      <circle r="1" fill={id('rim-shade')} />
      {/* Rim: a bright steel edge over a dark seam. */}
      <circle r="0.992" fill="none" stroke="#04070d" strokeWidth="0.022" />
      <circle r="1" fill="none" stroke="#9fb6d2" strokeWidth="0.009" opacity="0.9" />
      <circle r="1.004" fill="none" stroke="#2a3a52" strokeWidth="0.006" />
    </g>
  );
}

interface FieldGraphicProps extends SkinProps {
  rx: number;
  ry: number;
  angleDeg: number;
  /** Relative size, drives dimple radius. */
  size: number;
  flash: number | undefined;
}

/** A tone field: violet halo, soft shadow, raised oval, edge light and a central dimple. */
export function FieldGraphic({ prefix, rx, ry, angleDeg, size, flash }: FieldGraphicProps) {
  const id = (n: string) => `url(#${prefix}-${n})`;
  const dimple = 0.052 * size;
  return (
    <g>
      <g transform={`rotate(${angleDeg})`}>
        <ellipse rx={rx * 1.75} ry={ry * 1.75} fill={id('halo')} />
        <ellipse cx="0.012" cy="0.014" rx={rx} ry={ry} fill="#02050b" opacity="0.6" filter={id('soft')} />
        <ellipse rx={rx} ry={ry} fill={id('dome')} />
        <ellipse rx={rx * 0.93} ry={ry * 0.9} fill="none" stroke={id('edge')} strokeWidth="0.008" />
        <ellipse rx={rx} ry={ry} fill="none" stroke="#050a14" strokeWidth="0.004" opacity="0.8" />
      </g>
      <circle r={dimple * 1.15} fill="#03060c" opacity="0.5" filter={id('soft')} />
      <circle r={dimple} fill={id('dimple')} />
      <circle r={dimple} fill="none" stroke="#0a1730" strokeWidth="0.003" />
      <ellipse cx={dimple * 0.28} cy={dimple * 0.36} rx={dimple * 0.22} ry={dimple * 0.12} fill="#e8f3ff" opacity="0.55" transform={`rotate(-35 ${dimple * 0.28} ${dimple * 0.36})`} />
      {flash !== undefined && (
        <g key={flash} className="flash-group" transform={`rotate(${angleDeg})`}>
          <ellipse className="flash-glow" rx={rx * 1.1} ry={ry * 1.1} filter={id('glow')} />
          <ellipse className="flash" rx={rx} ry={ry} />
        </g>
      )}
    </g>
  );
}

interface DingGraphicProps extends SkinProps {
  r: number;
  flash: number | undefined;
}

/** The ding: a large dome with a shallow central dimple. */
export function DingGraphic({ prefix, r, flash }: DingGraphicProps) {
  const id = (n: string) => `url(#${prefix}-${n})`;
  const dimple = r * 0.3;
  return (
    <g>
      <circle r={r * 1.9} fill={id('halo')} opacity="0.8" />
      <circle cx="0.02" cy="0.024" r={r} fill="#02050b" opacity="0.65" filter={id('soft')} />
      <circle r={r} fill={id('dome')} />
      <circle r={r * 0.94} fill="none" stroke={id('edge')} strokeWidth="0.012" />
      <circle r={r} fill="none" stroke="#050a14" strokeWidth="0.005" opacity="0.8" />
      <circle r={dimple * 1.12} fill="#03060c" opacity="0.45" filter={id('soft')} />
      <circle r={dimple} fill={id('dimple')} />
      <ellipse cx={dimple * 0.3} cy={dimple * 0.38} rx={dimple * 0.24} ry={dimple * 0.13} fill="#e8f3ff" opacity="0.5" transform={`rotate(-35 ${dimple * 0.3} ${dimple * 0.38})`} />
      {flash !== undefined && (
        <g key={flash} className="flash-group">
          <circle className="flash-glow" r={r * 1.1} filter={id('glow')} />
          <circle className="flash" r={r} />
        </g>
      )}
    </g>
  );
}

export function Gu({ prefix }: SkinProps) {
  return (
    <g>
      <circle cx="0.01" cy="0.012" r="0.19" fill="#000" opacity="0.5" filter={`url(#${prefix}-soft)`} />
      <circle r="0.17" fill={`url(#${prefix}-gu)`} />
      <circle r="0.17" fill="none" stroke="#7d9bc2" strokeWidth="0.006" opacity="0.7" />
    </g>
  );
}
