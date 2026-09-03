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
- `files` are relative to the manifest (or to `baseUrl` if given). Browsers
  decode WAV, FLAC, OGG, MP3 and AAC; WAV and FLAC keep the transient intact.
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
