import { FEELS, type FeelId } from '../music/feels';
import type { GeneratorMode, GeneratorParams } from '../music/generator';
import { type Recording, recordingSeconds } from '../music/recorder';

interface Props {
  params: GeneratorParams;
  onChange: (patch: Partial<GeneratorParams>) => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onReseed: () => void;
  onFeedback: (up: boolean) => void;
  noteCount: number;
  seconds: number;
  recording: boolean;
  recordCount: number;
  onToggleRecord: () => void;
  recordings: Recording[];
  onPlayRecording: (r: Recording) => void;
  onDeleteRecording: (id: string) => void;
  learnedAvailable: boolean;
}

const MODES: { value: GeneratorMode; label: string; hint: string }[] = [
  { value: 'scale', label: 'Scale', hint: 'Up and back down' },
  { value: 'melodic', label: 'Melodic', hint: 'Two-hand phrases with rests, dyads and a groove' },
  { value: 'random', label: 'Random', hint: 'Uniform draws, like the Isthmus tool' },
  { value: 'learned', label: 'Learned', hint: 'In the style of your own recordings' },
];

export function Transport({
  params, onChange, playing, onPlay, onStop, onReseed, onFeedback, noteCount, seconds,
  recording, recordCount, onToggleRecord, recordings, onPlayRecording, onDeleteRecording, learnedAvailable,
}: Props) {
  const isScale = params.mode === 'scale';
  const isMelodic = params.mode === 'melodic' || (params.mode === 'learned' && !learnedAvailable);
  return (
    <section className="panel">
      <h2>Play it for me</h2>

      <div className="segmented" role="radiogroup" aria-label="Phrase mode">
        {MODES.map((m) => {
          const disabled = m.value === 'learned' && !learnedAvailable;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={params.mode === m.value}
              className={params.mode === m.value ? 'on' : ''}
              title={disabled ? 'Record yourself playing first' : m.hint}
              disabled={disabled}
              onClick={() => onChange({ mode: m.value })}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <label className="stack">
        <span className="muted">Feel</span>
        <select value={params.feel} onChange={(e) => { onChange({ feel: e.target.value as FeelId }); e.target.blur(); }} disabled={isScale}>
          {FEELS.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </label>

      {playing ? (
        <button type="button" className="play-button stop" onClick={onStop} aria-label="Stop">
          <span className="play-icon">■</span>
          <span className="play-text">Stop</span>
        </button>
      ) : (
        <button type="button" className="play-button" onClick={onPlay} aria-label="Play a phrase on this pan">
          <span className="play-icon">▶</span>
          <span className="play-text">Play<small>hear this pan</small></span>
        </button>
      )}
      <div className="row space-between">
        <span className="row">
          <button type="button" onClick={onReseed} disabled={isScale} title="Roll a new phrase">↻ New phrase</button>
          <button type="button" className="mini" onClick={() => onFeedback(true)} disabled={!isMelodic} title="More like this">👍</button>
          <button type="button" className="mini" onClick={() => onFeedback(false)} disabled={!isMelodic} title="Less like this, roll another">👎</button>
        </span>
        <span className="muted mono">{noteCount} notes · {seconds.toFixed(1)}s</span>
      </div>

      <h3>Phrase</h3>
      <Slider label="Length" value={params.bars} min={1} max={16} step={1} unit=" bars" disabled={isScale} onChange={(v) => onChange({ bars: v })} />
      <Slider label="Rests" value={params.restDensity} min={0} max={0.6} step={0.02} format={pct} disabled={!isMelodic && params.mode !== 'random'} onChange={(v) => onChange({ restDensity: v })} />
      <Slider label="Dyads" value={params.dyads} min={0} max={1} step={0.05} format={pct} disabled={!isMelodic} onChange={(v) => onChange({ dyads: v })} />
      <Slider label="Groove hand" value={params.groove} min={0} max={1} step={0.05} format={pct} disabled={!isMelodic} onChange={(v) => onChange({ groove: v })} />

      <h3>Human feel</h3>
      <Slider label="Tempo" value={params.bpm} min={40} max={160} step={1} unit=" bpm" onChange={(v) => onChange({ bpm: v })} />
      <Slider label="Timing jitter" value={params.jitterMs} min={0} max={60} step={1} unit=" ms" onChange={(v) => onChange({ jitterMs: v })} />
      <Slider label="Swing" value={params.swing} min={0} max={1} step={0.05} format={pct} onChange={(v) => onChange({ swing: v })} />
      <Slider label="Lean" value={params.lean} min={-1} max={1} step={0.05} format={lean} onChange={(v) => onChange({ lean: v })} />
      <Slider label="Drift" value={params.drift} min={0} max={1} step={0.05} format={pct} onChange={(v) => onChange({ drift: v })} />
      <Slider label="Flam" value={params.flamMs} min={0} max={40} step={1} unit=" ms" disabled={!isMelodic} onChange={(v) => onChange({ flamMs: v })} />
      <Slider label="Velocity" value={params.velocity} min={0.2} max={1} step={0.02} format={pct} onChange={(v) => onChange({ velocity: v })} />
      <Slider label="Velocity spread" value={params.velocityVariation} min={0} max={0.3} step={0.01} format={pct} onChange={(v) => onChange({ velocityVariation: v })} />

      <h3>Your playing</h3>
      <div className="row space-between">
        <button type="button" className={`record-button${recording ? ' on' : ''}`} onClick={onToggleRecord}>
          {recording ? `■ Stop recording (${recordCount})` : '● Record'}
        </button>
        <span className="muted small">Learned mode plays in the style of these</span>
      </div>
      {recordings.length > 0 && (
        <ul className="recording-list">
          {recordings.map((r) => (
            <li key={r.id}>
              <span className="name">{r.name}</span>
              <span className="muted mono">{r.notes.length} notes · {recordingSeconds(r).toFixed(1)}s</span>
              <button type="button" className="mini" onClick={() => onPlayRecording(r)} title="Play this recording">▶</button>
              <button type="button" className="mini danger" onClick={() => onDeleteRecording(r.id)} title="Delete">×</button>
            </li>
          ))}
        </ul>
      )}
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

function lean(v: number): string {
  if (Math.abs(v) < 0.025) return 'on the grid';
  return v > 0 ? `${Math.round(v * 100)}% laid back` : `${Math.round(-v * 100)}% pushed`;
}
