import { type LibraryScale, SCALES, scalesByMaker } from '../model/scales';
import { type Spelling, formatPitch } from '../model/pitch';

interface Props {
  /** Selected scale id, or null when the layout has been edited. */
  value: string | null;
  spelling: Spelling;
  onSelect: (scale: LibraryScale) => void;
}

export function ScalePicker({ value, spelling, onSelect }: Props) {
  const groups = scalesByMaker();
  const selected = value ? SCALES.find((s) => s.id === value) : undefined;
  return (
    <section className="panel">
      <h2>Scale library</h2>
      <label className="stack">
        <span>Builder scale</span>
        <select
          value={value ?? ''}
          onChange={(e) => {
            const s = SCALES.find((x) => x.id === e.target.value);
            if (s) onSelect(s);
          }}
        >
          {!value && <option value="">Custom layout</option>}
          {[...groups.entries()].map(([maker, scales]) => (
            <optgroup key={maker} label={maker}>
              {scales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.noteCount}{s.feel ? ` · ${s.feel}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {selected && (
        <div className="scale-info">
          <div className="notes-line">
            {selected.notes.map((n, i) => (
              <span key={i} className={`chip${n.bottom ? ' bottom' : ''}${i === 0 ? ' ding' : ''}`} title={n.bottom ? 'bottom note' : i === 0 ? 'ding' : 'tone field'}>
                {formatPitch(n.pitch, spelling)}
              </span>
            ))}
          </div>
          {selected.video && (
            <a className="muted" href={selected.video} target="_blank" rel="noreferrer">Hear a real one ↗</a>
          )}
        </div>
      )}
    </section>
  );
}
