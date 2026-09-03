#!/usr/bin/env python3
"""Generate a tiny synthetic sample pack for exercising the loader.

Writes 20 short decaying-tone WAVs (5 notes x 2 velocity layers x 2 takes)
into public/packs/test-tones and builds its manifest. The folder is ignored
by git; run this whenever you want a real pack on disk without recordings.

Usage: python3 scripts/make_test_pack.py
"""
import math, random, struct, subprocess, sys, wave
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'public' / 'packs' / 'test-tones'
SR = 48000
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def freq(pitch):
    name, octave = pitch[:-1], int(pitch[-1])
    return 440 * 2 ** ((12 * (octave + 1) + NAMES.index(name) - 69) / 12)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    random.seed(1)
    notes = [('D3', 'ding'), ('A3', 'top'), ('C4', 'top'), ('D4', 'top'), ('C5', 'bottom')]
    layers = {1: 0.25, 2: 0.85}
    for pitch, role in notes:
        f0 = freq(pitch)
        for layer, amp in layers.items():
            for take in (1, 2):
                det = 1 + random.uniform(-0.002, 0.002)
                n = int(SR * 2.5)
                frames = bytearray()
                for i in range(n):
                    t = i / SR
                    env = math.exp(-t * (1.6 if role == 'ding' else 2.2))
                    s = (math.sin(2 * math.pi * f0 * det * t)
                         + 0.45 * math.sin(2 * math.pi * 2 * f0 * det * t) * math.exp(-t * 1.5)
                         + 0.25 * math.sin(2 * math.pi * 3 * f0 * det * t) * math.exp(-t * 2.5))
                    v = amp * env * s * 0.5
                    frames += struct.pack('<h', int(max(-1, min(1, v)) * 32767))
                name = f"{pitch.replace('#', 's')}_{role}_v{layer}_rr{take}.wav"
                with wave.open(str(OUT / name), 'wb') as w:
                    w.setnchannels(1)
                    w.setsampwidth(2)
                    w.setframerate(SR)
                    w.writeframes(bytes(frames))
    print(f"wrote {len(notes) * len(layers) * 2} files to {OUT}")
    subprocess.run([sys.executable, str(Path(__file__).with_name('build_manifest.py')), str(OUT),
                    '--name', 'Test tones', '--layers', '0,0.5,1'], check=True)


if __name__ == '__main__':
    main()
