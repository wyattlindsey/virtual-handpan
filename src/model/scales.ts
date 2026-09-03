/**
 * The scale library: builder scales from the handpan.org community sheet,
 * converted to data/scales.json by scripts/convert_scales.py.
 */
import raw from '../../data/scales.json';
import { type Layout, layoutFromNotes } from './layout';

export interface ScaleNote {
  /** Canonical sharp-spelled pitch, e.g. "A#3". */
  pitch: string;
  /** The maker's spelling, e.g. "Bb". */
  spelled: string;
  /** True for a note on the underside of the shell. */
  bottom: boolean;
}

export interface ScaleRecord {
  maker: string;
  name: string;
  generic: string | null;
  feel: string | null;
  ding: string | null;
  notes: ScaleNote[];
  video: string | null;
  artists: string | null;
}

export interface LibraryScale extends ScaleRecord {
  /** Unique id, "maker/name" with a numeric suffix when a maker lists a name twice. */
  id: string;
  /** Number of notes including the ding. */
  noteCount: number;
  /** True if the maker writes any note with a flat. */
  prefersFlats: boolean;
}

function withIds(records: ScaleRecord[]): LibraryScale[] {
  const seen = new Map<string, number>();
  return records.map((r) => {
    const base = `${r.maker}/${r.name.trim()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      ...r,
      name: r.name.trim(),
      id: n === 1 ? base : `${base}#${n}`,
      noteCount: r.notes.length,
      prefersFlats: r.notes.some((note) => /b$/.test(note.spelled)),
    };
  });
}

export const SCALES: readonly LibraryScale[] = withIds(raw as ScaleRecord[]);

export function findScale(id: string): LibraryScale | undefined {
  return SCALES.find((s) => s.id === id);
}

/** Scales grouped by maker, makers in alphabetical order. */
export function scalesByMaker(): Map<string, LibraryScale[]> {
  const groups = new Map<string, LibraryScale[]>();
  for (const s of [...SCALES].sort((a, b) => a.maker.localeCompare(b.maker) || a.name.localeCompare(b.name))) {
    const list = groups.get(s.maker) ?? [];
    list.push(s);
    groups.set(s.maker, list);
  }
  return groups;
}

export function layoutFromScale(scale: LibraryScale): Layout {
  return layoutFromNotes(`${scale.name} (${scale.maker})`, scale.notes);
}
