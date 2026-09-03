#!/usr/bin/env python3
"""Convert the handpan.org community scale spreadsheet (CSV export) into scales.json.

Source sheet: https://docs.google.com/spreadsheets/d/1YXWQxcSBQ5UlL0Dqs10ffSzZ4PZD9jDBSBFFySHKRak
Maintained by Jean-Mattheiu and Julien Aho (handpan.org); linked from the Isthmus
Instruments "How to Choose a Handpan Scale" post.

Sheet layout (row 1 = header, rows 2+ = one scale each):
  cols 0-5 : Maker / Handpan, Scale / Sound Model, Scale (generic), Feel, #, Notes list
  cols 6-44: a 39-column pitch grid from A2 to B5, one column per semitone. A non-empty
             cell means the note is present; the cell text is the maker's spelling
             (sharps or flats). Lowercase text marks a bottom note.
  cols 45-48: Video Links, Transposed to D, Ding, Known artists

Usage: python3 scripts/convert_scales.py data/reference/handpan-org-scales.csv data/scales.json
"""
import csv, json, sys

NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']

def build_grid():
    grid, octave, i = [], 2, 0  # grid starts at A2
    for _ in range(39):
        n = NAMES[i]
        grid.append(f"{n}{octave}")
        i = (i + 1) % 12
        if n == 'B':
            octave += 1
    assert grid[0] == 'A2' and grid[-1] == 'B5'
    return grid

def convert(src, dst):
    rows = list(csv.reader(open(src, newline='')))
    grid = build_grid()
    scales = []
    for r in rows[2:]:
        maker, name, generic, feel = (c.strip() for c in r[:4])
        if not (maker or name):
            continue
        notes = []
        for pitch, cell in zip(grid, r[6:45]):
            v = cell.strip()
            if not v:
                continue
            notes.append({
                'pitch': pitch,                    # canonical sharp spelling, e.g. "A#3"
                'spelled': v[0].upper() + v[1:],   # maker's spelling, e.g. "Bb" (flat sign stays lowercase)
                'bottom': v[0].islower(),          # lowercase note letter in the sheet = bottom note
            })
        video = r[45].strip() if len(r) > 45 else ''
        artists = r[48].strip() if len(r) > 48 else ''
        scales.append({
            'maker': maker,
            'name': name,
            'generic': generic or None,
            'feel': feel or None,
            'ding': notes[0]['pitch'] if notes else None,
            'notes': notes,
            'video': video or None,
            'artists': artists or None,
        })
    with open(dst, 'w') as f:
        json.dump(scales, f, indent=2)
        f.write('\n')
    print(f"wrote {len(scales)} scales to {dst}")

if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'data/reference/handpan-org-scales.csv'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'data/scales.json'
    convert(src, dst)
