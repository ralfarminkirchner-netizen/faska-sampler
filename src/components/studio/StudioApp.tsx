import { useEffect, useMemo, useRef } from "react";
import {
  Circle,
  Disc3,
  Mic,
  MicOff,
  Play,
  Square,
  Upload,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn, uid } from "@/lib/utils";
import { KIT_META, PATTERN_NAMES } from "@/audio/drums";
import {
  KIT_PAD_KEYS,
  SCALES,
  STEP_COUNT,
  STRETCH_OPTIONS,
  VOICE_PRESETS,
  melodyFromScale,
  type KitId,
  type StretchMode,
  type VoicePresetId,
} from "@/audio/types";
import * as engine from "@/audio/engine";
import { useStudio, type MobileTab } from "@/store/studio";

const PAD_ROWS = [
  [12, 13, 14, 15],
  [8, 9, 10, 11],
  [4, 5, 6, 7],
  [0, 1, 2, 3],
];

const TABS: { id: MobileTab; label: string }[] = [
  { id: "voice", label: "Stimme" },
  { id: "pads", label: "Pads" },
  { id: "pattern", label: "Pattern" },
  { id: "mix", label: "Mix" },
];

function snap() {
  const s = useStudio.getState();
  return {
    patterns: s.patterns,
    currentPattern: s.currentPattern,
    pads: s.pads,
    melodyOn: s.melodyOn,
    melody: s.melody,
    voicePitch: s.voicePitch,
    voicePreset: s.voicePreset,
    click: s.click,
    takes: s.takes,
  };
}

export function StudioApp() {
  return (
    <TooltipProvider delayDuration={250}>
      <StudioInner />
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  );
}

function StudioInner() {
  const ready = useStudio((s) => s.ready);
  const booting = useStudio((s) => s.booting);
  const bootMsg = useStudio((s) => s.bootMsg);

  useEffect(() => {
    if (ready && !engine.isStarted()) {
      useStudio.getState().set({ ready: false, booting: false, bootMsg: "" });
    }
  }, [ready]);

  const start = async () => {
    engine.unlockAudio();
    const st = useStudio.getState();
    st.set({ booting: true, bootMsg: "Session öffnen…" });
    try {
      await engine.bootStudio((msg) => useStudio.getState().set({ bootMsg: msg }));
      engine.bindState(snap);
      engine.setBpm(st.bpm);
      engine.subscribe((evt) => {
        if (evt.type === "step") {
          useStudio.getState().set({ step: evt.step, bar: evt.bar, beat: evt.beat });
        } else if (evt.type === "pad") {
          useStudio.getState().set({ flashing: evt.index });
          window.setTimeout(() => {
            const cur = useStudio.getState();
            if (cur.flashing === evt.index) cur.set({ flashing: null });
          }, 140);
        } else if (evt.type === "stopped") {
          useStudio.getState().set({ playing: false, step: 0 });
        } else if (evt.type === "recording") {
          useStudio.getState().set({ recording: evt.on });
        }
      });
      useStudio.getState().set({ bootMsg: "808 laden…" });
      const samples = await engine.loadKit("808");
      useStudio.getState().set({
        pads: useStudio.getState().pads.map((p, i) => ({
          ...p,
          name: samples[i]?.name ?? p.name,
          hasSample: Boolean(samples[i]),
          kitId: "808",
          stretch: samples[i]?.name.toLowerCase().includes("ah") ? "16n" : "off",
        })),
        ready: true,
        booting: false,
      });
    } catch (err) {
      console.error(err);
      useStudio.getState().set({ booting: false, bootMsg: "" });
      toast.error(err instanceof Error ? err.message : "Audio konnte nicht starten");
    }
  };

  if (!ready) {
    return <StartScreen onStart={start} booting={booting} bootMsg={bootMsg} />;
  }
  return <Desk />;
}

function StartScreen({
  onStart,
  booting,
  bootMsg,
}: {
  onStart: () => void;
  booting: boolean;
  bootMsg: string;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-5 text-fg">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,90,58,0.16),transparent_55%)]" />
      <div className="relative flex w-full max-w-lg flex-col items-center gap-8">
        <p className="text-base font-bold tracking-wide text-muted">Stimme · Pads · Beats</p>
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-fg sm:text-7xl">FASKA</h1>
        <p className="text-lg font-extrabold tracking-wide text-accent">SAMPLER</p>
        <p className="max-w-md text-center text-lg leading-relaxed text-muted">
          Große Pads, klare Stimme, einfache Beats. Tippen, aufnehmen, loopen.
        </p>
        <div className="grid w-56 grid-cols-4 gap-1.5">
          {Array.from({ length: 16 }, (_, i) => (
            <div
              key={i}
              className="pad-key aspect-square rounded-sm"
              data-on={i === 10 ? "true" : "false"}
            />
          ))}
        </div>
        <Button
          size="lg"
          variant="accent"
          onClick={() => {
            engine.unlockAudio();
            onStart();
          }}
          disabled={booting}
          className="min-w-48"
        >
          {booting ? bootMsg || "Laden…" : "Session starten"}
        </Button>
      </div>
    </main>
  );
}

function Desk() {
  const tab = useStudio((s) => s.tab);
  useHotkeys();
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <TransportBar />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 p-3 pb-20 lg:grid lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,300px)] lg:pb-3">
        <section className={cn("min-w-0", tab !== "voice" && "hidden lg:block")}>
          <VoicePanel />
        </section>
        <section className={cn("flex min-w-0 flex-col gap-3", tab !== "pads" && "max-lg:hidden")}>
          <PadGrid />
          <PadInspector />
          <div className="max-lg:hidden">
            <PatternRack />
          </div>
        </section>
        <section className={cn("min-w-0", tab !== "mix" && "max-lg:hidden")}>
          <SideDock />
        </section>
        <section className={cn("min-w-0 lg:hidden", tab !== "pattern" && "max-lg:hidden")}>
          <PatternRack />
        </section>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 lg:hidden">
        <ul className="grid grid-cols-4">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => useStudio.getState().set({ tab: t.id })}
                className={cn(
                  "flex h-14 w-full items-center justify-center text-base font-extrabold tracking-wide",
                  tab === t.id ? "text-accent" : "text-muted",
                )}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const st = useStudio.getState();
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }
      const key = e.key.toLowerCase();
      const idx = KIT_PAD_KEYS.findIndex((k) => k === key);
      if (idx >= 0) {
        e.preventDefault();
        engine.unlockAudio();
        engine.tapPad(idx, 0.95);
        st.set({ selectedPad: idx });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function togglePlay() {
  const st = useStudio.getState();
  engine.unlockAudio();
  if (st.playing) {
    engine.stop();
    st.set({ playing: false, step: 0 });
  } else {
    engine.play();
    st.set({ playing: true });
  }
}

function TransportBar() {
  const playing = useStudio((s) => s.playing);
  const recording = useStudio((s) => s.recording);
  const bpm = useStudio((s) => s.bpm);
  const swing = useStudio((s) => s.swing);
  const bar = useStudio((s) => s.bar);
  const beat = useStudio((s) => s.beat);
  const step = useStudio((s) => s.step);
  const click = useStudio((s) => s.click);
  const kitId = useStudio((s) => s.kitId);
  const preset = useStudio((s) => s.voicePreset);

  return (
    <header className="border-b border-border bg-surface px-3 py-2">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl font-extrabold tracking-tight">FASKA</span>
          <div className="lcd hidden h-10 min-w-[220px] items-center rounded-md px-3 text-sm leading-tight sm:flex">
            <div>
              <div>
                BPM {bpm.toString().padStart(3, "0")} · 4/4 · {String(bar + 1).padStart(2, "0")}:
                {String(beat + 1)}:{String(step + 1).padStart(2, "0")}
              </div>
              <div className="opacity-80">
                {kitId.toUpperCase()} · {preset.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="rec"
            size="icon"
            aria-label="Aufnahme"
            onClick={() => void toggleRecord()}
            className={cn(recording && "animate-pulse")}
          >
            <Circle className="size-3.5 fill-current" />
          </Button>
          <Button
            variant={playing ? "accent" : "secondary"}
            size="icon"
            aria-label={playing ? "Stop" : "Play"}
            onClick={togglePlay}
          >
            {playing ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
          </Button>
          <label className="flex items-center gap-2 pl-2 text-sm uppercase tracking-wide text-muted">
            Click
            <Switch
              checked={click}
              onCheckedChange={(on) => useStudio.getState().set({ click: on })}
              aria-label="Metronom"
            />
          </label>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto sm:min-w-[240px]">
          <span className="w-10 font-mono text-xs tabular-nums text-muted">{bpm}</span>
          <Slider
            min={60}
            max={180}
            step={1}
            value={[bpm]}
            onValueChange={([v]) => {
              const n = v ?? 120;
              useStudio.getState().set({ bpm: n });
              engine.setBpm(n);
            }}
            aria-label="Tempo"
          />
          <span className="w-8 font-mono text-sm text-subtle">BPM</span>
        </div>
        <div className="hidden items-center gap-3 md:flex md:min-w-[180px]">
          <span className="font-mono text-sm text-subtle">SWING</span>
          <Slider
            min={0}
            max={0.4}
            step={0.01}
            value={[swing]}
            onValueChange={([v]) => {
              const n = v ?? 0;
              useStudio.getState().set({ swing: n });
              engine.setSwing(n);
            }}
            aria-label="Swing"
          />
        </div>
      </div>
    </header>
  );
}

async function toggleRecord() {
  const st = useStudio.getState();
  if (st.recording) {
    const buf = engine.stopRecord();
    if (buf.duration < 0.08) {
      toast.message("Aufnahme zu kurz");
      return;
    }
    const id = uid("take");
    engine.addTakeBuffer(id, buf);
    const take = {
      id,
      name: `Spur ${st.takes.length + 1}`,
      duration: buf.duration,
      presetId: st.voicePreset,
      pitch: st.voicePitch,
      volume: 1.25,
      pan: 0,
      mute: false,
      solo: false,
      startBar: 0,
      stretch: "off" as const,
    };
    st.set({ takes: [...st.takes, take], selectedTake: id, recording: false });
    toast.success("Spur gelegt — Effekt und Lautstärke unter der Spur");
    return;
  }
  if (!st.micOn) {
    const ok = await engine.armMic();
    st.set({ micOn: ok });
    if (!ok) {
      toast.error("Mikrofon nicht verfügbar — Datei importieren oder Beispiel nutzen");
      return;
    }
  }
  engine.startRecord();
}

function VoicePanel() {
  const preset = useStudio((s) => s.voicePreset);
  const pitch = useStudio((s) => s.voicePitch);
  const melodyOn = useStudio((s) => s.melodyOn);
  const melody = useStudio((s) => s.melody);
  const scaleId = useStudio((s) => s.scaleId);
  const micOn = useStudio((s) => s.micOn);
  const monitor = useStudio((s) => s.voiceMonitor);
  const recording = useStudio((s) => s.recording);
  const takes = useStudio((s) => s.takes);
  const selectedTake = useStudio((s) => s.selectedTake);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyPreset = (id: VoicePresetId) => {
    const st = useStudio.getState();
    st.set({ voicePreset: id, melodyOn: VOICE_PRESETS.find((p) => p.id === id)?.melody ?? false });
    engine.setVoicePreset(id, st.voicePitch);
    engine.unlockAudio();
    if (st.selectedTake) {
      st.setTake(st.selectedTake, { presetId: id });
      const take = st.takes.find((t) => t.id === st.selectedTake);
      if (take) engine.previewTake(st.selectedTake, { ...take, presetId: id });
    } else {
      engine.previewDemo(id, st.voicePitch);
    }
  };

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-wide">STIMME</h2>
        <div className="flex gap-1">
          <Button
            size="iconSm"
            variant={micOn ? "accent" : "secondary"}
            aria-label="Mikrofon"
            onClick={async () => {
              const ok = await engine.armMic();
              useStudio.getState().set({ micOn: ok });
              if (!ok) toast.error("Kein Mikrofonzugriff");
            }}
          >
            {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
          </Button>
          <Button size="iconSm" variant="secondary" aria-label="Import Spur" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importAsTake(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="flex items-center justify-between text-sm uppercase tracking-wide text-muted">
        <span>Morph {pitch > 0 ? `+${pitch}` : pitch}</span>
        <label className="flex items-center gap-2">
          Monitor
          <Switch
            checked={monitor}
            onCheckedChange={(on) => {
              useStudio.getState().set({ voiceMonitor: on });
              engine.setMonitor(on);
            }}
          />
        </label>
      </div>
      <Slider
        min={-12}
        max={12}
        step={1}
        value={[pitch]}
        onValueChange={([v]) => {
          const n = v ?? 0;
          useStudio.getState().set({ voicePitch: n });
          engine.setVoicePitch(preset, n);
        }}
        aria-label="Pitch Morph"
      />

      <div className="grid grid-cols-2 gap-1.5">
        {VOICE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className={cn(
              "flex h-14 flex-col items-start justify-center rounded-xl px-3 text-left ring-1 ring-border transition-colors duration-(--motion-quick)",
              preset === p.id ? "bg-accent text-accent-fg ring-accent" : "bg-surface-2 text-fg hover:bg-surface-3",
            )}
          >
            <span className="text-xs font-medium">{p.name}</span>
            <span className={cn("font-mono text-xs uppercase", preset === p.id ? "opacity-80" : "text-subtle")}>
              {p.tag}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            engine.unlockAudio();
            engine.previewDemo(preset, pitch);
          }}
        >
          Beispiel
        </Button>
        <Button size="sm" variant={recording ? "rec" : "secondary"} className="flex-1" onClick={() => void toggleRecord()}>
          {recording ? "Stop Rec" : "Aufnehmen"}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm uppercase tracking-wide text-muted">Melodie</span>
        <Switch
          checked={melodyOn}
          onCheckedChange={(on) => useStudio.getState().set({ melodyOn: on })}
          aria-label="Melodie"
        />
      </div>
      <select
        className="h-12 rounded-xl bg-surface-2 px-3 text-base text-fg ring-1 ring-border"
        value={scaleId}
        onChange={(e) => {
          const scale = SCALES.find((s) => s.id === e.target.value);
          useStudio.getState().set({
            scaleId: e.target.value,
            melody: scale ? melodyFromScale(scale.intervals) : melody,
          });
        }}
      >
        {SCALES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-8 gap-1">
        {melody.map((n, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              const next = melody.slice();
              next[i] = (n + 1) % 13;
              useStudio.getState().set({ melody: next });
            }}
            className="h-12 rounded-xl bg-surface-2 font-mono text-base font-bold text-fg ring-1 ring-border"
          >
            {n}
          </button>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm uppercase tracking-wide text-muted">Spuren</h3>
        {takes.length === 0 ? (
          <p className="text-xs text-subtle">Noch keine Aufnahme. Rec, Beispiel oder Datei importieren.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {takes.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "flex flex-col gap-1.5 rounded-md bg-surface-2 px-2 py-2 ring-1",
                  selectedTake === t.id ? "ring-accent" : "ring-border",
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-xs"
                    onClick={() => useStudio.getState().set({ selectedTake: t.id, voicePreset: t.presetId })}
                  >
                    {t.name} · {t.duration.toFixed(1)}s
                  </button>
                  <button
                    type="button"
                    className="text-sm uppercase text-muted"
                    onClick={() => {
                      engine.unlockAudio();
                      engine.previewTake(t.id, t);
                    }}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    className="text-sm uppercase text-muted"
                    onClick={() => {
                      engine.removeTakeBuffer(t.id);
                      const next = useStudio.getState().takes.filter((x) => x.id !== t.id);
                      useStudio.getState().set({ takes: next, selectedTake: next[0]?.id ?? null });
                    }}
                  >
                    Del
                  </button>
                </div>
                <select
                  className="h-12 rounded-xl bg-surface px-3 text-base text-fg ring-1 ring-border"
                  value={t.presetId}
                  aria-label={`Effekt ${t.name}`}
                  onChange={(e) => {
                    const presetId = e.target.value as VoicePresetId;
                    useStudio.getState().setTake(t.id, { presetId });
                    useStudio.getState().set({ voicePreset: presetId, selectedTake: t.id });
                    engine.setVoicePreset(presetId, useStudio.getState().voicePitch);
                    engine.unlockAudio();
                    engine.previewTake(t.id, { ...t, presetId });
                  }}
                >
                  {VOICE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 font-mono text-sm text-muted">Vol</span>
                  <Slider
                    min={0}
                    max={2}
                    step={0.01}
                    value={[t.volume]}
                    onValueChange={([v]) => useStudio.getState().setTake(t.id, { volume: v ?? 1 })}
                    aria-label={`Lautstärke ${t.name}`}
                  />
                  <span className="w-9 shrink-0 text-right font-mono text-sm tabular-nums text-muted">
                    {Math.round(t.volume * 100)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

async function importAsTake(file: File) {
  try {
    const buf = await engine.decodeFile(file);
    const id = uid("take");
    engine.addTakeBuffer(id, buf);
    const st = useStudio.getState();
    st.set({
      takes: [
        ...st.takes,
        {
          id,
          name: file.name.replace(/\.[^.]+$/, ""),
          duration: buf.duration,
          presetId: st.voicePreset,
          pitch: st.voicePitch,
          volume: 1.25,
          pan: 0,
          mute: false,
          solo: false,
          startBar: 0,
          stretch: "off",
        },
      ],
      selectedTake: id,
    });
    toast.success("Datei als Spur geladen");
  } catch {
    toast.error("Datei konnte nicht gelesen werden");
  }
}

function PadGrid() {
  const pads = useStudio((s) => s.pads);
  const selected = useStudio((s) => s.selectedPad);
  const flashing = useStudio((s) => s.flashing);
  const fileRef = useRef<HTMLInputElement>(null);

  const onHit = (index: number, e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vel = 1 - ((e.clientY - rect.top) / rect.height) * 0.55;
    engine.unlockAudio();
    engine.tapPad(index, Math.min(1, Math.max(0.35, vel)));
    useStudio.getState().set({ selectedPad: index });
  };

  const onDrop = async (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await loadFileOnPad(index, file);
  };

  return (
    <div className="panel p-3">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">PADS</h2>
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" />
          Auf Pad
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFileOnPad(useStudio.getState().selectedPad, f);
            e.target.value = "";
          }}
        />
      </header>
      <div className="grid grid-cols-4 gap-2">
        {PAD_ROWS.flat().map((index) => {
          const pad = pads[index]!;
          const on = flashing === index || selected === index;
          return (
            <button
              key={index}
              type="button"
              onPointerDown={(e) => onHit(index, e)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => void onDrop(index, e)}
              data-on={on ? "true" : "false"}
              className="pad-key relative flex aspect-square min-h-24 flex-col items-start justify-end rounded-2xl p-3 text-left touch-manipulation"
              aria-label={pad.name}
            >
              <span className="absolute left-2 top-1.5 font-mono text-sm text-subtle">{index + 1}</span>
              <span className="absolute right-2 top-1.5 font-mono text-sm uppercase text-subtle">
                {KIT_PAD_KEYS[index]}
              </span>
              <span className="w-full truncate text-base font-extrabold text-fg">{pad.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

async function loadFileOnPad(index: number, file: File) {
  try {
    const buf = await engine.decodeFile(file);
    const name = file.name.replace(/\.[^.]+$/, "");
    engine.assignToPad(index, buf, name, "auto");
    useStudio.getState().updatePad(index, { name, hasSample: true, kitId: "custom", stretch: "auto" });
    toast.success(`${name} auf Pad ${index + 1}`);
  } catch {
    toast.error("Import fehlgeschlagen");
  }
}

function PadInspector() {
  const pad = useStudio((s) => s.pads[s.selectedPad]!);
  const selected = useStudio((s) => s.selectedPad);
  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display tracking-wide">PAD {selected + 1}</h3>
        <span className="text-xs text-muted">{pad.name}</span>
      </div>
      <label className="text-sm uppercase tracking-wide text-muted">Pitch {pad.pitch}</label>
      <Slider
        min={-12}
        max={12}
        step={1}
        value={[pad.pitch]}
        onValueChange={([v]) => useStudio.getState().updatePad(selected, { pitch: v ?? 0 })}
      />
      <label className="text-sm uppercase tracking-wide text-muted">Volume</label>
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={[pad.volume]}
        onValueChange={([v]) => useStudio.getState().updatePad(selected, { volume: v ?? 0.9 })}
      />
      <label className="text-sm uppercase tracking-wide text-muted">Fit auf Takt</label>
      <select
        className="h-12 rounded-xl bg-surface-2 px-3 text-base ring-1 ring-border"
        value={pad.stretch}
        onChange={(e) =>
          useStudio.getState().updatePad(selected, { stretch: e.target.value as StretchMode })
        }
      >
        {STRETCH_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={pad.mute ? "accent" : "secondary"}
          onClick={() => {
            const next = !pad.mute;
            useStudio.getState().updatePad(selected, { mute: next });
            engine.setPadMute(selected, next);
          }}
        >
          Mute
        </Button>
        <Button
          size="sm"
          variant={pad.solo ? "accent" : "secondary"}
          onClick={() => useStudio.getState().updatePad(selected, { solo: !pad.solo })}
        >
          Solo
        </Button>
      </div>
    </div>
  );
}

function PatternRack() {
  const patterns = useStudio((s) => s.patterns);
  const current = useStudio((s) => s.currentPattern);
  const pads = useStudio((s) => s.pads);
  const step = useStudio((s) => s.step);
  const playing = useStudio((s) => s.playing);
  const grid = patterns[current]!;

  return (
    <div className="panel p-3">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg tracking-wide">PATTERN</h2>
        <div className="flex flex-wrap gap-1">
          {PATTERN_NAMES.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => useStudio.getState().set({ currentPattern: i })}
              className={cn(
                "h-12 rounded-md px-3 text-sm font-bold ring-1 ring-border",
                current === i ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            const next = patterns.map((p, i) =>
              i === current ? p.map((row) => row.map(() => false)) : p,
            );
            useStudio.getState().set({ patterns: next });
          }}
        >
          Clear
        </Button>
      </header>
      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          {pads.map((pad, pi) => (
            <div key={pad.index} className="mb-1 flex items-center gap-1">
              <button
                type="button"
                className="w-24 shrink-0 truncate text-left text-sm font-bold text-fg"
                onClick={() => {
                  engine.tapPad(pi);
                  useStudio.getState().set({ selectedPad: pi });
                }}
              >
                {pad.name}
              </button>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {Array.from({ length: STEP_COUNT }, (_, si) => {
                  const on = Boolean(grid[pi]?.[si]);
                  return (
                    <button
                      key={si}
                      type="button"
                      onClick={() => useStudio.getState().toggleStep(pi, si)}
                      className={cn(
                        "h-11 min-w-8 rounded-md ring-1 ring-border",
                        on ? "step-on" : si % 4 === 0 ? "bg-surface-3" : "bg-surface-2",
                        playing && step === si && "step-play",
                      )}
                      aria-label={`${pad.name} Schritt ${si + 1}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SideDock() {
  return (
    <div className="flex flex-col gap-3">
      <Soundbanks />
      <SamplerPanel />
      <FxRackPanel />
      <MixerPanel />
    </div>
  );
}

function Soundbanks() {
  const kitId = useStudio((s) => s.kitId);
  const loading = useStudio((s) => s.loadingKit);
  const load = async (id: KitId) => {
    useStudio.getState().set({ loadingKit: true });
    try {
      const samples = await engine.loadKit(id);
      useStudio.getState().set({
        kitId: id,
        loadingKit: false,
        pads: useStudio.getState().pads.map((p, i) => ({
          ...p,
          name: samples[i]?.name ?? p.name,
          hasSample: Boolean(samples[i]),
          kitId: id,
          stretch: id === "vocal" ? "16n" : "off",
        })),
      });
      toast.success(`${KIT_META.find((k) => k.id === id)?.name} geladen`);
    } catch {
      useStudio.getState().set({ loadingKit: false });
      toast.error("Bank konnte nicht geladen werden");
    }
  };
  return (
    <div className="panel p-3">
      <h2 className="mb-2 font-display text-lg tracking-wide">SOUNDBANKS</h2>
      <p className="mb-3 text-xs text-subtle">Acht Kits — auf die 16 Pads legen.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {KIT_META.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={loading}
            onClick={() => void load(k.id)}
            className={cn(
              "rounded-md px-2 py-2 text-left ring-1 ring-border",
              kitId === k.id ? "bg-accent text-accent-fg" : "bg-surface-2 hover:bg-surface-3",
            )}
          >
            <div className="text-xs font-medium">{k.name}</div>
            <div className={cn("text-sm", kitId === k.id ? "opacity-80" : "text-subtle")}>{k.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SamplerPanel() {
  const duration = useStudio((s) => s.samplerDuration);
  const start = useStudio((s) => s.samplerStart);
  const end = useStudio((s) => s.samplerEnd);
  const name = useStudio((s) => s.samplerName);
  const wave = useStudio((s) => s.samplerWave);
  const selected = useStudio((s) => s.selectedPad);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (file: File) => {
    const buf = await engine.decodeFile(file);
    engine.setSampler(buf, file.name.replace(/\.[^.]+$/, ""));
    useStudio.getState().set({
      samplerName: file.name.replace(/\.[^.]+$/, ""),
      samplerDuration: buf.duration,
      samplerStart: 0,
      samplerEnd: buf.duration,
      samplerWave: engine.waveformOf(buf),
    });
  };

  return (
    <div className="panel p-3">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg tracking-wide">SAMPLER</h2>
        <Button size="iconSm" variant="secondary" onClick={() => fileRef.current?.click()} aria-label="Sample importieren">
          <Disc3 className="size-3.5" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f).catch(() => toast.error("Sample unlesbar"));
            e.target.value = "";
          }}
        />
      </header>
      <Waveform wave={wave} start={duration ? start / duration : 0} end={duration ? end / duration : 1} />
      <p className="mt-1 truncate text-xs text-muted">{name || "Kein Sample"}</p>
      {duration > 0 && (
        <>
          <label className="mt-2 text-sm uppercase tracking-wide text-muted">Start</label>
          <Slider
            min={0}
            max={duration}
            step={0.01}
            value={[start]}
            onValueChange={([v]) =>
              useStudio.getState().set({ samplerStart: Math.min(v ?? 0, end - 0.02) })
            }
          />
          <label className="text-sm uppercase tracking-wide text-muted">Ende</label>
          <Slider
            min={0}
            max={duration}
            step={0.01}
            value={[end]}
            onValueChange={([v]) =>
              useStudio.getState().set({ samplerEnd: Math.max(v ?? duration, start + 0.02) })
            }
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => engine.previewSampler(start, end)}
            >
              Preview
            </Button>
            <Button
              size="sm"
              variant="accent"
              onClick={() => {
                const sliced = engine.sliceSampler(start, end);
                if (!sliced) return;
                engine.assignToPad(selected, sliced, name || "Chop", "auto");
                useStudio.getState().updatePad(selected, {
                  name: name || "Chop",
                  hasSample: true,
                  kitId: "custom",
                  stretch: "auto",
                });
                toast.success(`Chop auf Pad ${selected + 1}`);
              }}
            >
              Auf Pad {selected + 1}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Waveform({ wave, start, end }: { wave: number[]; start: number; end: number }) {
  const d = useMemo(() => {
    if (wave.length === 0) return "";
    return wave
      .map((v, i) => {
        const x = (i / wave.length) * 100;
        const y = 18 - v * 16;
        return `${i === 0 ? "M" : "L"}${x} ${y}`;
      })
      .join(" ");
  }, [wave]);
  return (
    <div className="relative h-10 overflow-hidden rounded-sm bg-lcd-dim">
      <svg viewBox="0 0 100 36" className="h-full w-full" preserveAspectRatio="none">
        <path d={d} fill="none" stroke="currentColor" className="text-lcd" strokeWidth="0.7" />
      </svg>
      <div
        className="pointer-events-none absolute inset-y-0 bg-accent/20"
        style={{ left: `${start * 100}%`, width: `${Math.max(1, (end - start) * 100)}%` }}
      />
    </div>
  );
}

function FxRackPanel() {
  const fx = useStudio((s) => s.masterFx);
  const set = (key: keyof typeof fx, v: number) => {
    const next = { ...fx, [key]: v };
    useStudio.getState().set({ masterFx: next });
    engine.setMasterFx(next);
  };
  const knobs: { key: keyof typeof fx; label: string }[] = [
    { key: "reverb", label: "Verb" },
    { key: "delay", label: "Delay" },
    { key: "dist", label: "Drive" },
    { key: "crush", label: "Crush" },
    { key: "cutoff", label: "Filter" },
    { key: "chorus", label: "Chorus" },
    { key: "phaser", label: "Phaser" },
    { key: "gate", label: "Gate" },
  ];
  return (
    <div className="panel p-3">
      <h2 className="mb-3 font-display text-lg tracking-wide">FX</h2>
      <div className="grid grid-cols-4 gap-2">
        {knobs.map((k) => (
          <div key={k.key} className="flex flex-col items-center gap-1">
            <span className="text-sm uppercase tracking-wide text-muted">{k.label}</span>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[fx[k.key]]}
              onValueChange={([v]) => set(k.key, v ?? 0)}
              aria-label={k.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MixerPanel() {
  const takes = useStudio((s) => s.takes);
  const selected = useStudio((s) => s.selectedTake);
  const take = takes.find((t) => t.id === selected);
  if (!take) {
    return (
      <div className="panel p-3">
        <h2 className="font-display text-lg tracking-wide">MIX</h2>
        <p className="mt-2 text-xs text-subtle">Spur wählen, um Volume, Preset und Takt-Fit zu setzen.</p>
      </div>
    );
  }
  return (
    <div className="panel flex flex-col gap-3 p-3">
      <h2 className="font-display text-lg tracking-wide">MIX · {take.name}</h2>
      <label className="text-sm uppercase tracking-wide text-muted">
        Lautstärke {Math.round(take.volume * 100)}%
      </label>
      <Slider
        min={0}
        max={2}
        step={0.01}
        value={[take.volume]}
        onValueChange={([v]) => useStudio.getState().setTake(take.id, { volume: v ?? 1.25 })}
      />
      <label className="text-sm uppercase tracking-wide text-muted">Pitch {take.pitch}</label>
      <Slider
        min={-12}
        max={12}
        step={1}
        value={[take.pitch]}
        onValueChange={([v]) => useStudio.getState().setTake(take.id, { pitch: v ?? 0 })}
      />
      <label className="text-sm uppercase tracking-wide text-muted">Start-Takt</label>
      <Slider
        min={0}
        max={3}
        step={1}
        value={[take.startBar]}
        onValueChange={([v]) => useStudio.getState().setTake(take.id, { startBar: v ?? 0 })}
      />
      <label className="text-sm uppercase tracking-wide text-muted">Takt-Fit</label>
      <select
        className="h-12 rounded-xl bg-surface-2 px-3 text-base ring-1 ring-border"
        value={take.stretch}
        onChange={(e) =>
          useStudio.getState().setTake(take.id, { stretch: e.target.value as StretchMode })
        }
      >
        {STRETCH_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="text-sm uppercase tracking-wide text-muted">Effekt</label>
      <select
        className="h-12 rounded-xl bg-surface-2 px-3 text-base ring-1 ring-border"
        value={take.presetId}
        onChange={(e) => {
          const presetId = e.target.value as VoicePresetId;
          useStudio.getState().setTake(take.id, { presetId });
          useStudio.getState().set({ voicePreset: presetId });
          engine.setVoicePreset(presetId, useStudio.getState().voicePitch);
          engine.unlockAudio();
          engine.previewTake(take.id, { ...take, presetId });
        }}
      >
        {VOICE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
