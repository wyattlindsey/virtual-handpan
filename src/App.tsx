import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from './audio/engine';
import type { Instrument } from './audio/instrument';
import { SynthHandpan } from './audio/synthHandpan';
import { type Layout, type NoteSpec, type Zigzag, allFieldPositions, layoutFromNotes, transposeLayout } from './model/layout';
import type { Spelling } from './model/pitch';
import { type LibraryScale, findScale, layoutFromScale } from './model/scales';
import { DEFAULT_GENERATOR_PARAMS, type GeneratorParams, generatePhrase, humanize } from './music/generator';
import { Sequencer } from './music/sequencer';
import { NoteEditor } from './ui/NoteEditor';
import { PanView, type StrikeInfo } from './ui/PanView';
import { ScalePicker } from './ui/ScalePicker';
import { SoundControls } from './ui/SoundControls';
import { Transport } from './ui/Transport';
import { UndersideView } from './ui/UndersideView';
import { keyHints, keyMap } from './ui/keys';

const DEFAULT_SCALE_ID = 'SpB/Kurd9';

function roleFor(layout: Layout, pitch: string): 'ding' | 'top' | 'bottom' {
  if (pitch === layout.ding) return 'ding';
  if (layout.top.includes(pitch)) return 'top';
  return 'bottom';
}

export function App() {
  const [scaleId, setScaleId] = useState<string | null>(DEFAULT_SCALE_ID);
  const [base, setBase] = useState<Layout>(() => layoutFromScale(findScale(DEFAULT_SCALE_ID)!));
  const [semitones, setSemitones] = useState(0);
  const [spelling, setSpelling] = useState<Spelling>('flat');
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const [params, setParams] = useState<GeneratorParams>(DEFAULT_GENERATOR_PARAMS);
  const [playing, setPlaying] = useState(false);
  const [showUnderside, setShowUnderside] = useState(true);
  const [volume, setVolume] = useState(engine.getVolume());
  const [reverb, setReverb] = useState(engine.getReverb());

  const layout = useMemo(() => {
    const t = transposeLayout(base, semitones);
    return semitones === 0 ? t : { ...t, name: `${base.name} ${semitones > 0 ? '+' : ''}${semitones}` };
  }, [base, semitones]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const instrumentRef = useRef<Instrument | null>(null);
  const ensureAudio = useCallback(async (): Promise<Instrument> => {
    const resumed = engine.resume();
    if (!instrumentRef.current) instrumentRef.current = new SynthHandpan(engine);
    await resumed;
    return instrumentRef.current;
  }, []);

  const sequencer = useMemo(
    () => new Sequencer(engine, () => instrumentRef.current!, (pitch) => roleFor(layoutRef.current, pitch)),
    [],
  );

  const flash = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setFlashes((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = (prev[id] ?? 0) + 1;
      return next;
    });
  }, []);

  const strike = useCallback(
    (info: StrikeInfo) => {
      void ensureAudio().then((inst) => inst.noteOn(info.pitch, info.velocity, undefined, info.side));
      flash([info.fieldId]);
    },
    [ensureAudio, flash],
  );

  // Phrase for the current layout and settings.
  const phrase = useMemo(() => generatePhrase(layout, params), [layout, params]);
  const scheduled = useMemo(() => humanize(phrase, params), [phrase, params]);
  const phraseSeconds = scheduled.length ? scheduled[scheduled.length - 1]!.time + 0.3 : 0;

  const fieldsByPitch = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of allFieldPositions(layout)) m.set(f.pitch, [...(m.get(f.pitch) ?? []), f.id]);
    return m;
  }, [layout]);

  const stop = useCallback(() => sequencer.stop(), [sequencer]);

  const play = useCallback(async () => {
    await ensureAudio();
    sequencer.play(scheduled, {
      onNote: (n) => flash(fieldsByPitch.get(n.pitch) ?? []),
      onEnd: () => setPlaying(false),
    });
    setPlaying(true);
  }, [ensureAudio, sequencer, scheduled, fieldsByPitch, flash]);

  // Any change to what would be played stops the current phrase.
  useEffect(() => { stop(); }, [layout, params.mode, stop]);

  // Keyboard playing.
  useEffect(() => {
    const map = keyMap(layout);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) return;
      if (e.key === 'Escape') { stop(); return; }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = map.get(e.key.toLowerCase()) ?? (e.key === ' ' ? map.get(' ') : undefined);
      if (!hit) return;
      e.preventDefault();
      const velocity = (e.shiftKey ? 0.95 : 0.74) + (Math.random() - 0.5) * 0.08;
      strike({ fieldId: hit.fieldId, pitch: hit.pitch, side: hit.side, velocity });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, strike, stop]);

  const selectScale = (s: LibraryScale) => {
    setScaleId(s.id);
    setBase(layoutFromScale(s));
    setSemitones(0);
    setSpelling(s.prefersFlats ? 'flat' : 'sharp');
  };

  const changeNotes = (notes: NoteSpec[]) => {
    setBase(layoutFromNotes('Custom', notes, layout.zigzag));
    setSemitones(0);
    setScaleId(null);
  };

  const setZigzag = (z: Zigzag) => setBase((b) => ({ ...b, zigzag: z }));

  const hints = useMemo(() => keyHints(layout), [layout]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Virtual Handpan</h1>
        <span className="muted">{layout.name}</span>
      </header>

      <aside className="column left">
        <ScalePicker value={scaleId} spelling={spelling} onSelect={selectScale} />
        <NoteEditor
          layout={layout}
          spelling={spelling}
          semitones={semitones}
          onChangeNotes={changeNotes}
          onTranspose={(d) => setSemitones((s) => s + d)}
          onZigzag={setZigzag}
        />
      </aside>

      <main className="stage">
        <PanView layout={layout} spelling={spelling} flashes={flashes} keyHints={hints} onStrike={strike} />
        {showUnderside && (
          <div className="pip" aria-label="Underside">
            <UndersideView layout={layout} spelling={spelling} flashes={flashes} keyHints={hints} onStrike={strike} />
            <span className="pip-label">underside</span>
          </div>
        )}
      </main>

      <aside className="column right">
        <Transport
          params={params}
          onChange={(patch) => setParams((p) => ({ ...p, ...patch }))}
          playing={playing}
          onPlay={() => { void play(); }}
          onStop={stop}
          onReseed={() => setParams((p) => ({ ...p, seed: (p.seed * 1103515245 + 12345) >>> 0 }))}
          noteCount={scheduled.length}
          seconds={phraseSeconds}
        />
        <SoundControls
          volume={volume}
          reverb={reverb}
          spelling={spelling}
          showUnderside={showUnderside}
          onVolume={(v) => { setVolume(v); engine.setVolume(v); }}
          onReverb={(v) => { setReverb(v); engine.setReverb(v); }}
          onSpelling={setSpelling}
          onToggleUnderside={() => setShowUnderside((s) => !s)}
        />
      </aside>
    </div>
  );
}
