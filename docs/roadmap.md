# Roadmap

Where this project is going, and the order we plan to get there.

## Vision

A fully configurable virtual handpan that runs in the browser and behaves
like a Kontakt or Native Instruments style sampled instrument:

- **Photorealistic instrument view.** An overhead view of the pan with the
  underside visible in a picture-in-picture panel. The look will be dialed
  in later; the geometry is data-driven from the layout so a realistic skin
  can be dropped under the interactive layer.
- **Every option a custom builder offers.** Choice of ding, any number of
  top tone fields, bottom notes, alternative layouts (zigzag direction,
  field placement), transposition. Eventually drag-and-drop placement of
  fields.
- **Real samples, played like a real instrument.** Multi-velocity layers,
  round-robin alternation between takes, natural decay. Synthesized voices
  stay as a fallback and as a way to audition pitches no sample covers.
- **Generated phrases that sound human.** Rhythm with a controllable amount
  of timing jitter, velocity variation, rests and phrasing, melodic
  motion that prefers steps and returns to the ding.
- **Two ways in.** Pick a real builder's scale from the library, or lay out
  your own notes.

## Phases

### v0.1: playable synth pan (done)

- Vite + React + TypeScript, no backend.
- Pitch, scale, and layout models. Layout = ding + ordered top fields +
  bottom fields, positions derived from the standard zigzag arrangement.
- `Instrument` interface with a synthesized handpan voice (tuned partials
  at 1:2:3, exponential decay, velocity-dependent brightness, strike
  transient, light reverb).
- SVG overhead view with clickable tone fields, keyboard mapping, and an
  underside PIP.
- Scale library from `data/scales.json`, custom note editor, transpose.
- Phrase generator with humanize controls, lookahead sequencer, field
  highlighting as notes play.

### v0.2: sample engine (in progress)

Done:

- Sample pack format (`docs/sample-packs.md`): a JSON manifest mapping
  pitches and velocity ranges to audio files with round-robin takes per
  layer, plus a script that builds one from a folder of named recordings.
- `SampledInstrument` behind the `Instrument` interface: nearest zone with
  pitch shifting, equal-power velocity crossfade, round robin, damping,
  synth fallback for uncovered notes.
- Loading, decoding and caching of packs, a pack picker, and a starter pack
  rendered from the synth so the engine runs before real recordings exist.

Next:

- Record the Isthmus pan (see the recording guide) and ship it as the
  first real pack.
- Release and hand-damp samples, strike-position zones (dimple, shoulder,
  rim), and a matching room impulse response.
- Optional per-note tuning offsets and sample start trimming in the
  manifest.

### v0.3: realistic rendering (started)

- Done: an SVG skin modelled on Isthmus nitrided steel, cobalt with violet
  heat-tint blotches, raised fields with concave dimples, a lit gu on the
  underside.
- Next: photo-derived textures or a WebGL shell with real lighting,
  reflections that follow the cursor, strike animation on the dimple.

### v0.4: builder-grade configuration

- Drag-and-drop placement of top and bottom fields with builder-style
  constraints (spacing, size by pitch).
- Save, load, and share configurations (URL state, JSON export).
- Side-by-side comparison of two configurations.

### Later

- Web MIDI input so a controller can play the pan.
- Record and export generated phrases as audio.
- Mutant and shoulder tones, cross-talk between fields.

## Architecture decisions

- **`Instrument` is the seam between UI and sound.** Everything above it
  speaks in pitch, velocity, and time. Swapping the synth for samples must
  not touch the UI or the generator.
- **Layout is data.** Field positions are derived by default and can be
  overridden per field, so drag-and-drop later is an override, not a new
  model.
- **The generator emits events, the sequencer plays them.** A phrase is a
  list of `{ time, pitch, velocity, duration }` in beats. Humanization is
  applied when converting beats to seconds. The sequencer schedules a short
  lookahead against the audio clock so stop is instant.
- **Web Audio clock for everything audible.** UI highlights follow the audio
  clock, never the other way round.
