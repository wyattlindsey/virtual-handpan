import type { Spelling } from '../model/pitch';
import { Slider } from './Transport';

interface Props {
  volume: number;
  reverb: number;
  spelling: Spelling;
  showUnderside: boolean;
  onVolume: (v: number) => void;
  onReverb: (v: number) => void;
  onSpelling: (s: Spelling) => void;
  onToggleUnderside: () => void;
}

export function SoundControls({ volume, reverb, spelling, showUnderside, onVolume, onReverb, onSpelling, onToggleUnderside }: Props) {
  return (
    <section className="panel">
      <h2>Sound &amp; view</h2>
      <Slider label="Volume" value={volume} min={0} max={1} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={onVolume} />
      <Slider label="Room" value={reverb} min={0} max={0.8} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={onReverb} />
      <div className="row space-between">
        <span>Accidentals</span>
        <span className="row">
          <button type="button" className={`mini${spelling === 'sharp' ? ' on' : ''}`} onClick={() => onSpelling('sharp')}>♯</button>
          <button type="button" className={`mini${spelling === 'flat' ? ' on' : ''}`} onClick={() => onSpelling('flat')}>♭</button>
        </span>
      </div>
      <div className="row space-between">
        <span>Underside view</span>
        <button type="button" className={`mini${showUnderside ? ' on' : ''}`} onClick={onToggleUnderside}>{showUnderside ? 'shown' : 'hidden'}</button>
      </div>
      <p className="muted small">
        Click or tap a field to play it. Keyboard: home row plays the ring from the lowest note, space is the ding, bottom row plays underside notes. Hold shift to strike harder. Esc stops playback.
      </p>
    </section>
  );
}
