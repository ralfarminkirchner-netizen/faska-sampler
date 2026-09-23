export const PAD_COUNT = 16;
export const STEP_COUNT = 16;
export const PATTERN_COUNT = 8;
export const KIT_PAD_KEYS = ["z", "x", "c", "v", "a", "s", "d", "f", "q", "w", "e", "r", "1", "2", "3", "4"] as const;

export type StretchMode = "off" | "16n" | "8n" | "4n" | "2n" | "1m" | "2m" | "auto";

export type KitId =
  | "808"
  | "909"
  | "acoustic"
  | "trap"
  | "perc"
  | "fx"
  | "vocal"
  | "lofi";

export type VoicePresetId =
  | "natural"
  | "deep"
  | "helium"
  | "robot"
  | "monster"
  | "alien"
  | "radio"
  | "phone"
  | "choir"
  | "melody"
  | "crazy"
  | "whisper"
  | "chipmunk"
  | "giant"
  | "stutter"
  | "space";

export type PadState = {
  index: number;
  name: string;
  kitId: KitId | "custom";
  hasSample: boolean;
  pitch: number;
  volume: number;
  stretch: StretchMode;
  mute: boolean;
  solo: boolean;
};

export type TakeMeta = {
  id: string;
  name: string;
  duration: number;
  presetId: VoicePresetId;
  pitch: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  startBar: number;
  stretch: StretchMode;
};

export type VoicePreset = {
  id: VoicePresetId;
  name: string;
  tag: string;
  pitch: number;
  crush: number;
  dist: number;
  lpf: number;
  hpf: number;
  reverb: number;
  delay: number;
  chorus: number;
  phaser: number;
  freqShift: number;
  cheby: number;
  tremolo: number;
  melody: boolean;
};

export type FxRack = {
  reverb: number;
  delay: number;
  dist: number;
  crush: number;
  cutoff: number;
  chorus: number;
  phaser: number;
  gate: number;
};

export type EngineEvent =
  | { type: "step"; step: number; bar: number; beat: number }
  | { type: "pad"; index: number; velocity: number }
  | { type: "stopped" }
  | { type: "recording"; on: boolean };

export const STRETCH_OPTIONS: { id: StretchMode; label: string }[] = [
  { id: "off", label: "Original" },
  { id: "auto", label: "Auto-Takt" },
  { id: "16n", label: "1/16" },
  { id: "8n", label: "1/8" },
  { id: "4n", label: "1/4" },
  { id: "2n", label: "1/2" },
  { id: "1m", label: "1 Takt" },
  { id: "2m", label: "2 Takte" },
];

export const VOICE_PRESETS: VoicePreset[] = [
  { id: "natural", name: "Natürlich", tag: "Dry", pitch: 0, crush: 0, dist: 0, lpf: 18000, hpf: 40, reverb: 0.04, delay: 0, chorus: 0, phaser: 0, freqShift: 0, cheby: 0, tremolo: 0, melody: false },
  { id: "deep", name: "Tief", tag: "Bass", pitch: -7, crush: 0, dist: 0.08, lpf: 4200, hpf: 40, reverb: 0.12, delay: 0, chorus: 0.1, phaser: 0, freqShift: 0, cheby: 0.2, tremolo: 0, melody: false },
  { id: "helium", name: "Helium", tag: "High", pitch: 9, crush: 0, dist: 0, lpf: 16000, hpf: 120, reverb: 0.08, delay: 0, chorus: 0.15, phaser: 0, freqShift: 0, cheby: 0, tremolo: 0, melody: false },
  { id: "robot", name: "Roboter", tag: "FX", pitch: 0, crush: 0.55, dist: 0.2, lpf: 5000, hpf: 200, reverb: 0.06, delay: 0.08, chorus: 0, phaser: 0.15, freqShift: 28, cheby: 0.6, tremolo: 0, melody: false },
  { id: "monster", name: "Monster", tag: "FX", pitch: -10, crush: 0.12, dist: 0.72, lpf: 900, hpf: 40, reverb: 0.28, delay: 0.05, chorus: 0, phaser: 0, freqShift: 0, cheby: 0.8, tremolo: 0, melody: false },
  { id: "alien", name: "Alien", tag: "FX", pitch: 5, crush: 0.18, dist: 0.15, lpf: 8000, hpf: 180, reverb: 0.22, delay: 0.28, chorus: 0.2, phaser: 0.7, freqShift: 160, cheby: 0.3, tremolo: 0, melody: false },
  { id: "radio", name: "Radio", tag: "LoFi", pitch: 0, crush: 0.28, dist: 0.35, lpf: 2800, hpf: 420, reverb: 0.04, delay: 0, chorus: 0, phaser: 0, freqShift: 0, cheby: 0.4, tremolo: 0, melody: false },
  { id: "phone", name: "Telefon", tag: "LoFi", pitch: 1, crush: 0.22, dist: 0.18, lpf: 3400, hpf: 300, reverb: 0, delay: 0, chorus: 0, phaser: 0, freqShift: 0, cheby: 0.2, tremolo: 0, melody: false },
  { id: "choir", name: "Chor", tag: "Air", pitch: 0, crush: 0, dist: 0, lpf: 12000, hpf: 80, reverb: 0.48, delay: 0.12, chorus: 0.95, phaser: 0.1, freqShift: 0, cheby: 0, tremolo: 0, melody: false },
  { id: "melody", name: "Melodie", tag: "Tune", pitch: 0, crush: 0, dist: 0, lpf: 10000, hpf: 80, reverb: 0.18, delay: 0.1, chorus: 0.4, phaser: 0, freqShift: 0, cheby: 0, tremolo: 0, melody: true },
  { id: "crazy", name: "Verrückt", tag: "Wild", pitch: 4, crush: 0.4, dist: 0.35, lpf: 7000, hpf: 60, reverb: 0.2, delay: 0.42, chorus: 0.3, phaser: 0.85, freqShift: 90, cheby: 0.5, tremolo: 0.35, melody: false },
  { id: "whisper", name: "Flüstern", tag: "Air", pitch: 2, crush: 0.08, dist: 0, lpf: 6000, hpf: 900, reverb: 0.38, delay: 0.08, chorus: 0.2, phaser: 0, freqShift: 0, cheby: 0, tremolo: 0, melody: false },
  { id: "chipmunk", name: "Chipmunk", tag: "High", pitch: 12, crush: 0, dist: 0.05, lpf: 16000, hpf: 200, reverb: 0.06, delay: 0, chorus: 0.1, phaser: 0, freqShift: 0, cheby: 0, tremolo: 0, melody: false },
  { id: "giant", name: "Riese", tag: "Bass", pitch: -12, crush: 0, dist: 0.22, lpf: 1400, hpf: 30, reverb: 0.5, delay: 0.1, chorus: 0, phaser: 0, freqShift: 0, cheby: 0.35, tremolo: 0, melody: false },
  { id: "stutter", name: "Stutter", tag: "Wild", pitch: 0, crush: 0.1, dist: 0.1, lpf: 12000, hpf: 80, reverb: 0.08, delay: 0.18, chorus: 0, phaser: 0, freqShift: 0, cheby: 0, tremolo: 0.9, melody: false },
  { id: "space", name: "Weltraum", tag: "Air", pitch: -2, crush: 0, dist: 0, lpf: 9000, hpf: 60, reverb: 0.62, delay: 0.48, chorus: 0.25, phaser: 0.2, freqShift: 12, cheby: 0, tremolo: 0, melody: false },
];

export const SCALES: { id: string; name: string; intervals: number[] }[] = [
  { id: "minor-pent", name: "Moll-Pentatonik", intervals: [0, 3, 5, 7, 10] },
  { id: "major-pent", name: "Dur-Pentatonik", intervals: [0, 2, 4, 7, 9] },
  { id: "minor", name: "Nat. Moll", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "major", name: "Dur", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "blues", name: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
  { id: "dorian", name: "Dorisch", intervals: [0, 2, 3, 5, 7, 9, 10] },
];

export function melodyFromScale(intervals: number[], bars = 16): number[] {
  const notes: number[] = [];
  const up = [...intervals, 12];
  const down = [...intervals].reverse();
  const seq = [...up, ...down.slice(1, -1)];
  for (let i = 0; i < bars; i++) notes.push(seq[i % seq.length] ?? 0);
  return notes;
}

export const DEFAULT_MELODY = melodyFromScale([0, 3, 5, 7, 10]);
