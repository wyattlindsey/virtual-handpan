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

## Musicality roadmap

How the generated playing gets more musical, in the order the pieces pay
off. Each step keeps the split we have now: a generator that decides
*what* is played in beats, and a humanize layer that decides *how* in
seconds, so the sample engine's velocity layers respond to musical
intent rather than noise.

### 1. Musicianship rules (no model needed)

- **Accent templates per feel.** Velocity already follows the meter
  (downbeat loudest, half-bar next, offbeats softer). Make that a named
  template per feel: straight 4/4, 6/8 lilt, 3/4, 7/8, half-time, with the
  sample engine's layers picking up the difference automatically.
- **Dyads.** Two fields struck together, always a pair for us: ding with a
  ring note, octaves, thirds and fifths inside the scale. A flam offset of
  8 to 35 ms between the two hands, the leading hand slightly louder, both
  amounts on the humanize controls.
- **Two-hand model.** A left-hand ostinato on the ding and low fields with
  the melody above it, alternating hands like drum sticking, and reach
  limits so a phrase never asks one hand to jump across the pan.
- **Phrase shape.** Dynamics rise and fall over four to eight bars, a
  breath at phrase ends, motifs that repeat with variation (moved a scale
  step, displaced by a beat, inverted), and cadences that land on the ding
  or its fifth.
- **Time feel.** Swing already exists; add slight tempo drift and a
  push-pull that leans into downbeats.

### 2. Learn from real playing

- **Capture performances in the app.** Every strike already has pitch,
  velocity and time; a record button turns a played session into a phrase
  file. Recording the Isthmus pan through the sample session doubles as
  training data.
- **Transcribe audio.** Onset and pitch detection on recordings of real
  players, mapped onto a known layout, gives a corpus of handpan phrases.
- **Small in-browser models.** Start with n-gram or Markov models over
  interval, rhythm and accent, trained on that corpus and running in the
  page. Graduate to a small sequence model exported to ONNX or TF.js once
  there is enough material.

### 3. Composition with a language model

- Ask Claude for a phrase as structured JSON (events in beats, hand,
  accent role, dyad pairs), given the layout, feel and a style prompt such
  as "slow, sparse, resolves often". The humanize layer stays
  deterministic so the result still sounds like a person.
- Pages is static, so this needs a small proxy (a serverless function
  holding the key) or a bring-your-own-key field stored locally.

### 4. Taste feedback

- Thumbs up and down on phrases adjusts template weights per user, and
  builds the dataset for step 2 at the same time.

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
