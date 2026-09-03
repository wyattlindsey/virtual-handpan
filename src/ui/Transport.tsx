import type { GeneratorMode, GeneratorParams } from '../music/generator';

interface Props {
  params: GeneratorParams;
  onChange: (patch: Partial<GeneratorParams>) => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onReseed: () => void;
  noteCount: number;
  seconds: number;
}

const MODES: { value: GeneratorMode; label: string; hint: string }[] = [
  { value: 'scale', label: 'Scale', hint: 'Up and back down' },
  { value: 'melodic', label: 'Melodic', hint: 'Step-wise phrases with rests' },
  { value: 'random', label: 'Random', hint: 'Uniform draws, like the Isthmus tool' },
];

export function Transport({ params, onChange, playing, onPlay, onStop, onReseed, noteCount, seconds }: Props) {
  const isScale = params.mode === 'scale';
  return (
    <section className="panel">
      <h2>Play it for me</h2>

      <div className="segmented" role="radiogroup" aria-label="Phrase mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={params.mode === m.value}
            className={params.mode === m.value ? 'on' : ''}
            title={m.hint}
            onClick={() => onChange({ mode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="row">
        {playing ? (
          <button type="button" className="primary" onClick={onStop}>■ Stop</button>
        ) : (
          <button type="button" className="primary" onClick={onPlay}>▶ Play</button>
        )}
        <button type="button" onClick={onReseed} disabled={isScale} title="Roll a new phrase">↻ New phrase</button>
        <span className="muted mono">{noteCount} notes · {seconds.toFixed(1)}s</span>
      </div>

      <Slider label="Tempo" value={params.bpm} min={40} max={160} step={1} unit=" bpm" onChange={(v) => onChange({ bpm: v })} />
      <Slider label="Length" value={params.bars} min={1} max={16} step={1} unit=" bars" disabled={isScale} onChange={(v) => onChange({ bars: v })} />
      <Slider label="Rests" value={params.restDensity} min={0} max={0.6} step={0.02} format={pct} disabled={isScale} onChange={(v) => onChange({ restDensity: v })} />

      <h3>Human feel</h3>
      <Slider label="Timing jitter" value={params.jitterMs} min={0} max={60} step={1} unit=" ms" onChange={(v) => onChange({ jitterMs: v })} />
      <Slider label="Swing" value={params.swing} min={0} max={1} step={0.05} format={pct} onChange={(v) => onChange({ swing: v })} />
      <Slider label="Velocity" value={params.velocity} min={0.2} max={1} step={0.02} format={pct} onChange={(v) => onChange({ velocity: v })} />
      <Slider label="Velocity spread" value={params.velocityVariation} min={0} max={0.3} step={0.01} format={pct} onChange={(v) => onChange({ velocityVariation: v })} />
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, unit = '', format, disabled, onChange }: SliderProps) {
  return (
    <label className={`slider${disabled ? ' disabled' : ''}`}>
      <span className="row space-between">
        <span>{label}</span>
        <span className="mono muted">{format ? format(value) : `${value}${unit}`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
