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

### v0.3: realistic rendering (in progress)

Done:

- An SVG skin modelled on Isthmus nitrided steel, cobalt with violet
  heat-tint blotches, raised fields with concave dimples, a lit gu.
- A WebGL view: the shell as a heightfield built from the layout (two
  domes, bulged fields with dimples, open gu, rim seam), physically based
  steel with procedural colour and roughness maps, environment
  reflections, a key light with a soft shadow, an orbit limited to a tilt
  and a modest swing, and a flip to the underside.

Next:

- Proportions from a real instrument (dome heights, field and dimple
  sizes, rim profile) measured on the Isthmus pan.
- A colour map derived from a straight-down photo of the actual pan,
  unwrapped onto the disc, so the heat tint is the real one.
- Strike animation on the dimple, cursor-following reflections, and a
  photogrammetry pass if we want the exact shell (needs 40 to 80
  overlapping photos on a turntable; single product shots are not enough).

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

### 1. Musicianship rules (done)

- **Accent templates per feel** (`src/music/feels.ts`): straight 4/4,
  half-time, 6/8 lilt, waltz and 7/8, each with accents per eighth slot,
  rhythmic cells and groove slots. Velocity follows the meter, so sampled
  layers respond to musical position.
- **Dyads.** A melody note gets a consonant partner (ding, octave, fifth,
  fourth, third, sixth) with a probability on the Dyads slider; the partner
  trails by the Flam amount and sits a little softer.
- **Two-hand model.** Fields on the left and right of the ring belong to a
  hand; fast runs alternate hands. A grooving hand keeps an ostinato on the
  ding and lowest ring note at the feel's groove slots (Groove hand slider).
- **Phrase shape.** Dynamics arc over four-bar phrases, phrase ends use
  sparser cells and take a breath, resolutions land on the ding or its
  neighbour, and the last two bars of a phrase's first half come back
  shifted a scale step.
- **Time feel.** Lean pushes or lays back offbeats; Drift is a slow push
  and pull against the grid; swing and jitter as before. All of it applies
  live while a phrase plays.

Still to do: reach limits beyond hand alternation, inversion and beat
displacement of motifs, cadence choice by scale degree.

### 2. Learn from real playing (started)

- **Capture performances** (done): Record under "Your playing" logs every
  strike with time, pitch and velocity; takes play back without the human
  layer and are kept on the device.
- **Small in-browser models** (done, first version): a bigram model over
  scale-step intervals and eighth-quantised durations trained on the
  recordings drives the Learned mode, sampling phrases in the player's own
  style with the feel's accents on top.
- **Transcribe audio** (to do): onset and pitch detection on recordings of
  real players, mapped onto a known layout, to grow the corpus.
- **Bigger models** (to do): a small sequence model exported to ONNX or
  TF.js once there is enough material, plus dyad and groove statistics.

### 3. Composition with a language model

- Ask Claude for a phrase as structured JSON (events in beats, hand,
  accent role, dyad pairs), given the layout, feel and a style prompt such
  as "slow, sparse, resolves often". The humanize layer stays
  deterministic so the result still sounds like a person.
- Pages is static, so this needs a small proxy (a serverless function
  holding the key) or a bring-your-own-key field stored locally.

### 4. Taste feedback (done, first version)

- Thumbs up and down on a phrase nudge the weights of the rhythmic cells
  it used and the dyad bias, per device. A disliked phrase is replaced at
  once; a liked one stays.

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
