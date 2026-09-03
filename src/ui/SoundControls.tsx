import type { PackEntry } from '../audio/packIndex';
import type { Spelling } from '../model/pitch';
import { Slider } from './Transport';

export type VoiceKind = 'synth' | 'sampled';
export type ViewKind = '2d' | '3d';

/** Id of the pack rendered from the synth, always available. */
export const STARTER_PACK_ID = 'starter';

interface Props {
  voice: VoiceKind;
  voiceStatus: string;
  packId: string;
  packs: PackEntry[];
  onPack: (id: string) => void;
  onClearCache: () => void;
  volume: number;
  reverb: number;
  bass: number;
  onBass: (db: number) => void;
  spelling: Spelling;
  view: ViewKind;
  onView: (v: ViewKind) => void;
  showUnderside: boolean;
  onVoice: (v: VoiceKind) => void;
  onVolume: (v: number) => void;
  onReverb: (v: number) => void;
  onSpelling: (s: Spelling) => void;
  onToggleUnderside: () => void;
}

const VOICES: { value: VoiceKind; label: string; hint: string }[] = [
  { value: 'synth', label: 'Synth', hint: 'Additive model, any pitch' },
  { value: 'sampled', label: 'Sampled', hint: 'Sample engine: velocity layers, round robin, synth fallback for uncovered notes' },
];

export function SoundControls({
  voice, voiceStatus, packId, packs, onPack, onClearCache, volume, reverb, bass, onBass, spelling, view, onView, showUnderside,
  onVoice, onVolume, onReverb, onSpelling, onToggleUnderside,
}: Props) {
  return (
    <section className="panel">
      <h2>Sound &amp; view</h2>
      <div className="segmented" role="radiogroup" aria-label="Voice">
        {VOICES.map((v) => (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={voice === v.value}
            className={voice === v.value ? 'on' : ''}
            title={v.hint}
            onClick={() => onVoice(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {voice === 'sampled' && (
        <label className="stack">
          <span className="muted">Sample pack</span>
          <select value={packId} onChange={(e) => { onPack(e.target.value); e.target.blur(); }}>
            <option value={STARTER_PACK_ID}>Starter pack (rendered from the synth)</option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
      {voiceStatus && <div className="muted small mono">{voiceStatus}</div>}
      {voice === 'sampled' && packId !== STARTER_PACK_ID && (
        <button type="button" className="mini" onClick={onClearCache} title="Delete sample files cached on this device">
          Clear cached samples
        </button>
      )}
      <Slider label="Volume" value={volume} min={0} max={1} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={onVolume} />
      <Slider label="Room" value={reverb} min={0} max={0.8} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={onReverb} />
      <Slider label="Bass" value={bass} min={-18} max={6} step={1} format={(v) => `${v > 0 ? '+' : ''}${v} dB`} onChange={onBass} />
      <div className="row space-between">
        <span>Accidentals</span>
        <span className="row">
          <button type="button" className={`mini${spelling === 'sharp' ? ' on' : ''}`} onClick={() => onSpelling('sharp')}>♯</button>
          <button type="button" className={`mini${spelling === 'flat' ? ' on' : ''}`} onClick={() => onSpelling('flat')}>♭</button>
        </span>
      </div>
      <div className="row space-between">
        <span>View</span>
        <span className="row">
          <button type="button" className={`mini${view === '3d' ? ' on' : ''}`} onClick={() => onView('3d')}>3D</button>
          <button type="button" className={`mini${view === '2d' ? ' on' : ''}`} onClick={() => onView('2d')}>2D</button>
        </span>
      </div>
      <div className="row space-between">
        <span>Underside view</span>
        <button type="button" className={`mini${showUnderside ? ' on' : ''}`} onClick={onToggleUnderside}>{showUnderside ? 'shown' : 'hidden'}</button>
      </div>
      <p className="muted small">
        Click or tap a field to play it; click the shoulder for a tak (shift for a slap). Keys follow the pan: fields on the left use the left half of the keyboard, upper fields the upper rows, the note nearest you sits low and central; space is the ding, the number row plays underside notes, − is a tak and = a slap. Hold shift to strike harder. Esc stops playback.
      </p>
    </section>
  );
}
