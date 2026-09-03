# What a tak actually sounds like

Measurements taken to model the tak (fingertip click on the shoulder) and
the slap (flat fingers on the interstitial steel). Analysis ran in the
browser with `public/analysis/strokes.js`: a spectrogram onset finder that
subtracts the ringing background from each attack and times how fast the
2 to 9 kHz band falls back.

## Sources

- Malte Marten, "Soulshine", handpan solo (YouTube TUeY4kUiLZ8). Reverberant
  performance recording, 64 stroke-like onsets found.
- Malte Marten, "Handpan Snack" weeks 17 and 19 (Bl3-A6AqqA4, g2ggujkeUgY).
  Drier, a different pan, 40 stroke-like onsets.
- Lesson videos on the tak and slap (Xr_0VN4hmQ4, dCWX1JbxJi0) for the
  technique itself; speech made them useless for measurement.

Audio files are downloaded with yt-dlp into `public/analysis/` (ignored by
git) and read from the dev server.

## Findings

A stroke is not a noise click. It rings a handful of shell modes for about
a tenth of a second:

| Measure | Soulshine (reverberant) | Snack clips (drier) |
| --- | --- | --- |
| High band (2 to 9 kHz) time to fall 20 dB | 91 ms median | 59 to 69 ms |
| Time to fall 30 dB | 160 ms | 80 to 180 ms |
| Residual spectral centroid | 5.2 kHz | 4.4 to 5.7 kHz |
| Energy 1 to 3 kHz | 0.44 | 0.22 to 0.32 |
| Energy 3 to 8 kHz | 0.32 | 0.43 to 0.60 |
| Energy 300 Hz to 1 kHz | 0.10 | 0.09 to 0.12 |
| Energy above 8 kHz | 0.06 | 0.06 to 0.10 |

Recurring spectral peaks: a body thump around 190 to 375 Hz (the single most
common peak), a weak mode near 500 to 750 Hz, a cluster at 1.2 to 1.8 kHz,
a stronger cluster at 2.2 to 3 kHz, and on the second pan a cluster at 4 to
5 kHz. Darker strokes (slaps, or soft taks) sit on the 1.2 to 1.7 kHz
cluster plus the thump, with little above 3 kHz.

No new tonal energy appears below 1 kHz after the attack (the "low rise"
measure stays near zero), which is what separates a stroke from a note.

## The model

`src/audio/synthHandpan.ts` renders strokes by modal synthesis: sine
resonators at those clusters (jittered a few percent per strike so no two
are identical) with amplitude time constants of 12 to 32 ms, plus a few
milliseconds of band-passed contact noise. Measured with the same analyzer,
the synth tak lands at a 4.6 kHz centroid, 48 ms to fall 20 dB (dry), and
band shares within the range of the drier clips; the slap sits on the
1.25 to 1.75 kHz cluster with a bigger thump.

When real samples arrive, record taks and slaps at three velocities on the
shoulder between two fields, and the engine can swap these models for
recordings.
