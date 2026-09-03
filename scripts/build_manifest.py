#!/usr/bin/env python3
"""Build a sample pack manifest (pack.json) from a folder of recordings.

Files are named  <pitch>[_<role>]_v<layer>_rr<take>.<ext>

The same take in several encodings (A3_v1_rr1.m4a and A3_v1_rr1.flac) is
listed as alternatives, smallest first; the browser picks the first it can
decode.
  pitch  : note name with octave. Write sharps as "s" and flats as "b" so
           the name is filesystem and URL safe: Cs4, Db4, A3, Bb3.
  role   : optional, one of ding, top, bottom. Omit for a zone that covers any.
  layer  : velocity layer number, 1 = softest.
  take   : round-robin take number, 1-based.
  ext    : wav, flac, ogg, mp3, m4a.

Examples: D3_ding_v2_rr1.wav   A3_top_v4_rr3.flac   C5_bottom_v1_rr2.wav   G4_v3_rr1.wav

Velocity layers split the 0..1 range evenly unless --layers gives explicit
boundaries, e.g. --layers 0,0.3,0.55,0.8,1 for four layers.

Usage:
  python3 scripts/build_manifest.py public/packs/<pack-id> --name "Isthmus D Celtic" [--layers ...] [--a4 440] [--crossfade 0.08] [--max-shift 2]

Writes <dir>/pack.json and registers the pack in public/packs/index.json.
"""
import argparse, json, re, sys
from collections import defaultdict
from pathlib import Path

NAME_RE = re.compile(r'^([A-Ga-g])(s|b|#)?(-?\d)(?:_(ding|top|bottom))?_v(\d+)_rr(\d+)\.(wav|flac|ogg|opus|webm|mp3|m4a|aac)$', re.I)

# Preference when a take exists in several encodings: smallest download first.
EXT_ORDER = ['m4a', 'aac', 'ogg', 'opus', 'webm', 'mp3', 'flac', 'wav']


def parse_name(name):
    m = NAME_RE.match(name)
    if not m:
        return None
    letter, acc, octave, role, layer, take, ext = m.groups()
    acc = {'s': '#', '#': '#', 'b': 'b', None: ''}[acc.lower() if acc else None]
    return dict(pitch=f"{letter.upper()}{acc}{octave}", role=role.lower() if role else None,
                layer=int(layer), take=int(take), ext=ext.lower())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('dir', help='pack directory inside public/packs')
    ap.add_argument('--name', required=True)
    ap.add_argument('--layers', help='comma-separated velocity boundaries from 0 to 1')
    ap.add_argument('--a4', type=float, default=None)
    ap.add_argument('--crossfade', type=float, default=None)
    ap.add_argument('--max-shift', type=float, default=None)
    args = ap.parse_args()

    root = Path(args.dir)
    if not root.is_dir():
        sys.exit(f"not a directory: {root}")

    zones = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))  # (pitch, role) -> layer -> take -> [files]
    skipped = []
    max_layer = 0
    for f in sorted(root.iterdir()):
        if f.name == 'pack.json' or f.name.startswith('.'):
            continue
        info = parse_name(f.name)
        if not info:
            skipped.append(f.name)
            continue
        zones[(info['pitch'], info['role'])][info['layer']][info['take']].append(f.name)
        max_layer = max(max_layer, info['layer'])
    if not zones:
        sys.exit('no sample files matched the naming convention')

    if args.layers:
        bounds = [float(x) for x in args.layers.split(',')]
        if len(bounds) - 1 != max_layer:
            sys.exit(f"--layers gives {len(bounds) - 1} layers but files go up to v{max_layer}")
    else:
        bounds = [i / max_layer for i in range(max_layer + 1)]

    manifest = {'name': args.name, 'version': 1}
    if args.a4 is not None: manifest['a4'] = args.a4
    if args.crossfade is not None: manifest['crossfade'] = args.crossfade
    if args.max_shift is not None: manifest['maxShift'] = args.max_shift
    manifest['zones'] = []
    warnings = []
    for (pitch, role), layers in sorted(zones.items(), key=lambda kv: (kv[0][0], kv[0][1] or '')):
        zone = {'pitch': pitch}
        if role: zone['role'] = role
        zone['layers'] = []
        for n in range(1, max_layer + 1):
            takes = layers.get(n)
            if not takes:
                warnings.append(f"{pitch}{'/' + role if role else ''}: no files for layer v{n}")
                continue
            files = []
            for k in sorted(takes):
                alts = sorted(takes[k], key=lambda f: EXT_ORDER.index(f.rsplit('.', 1)[1].lower()))
                files.append(alts[0] if len(alts) == 1 else alts)
            zone['layers'].append({'lo': bounds[n - 1], 'hi': bounds[n], 'files': files})
        if zone['layers']:
            manifest['zones'].append(zone)

    out = root / 'pack.json'
    out.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"wrote {out}: {len(manifest['zones'])} zones, {max_layer} velocity layers")
    for w in warnings: print('warning:', w)
    if skipped: print('skipped (name not recognised):', ', '.join(skipped))

    index_path = root.parent / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'packs': []}
    pack_id = root.name
    entry = {'id': pack_id, 'name': args.name, 'manifest': f"packs/{pack_id}/pack.json"}
    index['packs'] = [p for p in index.get('packs', []) if p.get('id') != pack_id] + [entry]
    index_path.write_text(json.dumps(index, indent=2) + '\n')
    print(f"registered '{pack_id}' in {index_path}")


if __name__ == '__main__':
    main()
