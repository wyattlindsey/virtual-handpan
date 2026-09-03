# Reference: Isthmus Scale Randomizer

Notes on the existing tool this project takes as its starting point.
Captured 2026-09-03.

- App: https://isthmusinstruments.shinyapps.io/IsthmusScaleRandomizer/
- Write-up: https://www.isthmusinstruments.com/isthmus-handpan-blog/how-to-pick-a-handpan-scale
- Linked from: https://www.isthmusinstruments.com/handpan-scale-finder (as "Scale Randomizer")

## What it is

An R Shiny app by Isthmus Instruments. The premise, in their words, is
"Does randomization help reveal the inherent musicality of a scale?" It
removes the player from the equation: pick a set of notes, and the server
renders a random sequence of those notes as sine tones so you can judge the
note set itself rather than a player's phrasing or a builder's timbre.

The authors say it "cannot substitute the process of finding a builder you
prefer based on timbre or quality of sound" and admit the output "sounds a
bit odd at first" with a "robotic or mechanical feel". The page says it is
built for desktop Chrome only, with no mobile support.

## UI

Two tabs sharing the same control panel layout.

### Tab 1: "Handpan Scales"

Left panel:

| Control | Type | Range / values | Default |
| --- | --- | --- | --- |
| Number of random notes | number input | 0 to 500 | 100 |
| Note duration (seconds) | slider | 0.1 to 0.75, step 0.05 | 0.3 |
| Sample start | radio | "Play the scale first" / "Random notes only" | Play the scale first |
| Update | submit button | | |

Right panel: a single radio group of 90 named scales (A minor, AmaRa,
AmaRa (bottom notes), Anahata, ... Zenith), one selectable at a time. The
list is a curated subset of the community scale spreadsheet (see Data).

After Update, an `<audio controls>` element appears pointing at a
server-rendered `music.wav`. Playback is the browser's stock audio player.
A note under the button warns that the sample may take a few seconds to
render.

### Tab 2: "Build your own"

Same left panel (own copies of the three inputs). Right panel: 39 checkboxes,
one per semitone from A2 to B5, labelled with mixed sharp/flat spellings
(A2, A#2, B2, C3, C#3, D3, Eb3, E3, F3, F#3, G3, G#3, A3, Bb3, B3, C4, C#4,
D4, D#4, E4, F4, F#4, G4, G#4, A4, Bb4, B4, C5, C#5, D5, Eb5, E5, F5, F#5,
G5, G#5, A5, Bb5, B5). Any combination may be checked. Output is a second
audio element.

## Audio rendering

Measured from a rendered `music.wav` (A minor, 100 notes, 0.3 s, scale first):

- WAV, 44.1 kHz, 32-bit float, 2 identical channels (mono content).
- Each note is a pure sine at full scale (peak 1.0). No attack, decay, or
  release: RMS sits at 0.71 (a full-scale sine) for the whole file.
- Notes are butted directly together with no silence between them, and
  the phase is not continuous across boundaries, so every note change is a
  hard cut. This is the source of the clicky, mechanical sound.
- 12-tone equal temperament with A4 = 440 Hz (measured 221 Hz for A3,
  440 Hz for A4).
- With "Play the scale first", the file opens with the scale ascending
  (all N notes, lowest to highest, one per slot), then the random notes.
- Random notes appear to be drawn uniformly and independently from the
  scale, with immediate repeats allowed (A3 A3 ... A4 A4 observed).
- Total length was 33.35 s for 8 + 100 notes, so each slot was about
  0.309 s rather than exactly 0.3 s. Not important, just noting it.

There is no rhythm, dynamics, rests, or melodic constraint. The
"musicality" being tested is purely which pitches appear together.

## Data

The scale list comes from a public Google Sheet maintained by
Jean-Mattheiu and Julien Aho of handpan.org:
https://docs.google.com/spreadsheets/d/1YXWQxcSBQ5UlL0Dqs10ffSzZ4PZD9jDBSBFFySHKRak

Snapshot in this repo: `data/reference/handpan-org-scales.csv`, converted
to `data/scales.json` by `scripts/convert_scales.py`.

Sheet structure:

- One row per scale. Columns: Maker / Handpan, Scale / Sound Model,
  Scale (generic), Feel, #, Notes list, then a 39-column pitch grid from
  A2 to B5 (one column per semitone), then Video Links, Transposed to D,
  Ding, Known artists. The `#`, `Notes list`, `Transposed to D`, and `Ding`
  columns are broken formulas (`#NAME?`) in the export.
- A non-empty grid cell means the note is on the instrument. The cell text
  is the maker's preferred spelling (e.g. `Bb` vs `A#`).
- A lowercase note letter (e.g. `b`, `c#`) marks a bottom note. Five scales
  use this.
- 93 scales from 17 makers, 8 to 11 notes each. The lowest note is the
  ding in every case. Dings range from B2 to A3. `Feel` is sparsely
  filled: Major, Minor, Arabic / Eastern, Oriental.
- The app's 90 radio labels are hand-edited versions of the sheet names
  (e.g. sheet "Celtic8 C#" is app "Celtic 8 C#"; sheet "D minor (Dante's
  scale)" is app "D minor Dante"; Halo's model suffixes like "(Cirrus)"
  are dropped). Duplicate scale names across makers (Onoleo, Equinox,
  Celtic minor, F# minor, Dune) collapse to one entry each in the app.

## Takeaways for this project

What the reference gets right and is worth keeping:

- Separating "what notes" from "who plays it": a random or generated phrase
  lets you compare note sets without bias.
- Two entry points: a library of real builder scales, and a free-form
  note picker over a fixed range.
- Very few controls.

Where it falls short, and where a web version can obviously improve:

- Timbre: raw sine tones with hard cuts. Even a simple additive model of a
  handpan note (fundamental, octave, and compound fifth partials with an
  exponential decay) would sound far more like the instrument.
- No instrument view: there is no picture of the handpan, no sense of
  where notes sit, no way to tap a note yourself.
- Round-trip to a server for every change, several seconds per render,
  desktop Chrome only. Web Audio in the browser removes all of that.
- No transposition, no comparison of two scales, no shareable state.
