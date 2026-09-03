# virtual-handpan

A web-based virtual handpan for auditioning scales and note layouts.

Pick a builder's scale or lay out your own notes, play the pan by click or
keyboard, or let it play generated phrases so you can hear what a set of
notes does before committing to an instrument. Where this is heading is in
[docs/roadmap.md](docs/roadmap.md): a photorealistic, fully configurable
pan with a sampled, velocity-layered, round-robin sound engine.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm test` runs the unit tests,
`npm run build` produces a static site in `dist/`.

## What it does today

- **Scale library.** 93 scales from 17 builders, taken from the handpan.org
  community sheet, grouped by maker with the maker's own accidental spelling.
- **Custom layouts.** Add or remove notes from A2 to B5, move any note to the
  underside, transpose, and choose which side the zigzag starts on. The
  lowest top-side note is the ding.
- **Playable pan, in 3D or 2D.** The 3D view is a WebGL shell built from
  the layout (domes, raised fields, dimples, gu) in physically based steel
  with a heat-tint map; tilt and swing it within limits, flip it to see the
  underside. The 2D view is the SVG skin with a collapsible underside
  picture-in-picture. Either way, click a field (harder toward the centre)
  or use the keyboard: home row for the ring, space for the ding, bottom
  row for underside notes.
- **Two voices.** A synthesized handpan (additive partials at 1:2:3 with a
  detuned shimmer, pitch- and velocity-dependent decay, a noise strike) and
  a sample engine with velocity layers, equal-power crossfades and round
  robin. Both sit behind one `Instrument` interface. Packs load lazily,
  only the zones the current notes reach, and are cached on the device.
  Until real recordings exist the sample engine plays a starter pack
  rendered from the synth; [docs/sample-packs.md](docs/sample-packs.md)
  covers the pack format, loading, encodings, and how to record a real pan.
- **Nitrided steel look.** A drawn skin modelled on Isthmus Instruments'
  heat-tinted cobalt finish, with an underside picture-in-picture.
- **Generated phrases.** Scale up and down, uniform random draws like the
  Isthmus tool, or melodic step-biased phrases with rests and metric
  accents. Human feel controls (timing jitter, swing, velocity, spread) and
  tempo apply live while a phrase plays; changing the phrase itself
  restarts it.

## Layout

```
src/model    pitch names, layouts, scale library
src/audio    engine, Instrument interface, synth voice, sample engine and pack loader
src/music    generator, humanization, sequencer, RNG
src/model    also shell3d.ts, the heightfield model behind the 3D view
src/ui       React components (2D and 3D pan views, skin, editors, transport)
data         reference sheet export and the converted scales.json
public/packs sample packs (pack.json manifests plus audio) and index.json
scripts      convert_scales.py regenerates data/scales.json; build_manifest.py builds a pack manifest
docs         roadmap, sample pack format and recording guide, notes on the Isthmus reference tool
```

## Deploying

`.github/workflows/pages.yml` builds, tests and publishes `dist/` to GitHub
Pages on every push to `main`, with the base path set to
`/virtual-handpan/`. Pages needs the repository to be public (or a paid
plan) and Pages enabled with the "GitHub Actions" source.

## Reference

The starting point was the Isthmus Instruments "Scale Randomizer", an R
Shiny app that plays random sine tones from a chosen scale. Notes on how it
works are in
[docs/reference/isthmus-scale-randomizer.md](docs/reference/isthmus-scale-randomizer.md).
