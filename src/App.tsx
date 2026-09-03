import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from './audio/engine';
import type { Instrument } from './audio/instrument';
import type { LazyPack } from './audio/lazyPack';
import { type PackEntry, fetchPackIndex, manifestUrl } from './audio/packIndex';
import { clearSampleCache, openLazyPack } from './audio/packLoader';
import { SampledInstrument } from './audio/sampledInstrument';
import { renderStarterPack } from './audio/starterPack';
import { SynthHandpan } from './audio/synthHandpan';
import { type Layout, type NoteSpec, type Zigzag, allFieldPositions, layoutFromNotes, layoutPitches, transposeLayout } from './model/layout';
import type { Spelling } from './model/pitch';
import { type LibraryScale, findScale, layoutFromScale } from './model/scales';
import { getFeel } from './music/feels';
import { DEFAULT_GENERATOR_PARAMS, type GeneratorParams, generatePhraseDetailed, phraseKey, phraseSeconds } from './music/generator';
import { trainModel } from './music/learn';
import { type Recording, Recorder, isRecording, percussionPitch, recordingToPhrase } from './music/recorder';
import { Sequencer } from './music/sequencer';
import { type TasteWeights, applyFeedback, emptyTaste } from './music/taste';
import { NoteEditor } from './ui/NoteEditor';
import { PanView, type StrikeInfo } from './ui/PanView';
import { PanView3D } from './ui/PanView3D';
import { ScalePicker } from './ui/ScalePicker';
import { STARTER_PACK_ID, SoundControls, type ViewKind, type VoiceKind } from './ui/SoundControls';
import { Transport } from './ui/Transport';
import { UndersideView } from './ui/UndersideView';
import { keyHints, keyMap } from './ui/keys';

const DEFAULT_SCALE_ID = 'SpB/Kurd9';

function loadJson<T>(key: string, fallback: T, check: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v: unknown = JSON.parse(raw);
    return check(v) ? v : fallback;
  } catch { return fallback; }
}

function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or full */ }
}

interface SoundSettings { volume: number; reverb: number; bass: number }
const isSound = (v: unknown): v is SoundSettings =>
  typeof v === 'object' && v !== null && ['volume', 'reverb', 'bass'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');
const isTaste = (v: unknown): v is TasteWeights =>
  typeof v === 'object' && v !== null && typeof (v as TasteWeights).cells === 'object' && typeof (v as TasteWeights).dyadBias === 'number';
const isRecordingList = (v: unknown): v is Recording[] => Array.isArray(v) && v.every(isRecording);

// Sound settings depend on the speakers, so they live on the device.
const initialSound = loadJson<SoundSettings>('handpan.sound', { volume: engine.getVolume(), reverb: engine.getReverb(), bass: engine.getBass() }, isSound);
engine.setVolume(initialSound.volume);
engine.setReverb(initialSound.reverb);
engine.setBass(initialSound.bass);

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
  // The underside PIP opens by itself for layouts with bottom notes unless the
  // user has collapsed or opened it explicitly; that choice is remembered.
  const [pipPreference, setPipPreference] = useState<'open' | 'closed' | null>(() => {
    try {
      const v = localStorage.getItem('handpan.pip');
      return v === 'open' || v === 'closed' ? v : null;
    } catch { return null; }
  });
  const togglePip = () => {
    const next = pipOpen ? 'closed' : 'open';
    setPipPreference(next);
    try { localStorage.setItem('handpan.pip', next); } catch { /* private mode */ }
  };
  const [view, setView] = useState<ViewKind>(() => {
    try { return localStorage.getItem('handpan.view') === '2d' ? '2d' : '3d'; } catch { return '3d'; }
  });
  const chooseView = (v: ViewKind) => {
    setView(v);
    try { localStorage.setItem('handpan.view', v); } catch { /* private mode */ }
  };
  const [volume, setVolume] = useState(initialSound.volume);
  const [reverb, setReverb] = useState(initialSound.reverb);
  const [bass, setBass] = useState(initialSound.bass);
  useEffect(() => { saveJson('handpan.sound', { volume, reverb, bass }); }, [volume, reverb, bass]);

  // Taste, recordings and the model learned from them.
  const [taste, setTaste] = useState<TasteWeights>(() => loadJson('handpan.taste', emptyTaste(), isTaste));
  const tasteRef = useRef(taste);
  tasteRef.current = taste;
  const [recordings, setRecordings] = useState<Recording[]>(() => loadJson('handpan.recordings', [], isRecordingList));
  const model = useMemo(() => (recordings.length ? trainModel(recordings) : null), [recordings]);
  const recorderRef = useRef(new Recorder());
  const [recording, setRecording] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [voice, setVoice] = useState<VoiceKind>('synth');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [packId, setPackId] = useState(STARTER_PACK_ID);
  const [packs, setPacks] = useState<PackEntry[]>([]);
  /** The open lazy pack and the instrument playing it, kept across layout changes. */
  const lazyRef = useRef<{ id: string; pack: LazyPack; instrument: SampledInstrument } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPackIndex(import.meta.env.BASE_URL).then((list) => { if (!cancelled) setPacks(list); });
    return () => { cancelled = true; };
  }, []);

  const layout = useMemo(() => {
    const t = transposeLayout(base, semitones);
    return semitones === 0 ? t : { ...t, name: `${base.name} ${semitones > 0 ? '+' : ''}${semitones}` };
  }, [base, semitones]);
  const pipOpen = pipPreference ? pipPreference === 'open' : layout.bottom.length > 0;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // The synth always exists once audio starts; it is the fallback for the sampled voice too.
  const synthRef = useRef<SynthHandpan | null>(null);
  const instrumentRef = useRef<Instrument | null>(null);
  const ensureSynth = useCallback((): SynthHandpan => {
    if (!synthRef.current) synthRef.current = new SynthHandpan(engine);
    return synthRef.current;
  }, []);
  const ensureAudio = useCallback(async (): Promise<Instrument> => {
    const resumed = engine.resume();
    const synth = ensureSynth();
    if (!instrumentRef.current) instrumentRef.current = synth;
    await resumed;
    return instrumentRef.current;
  }, [ensureSynth]);

  const sequencer = useMemo(
    () => new Sequencer(engine, () => instrumentRef.current, (pitch) => roleFor(layoutRef.current, pitch)),
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
      const kind = info.kind;
      void ensureAudio().then((inst) => (kind ? inst.hit(kind, info.velocity) : inst.noteOn(info.pitch, info.velocity, undefined, info.side as 'ding' | 'top' | 'bottom')));
      flash([info.fieldId]);
      if (recorderRef.current.recording) {
        recorderRef.current.add(kind ? percussionPitch(kind) : info.pitch, info.velocity, engine.now);
        setRecordCount(recorderRef.current.count);
      }
    },
    [ensureAudio, flash],
  );

  // What is played depends on the layout and the phrase settings; how it is
  // played (tempo, jitter, swing, velocity) is read live by the sequencer.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const key = phraseKey(params);
  const detailed = useMemo(
    () => generatePhraseDetailed(layout, paramsRef.current, { taste: tasteRef.current, model }),
    [layout, key, model],
  );
  const phrase = detailed.notes;
  const seconds = phraseSeconds(phrase, params.bpm);

  const fieldsByPitch = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of allFieldPositions(layout)) m.set(f.pitch, [...(m.get(f.pitch) ?? []), f.id]);
    return m;
  }, [layout]);

  const stop = useCallback(() => sequencer.stop(), [sequencer]);

  const play = useCallback(async () => {
    await ensureAudio();
    sequencer.play(phrase, () => paramsRef.current, paramsRef.current.seed, {
      onNote: (n) => flash(n.kind ? ['rim'] : fieldsByPitch.get(n.pitch) ?? []),
      onEnd: () => setPlaying(false),
    });
    setPlaying(true);
  }, [ensureAudio, sequencer, phrase, fieldsByPitch, flash]);

  // A new phrase while one is playing starts the new one straight away.
  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(() => {
    if (playingRef.current) void play();
  }, [phrase, play]);

  const playRecording = useCallback(async (r: Recording) => {
    await ensureAudio();
    // Recorded timing and dynamics are the point, so the human layer stays out of it.
    const raw = () => ({ ...paramsRef.current, jitterMs: 0, velocityVariation: 0, swing: 0, lean: 0, drift: 0, flamMs: 0 });
    sequencer.play(recordingToPhrase(r), raw, 1, {
      onNote: (n) => flash(n.kind ? ['rim'] : fieldsByPitch.get(n.pitch) ?? []),
      onEnd: () => setPlaying(false),
    });
    setPlaying(true);
  }, [ensureAudio, sequencer, fieldsByPitch, flash]);

  const toggleRecord = () => {
    const rec = recorderRef.current;
    if (rec.recording) {
      const take = rec.stop(params.bpm, layoutPitches(layout), `Take ${recordings.length + 1}`);
      setRecording(false);
      if (take) {
        const next = [take, ...recordings].slice(0, 50);
        setRecordings(next);
        saveJson('handpan.recordings', next);
      }
    } else {
      rec.start();
      setRecordCount(0);
      setRecording(true);
    }
  };

  const deleteRecording = (id: string) => {
    const next = recordings.filter((r) => r.id !== id);
    setRecordings(next);
    saveJson('handpan.recordings', next);
  };

  const feedback = (up: boolean) => {
    const next = applyFeedback(taste, getFeel(params.feel), detailed.cellsUsed, detailed.hadDyads, up);
    setTaste(next);
    saveJson('handpan.taste', next);
    // A liked phrase stays as it is; a disliked one is replaced.
    if (!up) setParams((p) => ({ ...p, tasteVersion: p.tasteVersion + 1, seed: (p.seed * 1103515245 + 12345) >>> 0 }));
  };

  // Build the active instrument for the chosen voice and the notes on the pan.
  useEffect(() => {
    let cancelled = false;
    const previous = instrumentRef.current;
    const retire = (keep: Instrument | null) => {
      if (previous instanceof SampledInstrument && previous !== keep) previous.dispose();
    };
    if (voice === 'synth') {
      instrumentRef.current = ensureSynth();
      retire(null);
      if (lazyRef.current) { lazyRef.current.pack.prune([]); lazyRef.current = null; }
      setVoiceStatus('');
      return;
    }
    const notes = allFieldPositions(layout).map((f) => ({ pitch: f.pitch, role: f.side }));
    const entry = packs.find((p) => p.id === packId);
    const fail = (err: unknown) => {
      if (cancelled) return;
      setVoiceStatus(`Could not load samples: ${err instanceof Error ? err.message : String(err)}. Uncovered notes use the synth.`);
    };

    if (packId === STARTER_PACK_ID || !entry) {
      setVoiceStatus('Rendering starter samples…');
      renderStarterPack(engine.context.sampleRate, notes, (p) => {
        if (!cancelled) setVoiceStatus(`Rendering starter samples ${p.done}/${p.total}`);
      })
        .then((pack) => {
          if (cancelled) return;
          const sampled = new SampledInstrument(engine, pack, { fallback: ensureSynth() });
          instrumentRef.current = sampled;
          retire(sampled);
          if (lazyRef.current) { lazyRef.current.pack.prune([]); lazyRef.current = null; }
          const layers = Math.max(...pack.zones.map((z) => z.layers.length));
          const takes = Math.max(...pack.zones.flatMap((z) => z.layers.map((l) => l.takes.length)));
          setVoiceStatus(`${pack.name}: ${pack.zones.length} zones · ${layers} velocity layers · ${takes} round robins`);
        })
        .catch(fail);
      return () => { cancelled = true; };
    }

    (async () => {
      let session = lazyRef.current;
      if (!session || session.id !== packId) {
        setVoiceStatus(`Opening ${entry.name}…`);
        const pack = await openLazyPack(engine.context, manifestUrl(import.meta.env.BASE_URL, entry));
        if (cancelled) return;
        const instrument = new SampledInstrument(engine, pack, { fallback: ensureSynth() });
        const old = lazyRef.current;
        lazyRef.current = session = { id: packId, pack, instrument };
        if (old) { old.instrument.dispose(); old.pack.prune([]); }
      }
      // Playable at once: notes still loading fall back to the synth until their zone lands.
      instrumentRef.current = session.instrument;
      retire(session.instrument);
      session.pack.prune(notes);
      await session.pack.ensure(notes, (p) => {
        if (!cancelled && p.total > 0) setVoiceStatus(`${entry.name}: loading ${p.loaded}/${p.total} files…`);
      });
      if (cancelled) return;
      const stats = session.pack.stats();
      const uncovered = notes.filter((n) => !session!.instrument.covers(n.pitch, n.role)).length;
      setVoiceStatus(
        `${entry.name}: ${stats.loadedZones} of ${stats.totalZones} zones loaded · ${stats.loadedFiles} files · ` +
        `${(stats.bytes / 1048576).toFixed(0)} MB decoded` + (uncovered ? ` · ${uncovered} notes on synth` : ''),
      );
    })().catch(fail);
    return () => { cancelled = true; };
  }, [voice, packId, packs, layout, ensureSynth]);

  const clearCache = async () => {
    const ok = await clearSampleCache();
    setVoiceStatus(ok ? 'Cached sample files removed from this device.' : 'No sample cache to clear.');
  };

  // A control clicked with the pointer gives focus back to the page, so the
  // keys keep playing the pan; keyboard users who tabbed to it are unaffected.
  useEffect(() => {
    const onPointerUp = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, input[type="range"]') as HTMLElement | null;
      if (el) setTimeout(() => { if (document.activeElement === el) el.blur(); }, 0);
    };
    document.addEventListener('pointerup', onPointerUp);
    return () => document.removeEventListener('pointerup', onPointerUp);
  }, []);

  // Keyboard playing.
  useEffect(() => {
    const map = keyMap(layout);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Leave selects and text fields alone; sliders and buttons only need space and arrows.
      if (tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      if ((tag === 'BUTTON' || tag === 'INPUT') && e.key === ' ') return;
      if (e.key === 'Escape') { stop(); return; }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = map.get(e.key.toLowerCase()) ?? (e.key === ' ' ? map.get(' ') : undefined);
      if (!hit) return;
      e.preventDefault();
      const velocity = (e.shiftKey ? 0.95 : 0.74) + (Math.random() - 0.5) * 0.08;
      strike({ fieldId: hit.fieldId, pitch: hit.pitch, side: hit.side, velocity, ...(hit.kind ? { kind: hit.kind } : {}) });
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

      <div className="area-scale">
        <ScalePicker value={scaleId} spelling={spelling} onSelect={selectScale} />
      </div>

      <div className="area-notes">
        <NoteEditor
          layout={layout}
          spelling={spelling}
          semitones={semitones}
          onChangeNotes={changeNotes}
          onTranspose={(d) => setSemitones((s) => s + d)}
          onZigzag={setZigzag}
        />
      </div>

      <main className="stage">
        {view === '3d' ? (
          <PanView3D layout={layout} spelling={spelling} flashes={flashes} keyHints={hints} onStrike={strike} />
        ) : (
          <PanView layout={layout} spelling={spelling} flashes={flashes} keyHints={hints} onStrike={strike} />
        )}
        {showUnderside && (pipOpen ? (
          <div className="pip" aria-label="Underside">
            <UndersideView layout={layout} spelling={spelling} flashes={flashes} keyHints={hints} onStrike={strike} />
            <button type="button" className="pip-toggle" onClick={togglePip} title="Collapse the underside view">underside ▾</button>
          </div>
        ) : (
          <button type="button" className="pip-toggle collapsed" onClick={togglePip} title="Show the underside view">underside ▸</button>
        ))}
      </main>

      <aside className="column right">
        <Transport
          params={params}
          onChange={(patch) => setParams((p) => ({ ...p, ...patch }))}
          playing={playing}
          onPlay={() => { void play(); }}
          onStop={stop}
          onReseed={() => setParams((p) => ({ ...p, seed: (p.seed * 1103515245 + 12345) >>> 0 }))}
          onFeedback={feedback}
          noteCount={phrase.length}
          seconds={seconds}
          recording={recording}
          recordCount={recordCount}
          onToggleRecord={toggleRecord}
          recordings={recordings}
          onPlayRecording={(r) => { void playRecording(r); }}
          onDeleteRecording={deleteRecording}
          learnedAvailable={model !== null}
        />
        <SoundControls
          voice={voice}
          voiceStatus={voiceStatus}
          onVoice={setVoice}
          packId={packId}
          packs={packs}
          onPack={setPackId}
          onClearCache={() => { void clearCache(); }}
          volume={volume}
          reverb={reverb}
          spelling={spelling}
          view={view}
          onView={chooseView}
          showUnderside={showUnderside}
          onVolume={(v) => { setVolume(v); engine.setVolume(v); }}
          onReverb={(v) => { setReverb(v); engine.setReverb(v); }}
          bass={bass}
          onBass={(v) => { setBass(v); engine.setBass(v); }}
          onSpelling={setSpelling}
          onToggleUnderside={() => setShowUnderside((s) => !s)}
        />
      </aside>
    </div>
  );
}
