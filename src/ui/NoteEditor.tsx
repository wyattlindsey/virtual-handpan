import { type Layout, type NoteSpec, type Zigzag } from '../model/layout';
import { type Spelling, comparePitches, formatPitch, pitchFromMidi } from '../model/pitch';

interface Props {
  layout: Layout;
  spelling: Spelling;
  semitones: number;
  onChangeNotes: (notes: NoteSpec[]) => void;
  onTranspose: (delta: number) => void;
  onZigzag: (z: Zigzag) => void;
}

/** A2..B5, the range the Isthmus tool covers and where handpan notes live. */
const ALL_PITCHES = Array.from({ length: 39 }, (_, i) => pitchFromMidi(45 + i));

export function toNoteSpecs(layout: Layout): NoteSpec[] {
  return [
    { pitch: layout.ding },
    ...layout.top.map((pitch) => ({ pitch })),
    ...layout.bottom.map((pitch) => ({ pitch, bottom: true })),
  ];
}

export function NoteEditor({ layout, spelling, semitones, onChangeNotes, onTranspose, onZigzag }: Props) {
  const specs = toNoteSpecs(layout);
  const present = new Set(specs.map((s) => s.pitch));
  const addable = ALL_PITCHES.filter((p) => !present.has(p));

  const update = (fn: (list: NoteSpec[]) => NoteSpec[]) => onChangeNotes(fn(specs));

  return (
    <section className="panel">
      <h2>Notes</h2>
      <div className="row space-between">
        <span className="muted">{layout.name}</span>
        <span className="muted">{specs.length} notes</span>
      </div>

      <ul className="note-list">
        {[...specs].sort((a, b) => comparePitches(a.pitch, b.pitch)).map((n) => {
          const isDing = n.pitch === layout.ding;
          return (
            <li key={n.pitch} className={n.bottom ? 'bottom' : ''}>
              <span className="pitch">{formatPitch(n.pitch, spelling)}</span>
              <span className="role">{isDing ? 'ding' : n.bottom ? 'bottom' : 'top'}</span>
              <button
                type="button"
                className="mini"
                title={n.bottom ? 'Move to the top' : 'Move to the underside'}
                disabled={!n.bottom && specs.filter((s) => !s.bottom).length <= 1}
                onClick={() => update((list) => list.map((s) => (s.pitch === n.pitch ? { ...s, bottom: !s.bottom } : s)))}
              >
                {n.bottom ? '↑ top' : '↓ bottom'}
              </button>
              <button
                type="button"
                className="mini danger"
                title="Remove"
                disabled={specs.filter((s) => !s.bottom).length <= 1 && !n.bottom}
                onClick={() => update((list) => list.filter((s) => s.pitch !== n.pitch))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="row">
        <select
          aria-label="Add a note"
          value=""
          onChange={(e) => {
            const p = e.target.value;
            if (p) update((list) => [...list, { pitch: p }]);
          }}
        >
          <option value="">Add note…</option>
          {addable.map((p) => (
            <option key={p} value={p}>{formatPitch(p, spelling)}</option>
          ))}
        </select>
      </div>

      <div className="row space-between">
        <span>Transpose</span>
        <span className="row">
          <button type="button" className="mini" onClick={() => onTranspose(-1)}>−</button>
          <span className="mono">{semitones > 0 ? `+${semitones}` : semitones}</span>
          <button type="button" className="mini" onClick={() => onTranspose(1)}>+</button>
        </span>
      </div>

      <div className="row space-between">
        <span>Second note sits</span>
        <span className="row">
          <button type="button" className={`mini${layout.zigzag === 'left' ? ' on' : ''}`} onClick={() => onZigzag('left')}>left</button>
          <button type="button" className={`mini${layout.zigzag === 'right' ? ' on' : ''}`} onClick={() => onZigzag('right')}>right</button>
        </span>
      </div>
    </section>
  );
}
