# virtual-handpan

A web-based virtual handpan for auditioning scales and note layouts.

The goal is to hear how a given set of notes sounds before committing to an
instrument: pick a builder's scale (or lay out your own notes), then play it by
hand or let the app generate phrases from it.

## Reference

The starting point is the Isthmus Instruments "Scale Randomizer", an R Shiny
app that plays a random sequence of sine tones drawn from a chosen scale:

- App: https://isthmusinstruments.shinyapps.io/IsthmusScaleRandomizer/
- Write-up: https://www.isthmusinstruments.com/isthmus-handpan-blog/how-to-pick-a-handpan-scale
- Notes on how it works: [docs/reference/isthmus-scale-randomizer.md](docs/reference/isthmus-scale-randomizer.md)

## Data

- `data/reference/handpan-org-scales.csv` is a raw export of the community
  scale spreadsheet maintained by Jean-Mattheiu and Julien Aho (handpan.org),
  which the Isthmus app draws from.
- `data/scales.json` is that sheet converted to one record per scale
  (maker, name, feel, ding, ordered notes with bottom-note flags).
  Regenerate it with:

```bash
python3 scripts/convert_scales.py data/reference/handpan-org-scales.csv data/scales.json
```
