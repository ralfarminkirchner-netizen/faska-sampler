import { create } from "zustand";
import {
  DEFAULT_MELODY,
  PAD_COUNT,
  type FxRack,
  type KitId,
  type PadState,
  type StretchMode,
  type TakeMeta,
  type VoicePresetId,
} from "@/audio/types";
import { factoryPatterns } from "@/audio/drums";

export type MobileTab = "voice" | "pads" | "pattern" | "mix";

const defaultPads = (): PadState[] =>
  Array.from({ length: PAD_COUNT }, (_, index) => ({
    index,
    name: `Pad ${index + 1}`,
    kitId: "808" as KitId,
    hasSample: false,
    pitch: 0,
    volume: 0.9,
    stretch: "off" as StretchMode,
    mute: false,
    solo: false,
  }));

const defaultFx = (): FxRack => ({
  reverb: 0.08,
  delay: 0,
  dist: 0,
  crush: 0,
  cutoff: 1,
  chorus: 0,
  phaser: 0,
  gate: 0,
});

export type StudioState = {
  ready: boolean;
  booting: boolean;
  bootMsg: string;
  playing: boolean;
  recording: boolean;
  micOn: boolean;
  bpm: number;
  swing: number;
  step: number;
  bar: number;
  beat: number;
  currentPattern: number;
  patterns: boolean[][][];
  pads: PadState[];
  selectedPad: number;
  kitId: KitId;
  flashing: number | null;
  voicePreset: VoicePresetId;
  voicePitch: number;
  voiceMonitor: boolean;
  melodyOn: boolean;
  melody: number[];
  scaleId: string;
  takes: TakeMeta[];
  selectedTake: string | null;
  samplerDuration: number;
  samplerStart: number;
  samplerEnd: number;
  samplerName: string;
  samplerWave: number[];
  masterFx: FxRack;
  click: boolean;
  tab: MobileTab;
  loadingKit: boolean;
  set: (partial: Partial<StudioState>) => void;
  toggleStep: (pad: number, step: number) => void;
  updatePad: (index: number, partial: Partial<PadState>) => void;
  setTake: (id: string, partial: Partial<TakeMeta>) => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  ready: false,
  booting: false,
  bootMsg: "",
  playing: false,
  recording: false,
  micOn: false,
  bpm: 120,
  swing: 0,
  step: 0,
  bar: 0,
  beat: 0,
  currentPattern: 0,
  patterns: factoryPatterns(),
  pads: defaultPads(),
  selectedPad: 0,
  kitId: "808",
  flashing: null,
  voicePreset: "natural",
  voicePitch: 0,
  voiceMonitor: true,
  melodyOn: false,
  melody: DEFAULT_MELODY,
  scaleId: "minor-pent",
  takes: [],
  selectedTake: null,
  samplerDuration: 0,
  samplerStart: 0,
  samplerEnd: 1,
  samplerName: "",
  samplerWave: [],
  masterFx: defaultFx(),
  click: false,
  tab: "pads",
  loadingKit: false,
  set: (partial) => set(partial),
  toggleStep: (pad, step) => {
    const patterns = get().patterns.map((p) => p.map((row) => row.slice()));
    const cur = patterns[get().currentPattern];
    if (!cur?.[pad]) return;
    cur[pad]![step] = !cur[pad]![step];
    set({ patterns });
  },
  updatePad: (index, partial) => {
    set({
      pads: get().pads.map((p) => (p.index === index ? { ...p, ...partial } : p)),
    });
  },
  setTake: (id, partial) => {
    set({
      takes: get().takes.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    });
  },
}));
