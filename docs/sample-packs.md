# Sample packs

How recorded samples get into the app, and how to record them.

## What the engine does

`SampledInstrument` (`src/audio/sampledInstrument.ts`) plays a pack through
the same `Instrument` interface as the synth. For each strike it:

1. Picks the **zone** (a recorded pitch, optionally tied to a role: ding,
   top or bottom). An exact pitch wins; otherwise the nearest zone within
   `maxShift` semitones is pitch-shifted, preferring to shift a lower sample
   up. A zone for the right role beats a role-less zone, which beats a zone
   recorded for another role.
2. Weights the **velocity layers**. Inside a layer only that layer sounds.
   Within `crossfade` of a boundary shared with a neighbour, both sound with
   an equal-power blend, so the seam between soft and hard takes is smooth.
3. Advances the **round robin** for each chosen layer, so consecutive
   strikes of one note never reuse the same take when there is a choice.
4. Applies a gentle velocity-to-level curve on top of the recordings' own
   dynamics, and shifts playback rate for the tuning reference (`a4`) and
   any pitch shift.

Pitches the pack cannot reach fall back to the synth voice.

## Loading and caching

Packs load lazily. When a pack is chosen the app fetches only the manifest,
then decodes just the zones the notes on the current pan can reach. Within
a request, every zone's most likely velocity layer (around velocity 0.7) is
queued before any zone's least likely one, so the pan becomes playable
sooner; until a zone has landed, its note plays on the synth. Changing the
layout loads what the new notes need and drops decoded audio for zones
nothing can reach any more.

Fetched files are stored in the browser's Cache API, so a pack is
downloaded once per device even though GitHub Pages serves short cache
lifetimes. "Clear cached samples" under Sound & view removes them.

Memory is the real budget. Decoded audio is raw floats: a mono 6 s sample
at 48 kHz costs about 1.2 MB in RAM whatever the file format, so a ten-note
layout with four layers and five takes holds around 230 MB decoded. Keep
recordings mono unless the stereo image matters, trim tails at the noise
floor, and prefer fewer, better takes.

## Encodings

Browsers decode WAV, FLAC, MP3 and AAC everywhere; Ogg Opus is missing on
some Safari versions. Ship AAC for size, and optionally FLAC alongside for
lossless where supported. A take may list both:

```json
{ "lo": 0.55, "hi": 0.8, "files": [["A3_top_v3_rr1.m4a", "A3_top_v3_rr1.flac"], "A3_top_v3_rr2.m4a"] }
```

The manifest script groups files that share a name and differ only in
extension into such alternatives automatically, smallest first.

From WAV masters, mono, with ffmpeg:

```bash
for f in *.wav; do ffmpeg -loglevel error -i "$f" -ac 1 -c:a aac -b:a 160k "${f%.wav}.m4a"; done
```

```bash
for f in *.wav; do ffmpeg -loglevel error -i "$f" -ac 1 -c:a flac "${f%.wav}.flac"; done
```

Rough sizes for a 6 s mono take: WAV 24-bit 0.9 MB, FLAC 0.35 MB, AAC at
160 kbps 0.12 MB.

## Manifest format

A pack is a folder under `public/packs/<pack-id>/` with the audio files and
a `pack.json`:

```json
{
  "name": "Isthmus D Celtic",
  "version": 1,
  "a4": 440,
  "crossfade": 0.08,
  "maxShift": 2,
  "zones": [
    {
      "pitch": "D3",
      "role": "ding",
      "layers": [
        { "lo": 0, "hi": 0.3, "files": ["D3_ding_v1_rr1.wav", "D3_ding_v1_rr2.wav"] },
        { "lo": 0.3, "hi": 0.55, "files": ["D3_ding_v2_rr1.wav", "D3_ding_v2_rr2.wav"] },
        { "lo": 0.55, "hi": 0.8, "files": ["D3_ding_v3_rr1.wav", "D3_ding_v3_rr2.wav"] },
        { "lo": 0.8, "hi": 1, "files": ["D3_ding_v4_rr1.wav", "D3_ding_v4_rr2.wav"], "gainDb": -1 }
      ]
    },
    { "pitch": "A3", "role": "top", "layers": [ "..." ] }
  ]
}
```

- `pitch` uses sharps or flats with an octave (`A3`, `Bb3`, `C#4`).
- `role` is optional. Leave it out for a recording that should serve any
  position.
- Layers should tile 0..1. `lo` is inclusive, `hi` exclusive except for the
  top layer.
- `files` are relative to the manifest (or to `baseUrl` if given). An entry
  may be an array of the same take in several encodings, preferred first.
- `gainDb` trims a layer. Use it to tame a hot take, not to normalise.

`public/packs/index.json` lists the packs the app offers.

`scripts/build_manifest.py` writes both files from a folder of correctly
named recordings:

```bash
python3 scripts/build_manifest.py public/packs/isthmus-d-celtic --name "Isthmus D Celtic" --layers 0,0.3,0.55,0.8,1
```

File names follow `<pitch>[_<role>]_v<layer>_rr<take>.<ext>`, writing sharps
as `s` (`Cs4`) so names stay URL-safe: `D3_ding_v2_rr1.wav`,
`A3_top_v4_rr3.flac`, `C5_bottom_v1_rr2.wav`.

## Recording guide

Aimed at capturing one real handpan well enough to drive this engine.

**Room and mics.** A quiet, not too live room. A stereo pair (spaced or
ORTF) 50 to 80 cm above the pan gives the natural image; add a close mono
mic 15 cm off the shell if you want a drier option later. Keep positions
identical for the whole session. 48 kHz, 24-bit.

**Strike spot.** Choose one: the dimple with the pad of the finger is the
standard tone. Record the same spot for every take of a zone. Shoulder
tones, rim taps and slaps can be separate zones later.

**Velocity layers.** Four layers works well: barely there, gentle, normal
playing, and hard. Aim for consistent loudness within a layer; a peak meter
helps. Record layers in order for each note so hand position stays stable.
Do not normalise across layers afterwards; the level difference is part of
the realism, and `gainDb` exists for small fixes.

**Round robins.** Four to six takes per layer per note. Small natural
variation is the point; do not try to make them identical.

**Let it ring.** Fields ring 6 to 10 s, the ding longer. Record until the
tail is in the noise floor. No fades on the front. Trim each file so the
transient starts within a few milliseconds of the start.

**Which notes.** Every note on the instrument, including bottom notes, each
tagged with its role. The ding is worth extra takes. For a second
instrument in a different key, recording every note again beats pitch
shifting; the engine only shifts to cover gaps.

**Naming.** Rename to the convention above, drop the files in
`public/packs/<pack-id>/`, run the manifest script, and pick the pack under
Sound & view. A ten-note pan at four layers and five takes is 200 files;
FLAC keeps that manageable.

**Extras for later.** A hand-damp release sample per note, mutant or
shoulder tones as extra zones, and a room impulse response from the same
session so the synth fallback sits in the same space.
