import {
  DEFAULT_MELODY,
  PAD_COUNT,
  STEP_COUNT,
  VOICE_PRESETS,
  type EngineEvent,
  type FxRack,
  type KitId,
  type PadState,
  type StretchMode,
  type TakeMeta,
  type VoicePresetId,
} from "./types";
import {
  generateClick,
  generateDemoVoice,
  generateKit,
  setRenderSampleRate,
  sliceBuffer,
  type KitSample,
} from "./drums";

type ToneNs = typeof import("tone");

export type StudioSnapshot = {
  patterns: boolean[][][];
  currentPattern: number;
  pads: PadState[];
  melodyOn: boolean;
  melody: number[];
  voicePitch: number;
  voicePreset: VoicePresetId;
  click: boolean;
  takes: TakeMeta[];
};

type Listener = (e: EngineEvent) => void;

let T: ToneNs | null = null;
let started = false;
const listeners = new Set<Listener>();
let getSnap: () => StudioSnapshot = () => ({
  patterns: [],
  currentPattern: 0,
  pads: [],
  melodyOn: false,
  melody: DEFAULT_MELODY,
  voicePitch: 0,
  voicePreset: "natural",
  click: false,
  takes: [],
});

let master: import("tone").Channel;
let drumBus: import("tone").Channel;
let voiceBus: import("tone").Channel;
let takeBus: import("tone").Channel;
let limiter: import("tone").Limiter;
let seq: import("tone").Sequence<number> | null = null;

let hpf: import("tone").Filter;
let lpf: import("tone").Filter;
let pitchShift: import("tone").PitchShift;
let dist: import("tone").Distortion;
let crush: import("tone").Distortion;
let freqShift: import("tone").FrequencyShifter;
let cheby: import("tone").Chebyshev;
let chorus: import("tone").Chorus;
let phaser: import("tone").Phaser;
let delay: import("tone").FeedbackDelay;
let reverb: import("tone").Reverb;
let tremolo: import("tone").Tremolo;
let voiceIn: import("tone").Gain;
let monitorGain: import("tone").Gain;
let mic: import("tone").UserMedia | null = null;
let micOpen = false;

let recNode: ScriptProcessorNode | null = null;
let recChunks: Float32Array[] = [];
let recording = false;

let demoBuf: AudioBuffer | null = null;
let samplerBuf: AudioBuffer | null = null;
let samplerName = "Sample";
const takeBufs = new Map<string, AudioBuffer>();
const padBufs: Array<AudioBuffer | null> = Array.from({ length: PAD_COUNT }, () => null);
const padPlayers: Array<import("tone").Player | null> = Array.from({ length: PAD_COUNT }, () => null);
const padGrains: Array<import("tone").GrainPlayer | null> = Array.from({ length: PAD_COUNT }, () => null);
const padCh: Array<import("tone").Channel | null> = Array.from({ length: PAD_COUNT }, () => null);

let clickHiBuf: AudioBuffer | null = null;
let clickLoBuf: AudioBuffer | null = null;

let masterReverb: import("tone").Reverb;
let masterDelay: import("tone").FeedbackDelay;
let masterDist: import("tone").Distortion;
let masterCrush: import("tone").Distortion;
let masterFilter: import("tone").Filter;
let masterChorus: import("tone").Chorus;
let masterPhaser: import("tone").Phaser;
let masterTrem: import("tone").Tremolo;

let rawCtx: AudioContext | null = null;
let nativeOut: GainNode | null = null;
let nativeFilter: BiquadFilterNode | null = null;
let nativeDelay: DelayNode | null = null;
let nativeDelayGain: GainNode | null = null;
let nativeDist: WaveShaperNode | null = null;
let nativeComp: DynamicsCompressorNode | null = null;

function AudioContextCtor(): typeof AudioContext {
  return window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

/** Must run inside a click/tap, before any await. */
export function isStarted() {
  return started;
}

export function unlockAudio(): AudioContext {
  const AC = AudioContextCtor();
  if (!rawCtx || rawCtx.state === "closed") {
    rawCtx = new AC({ latencyHint: "interactive" });
  }
  if (rawCtx.state === "suspended") {
    void rawCtx.resume();
  }
  return rawCtx;
}

function identityCurve() {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = (i / (n - 1)) * 2 - 1;
  return curve;
}

function driveCurve(amount: number) {
  const n = 256;
  const curve = new Float32Array(n);
  const k = 1 + amount * 24;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k);
  }
  return curve;
}

function setupNativeGraph(raw: AudioContext) {
  if (nativeOut) return;
  nativeOut = raw.createGain();
  nativeOut.gain.value = 1;
  nativeFilter = raw.createBiquadFilter();
  nativeFilter.type = "lowpass";
  nativeFilter.frequency.value = 18000;
  nativeDist = raw.createWaveShaper();
  nativeDist.curve = identityCurve();
  nativeDist.oversample = "2x";
  nativeComp = raw.createDynamicsCompressor();
  nativeComp.threshold.value = -18;
  nativeComp.ratio.value = 2.2;
  nativeComp.knee.value = 12;
  nativeDelay = raw.createDelay(1);
  nativeDelay.delayTime.value = 0.22;
  nativeDelayGain = raw.createGain();
  nativeDelayGain.gain.value = 0;
  nativeOut.connect(nativeFilter);
  nativeFilter.connect(nativeDist);
  nativeDist.connect(nativeComp);
  nativeComp.connect(raw.destination);
  nativeFilter.connect(nativeDelay);
  nativeDelay.connect(nativeDelayGain);
  nativeDelayGain.connect(nativeComp);
}

function fireNative(buffer: AudioBuffer, when: number, rate: number, gainVal: number) {
  const raw = rawCtx;
  if (!raw || !nativeOut || !buffer) return;
  if (raw.state === "suspended") void raw.resume();
  const src = raw.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.max(0.05, Math.min(8, rate));
  const g = raw.createGain();
  g.gain.value = Math.max(0, Math.min(1.5, gainVal));
  src.connect(g);
  g.connect(nativeOut);
  const t = Math.max(when, raw.currentTime + 0.002);
  try {
    src.start(t);
  } catch {
    try {
      src.start();
    } catch {
      /* */
    }
  }
}

function beep() {
  const raw = rawCtx;
  if (!raw || !nativeOut) return;
  const osc = raw.createOscillator();
  const g = raw.createGain();
  osc.frequency.value = 880;
  osc.type = "sine";
  g.gain.setValueAtTime(0.0001, raw.currentTime);
  g.gain.exponentialRampToValueAtTime(0.18, raw.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, raw.currentTime + 0.09);
  osc.connect(g);
  g.connect(nativeOut);
  osc.start();
  osc.stop(raw.currentTime + 0.1);
}

type VoiceChain = {
  input: GainNode;
  output: GainNode;
  apply: (p: ReturnType<typeof presetById>) => void;
  start: (when?: number) => void;
  dispose: () => void;
};

let liveChain: VoiceChain | null = null;
let liveMonitorOn = true;
let micSource: MediaStreamAudioSourceNode | null = null;
let recSink: GainNode | null = null;

function makeVoiceChain(raw: AudioContext, persistent: boolean): VoiceChain {
  const input = raw.createGain();
  input.gain.value = 1;
  const hpfN = raw.createBiquadFilter();
  hpfN.type = "highpass";
  hpfN.frequency.value = 40;
  const lpfN = raw.createBiquadFilter();
  lpfN.type = "lowpass";
  lpfN.frequency.value = 18000;
  const shaper = raw.createWaveShaper();
  shaper.curve = identityCurve();
  shaper.oversample = "2x";
  const dry = raw.createGain();
  dry.gain.value = 1;
  const delayN = raw.createDelay(1.2);
  delayN.delayTime.value = 0.18;
  const delayG = raw.createGain();
  delayG.gain.value = 0;
  const fb = raw.createGain();
  fb.gain.value = 0;
  const rev = raw.createDelay(0.8);
  rev.delayTime.value = 0.09;
  const rev2 = raw.createDelay(0.8);
  rev2.delayTime.value = 0.17;
  const revG = raw.createGain();
  revG.gain.value = 0;
  const chorusN = raw.createDelay(0.08);
  chorusN.delayTime.value = 0.016;
  const chorusG = raw.createGain();
  chorusG.gain.value = 0;
  const lfo = raw.createOscillator();
  lfo.frequency.value = 1.6;
  const lfoG = raw.createGain();
  lfoG.gain.value = 0.0035;
  const ap = raw.createBiquadFilter();
  ap.type = "allpass";
  ap.frequency.value = 700;
  ap.Q.value = 5;
  const apG = raw.createGain();
  apG.gain.value = 0;
  const ringOsc = raw.createOscillator();
  ringOsc.frequency.value = 30;
  const ring = raw.createGain();
  ring.gain.value = 0;
  const ringMix = raw.createGain();
  ringMix.gain.value = 0;
  const trem = raw.createGain();
  trem.gain.value = 1;
  const tremLfo = raw.createOscillator();
  tremLfo.type = "square";
  tremLfo.frequency.value = 8;
  const tremDepth = raw.createGain();
  tremDepth.gain.value = 0;
  const output = raw.createGain();
  output.gain.value = 1;

  input.connect(hpfN);
  hpfN.connect(lpfN);
  lpfN.connect(shaper);
  shaper.connect(trem);
  trem.connect(dry);
  dry.connect(output);
  shaper.connect(delayN);
  delayN.connect(delayG);
  delayN.connect(fb);
  fb.connect(delayN);
  delayG.connect(output);
  shaper.connect(rev);
  rev.connect(rev2);
  rev2.connect(revG);
  revG.connect(output);
  shaper.connect(chorusN);
  chorusN.connect(chorusG);
  chorusG.connect(output);
  lfo.connect(lfoG);
  lfoG.connect(chorusN.delayTime);
  shaper.connect(ap);
  ap.connect(apG);
  apG.connect(output);
  shaper.connect(ring);
  ringOsc.connect(ring.gain);
  ring.connect(ringMix);
  ringMix.connect(output);
  tremLfo.connect(tremDepth);
  tremDepth.connect(trem.gain);

  let startedLfos = false;
  const start = (when?: number) => {
    if (startedLfos) return;
    startedLfos = true;
    const t = Math.max(raw.currentTime, when ?? raw.currentTime);
    try {
      lfo.start(t);
      ringOsc.start(t);
      tremLfo.start(t);
    } catch {
      /* already started */
    }
  };
  if (persistent) start();

  const apply = (p: ReturnType<typeof presetById>) => {
    hpfN.frequency.value = p.hpf;
    lpfN.frequency.value = p.lpf;
    const drive = Math.max(p.dist, p.crush * 0.75, p.cheby * 0.55);
    shaper.curve = drive > 0.02 ? driveCurve(Math.min(1, drive)) : identityCurve();
    delayN.delayTime.value = 0.12 + p.delay * 0.38;
    delayG.gain.value = p.delay;
    fb.gain.value = Math.min(0.52, p.delay * 0.65);
    revG.gain.value = p.reverb * 0.95;
    chorusG.gain.value = p.chorus * 0.75;
    ap.frequency.value = 280 + p.phaser * 1400;
    apG.gain.value = p.phaser * 0.85;
    ringOsc.frequency.value = Math.max(8, Math.abs(p.freqShift));
    ringMix.gain.value = Math.abs(p.freqShift) > 1 ? Math.min(0.7, 0.18 + Math.abs(p.freqShift) / 220) : 0;
    tremLfo.frequency.value = p.tremolo > 0.5 ? 10 : 6;
    tremLfo.type = p.tremolo > 0.5 ? "square" : "sine";
    tremDepth.gain.value = p.tremolo * 0.45;
    const makeup = 1.15 + (p.hpf > 250 ? 0.25 : 0) + (p.lpf < 2500 ? 0.35 : 0) + drive * 0.15;
    dry.gain.value = makeup;
  };

  const dispose = () => {
    try {
      if (!persistent) {
        lfo.stop();
        ringOsc.stop();
        tremLfo.stop();
      }
    } catch {
      /* */
    }
    for (const n of [
      input, hpfN, lpfN, shaper, dry, delayN, delayG, fb, rev, rev2, revG, chorusN, chorusG, lfo, lfoG, ap, apG, ringOsc, ring, ringMix, trem, tremLfo, tremDepth, output,
    ]) {
      try {
        n.disconnect();
      } catch {
        /* */
      }
    }
  };

  return { input, output, apply, start, dispose };
}

function normalizeBuffer(buffer: AudioBuffer, peak = 0.9): AudioBuffer {
  const raw = rawCtx ?? (need().getContext().rawContext as AudioContext);
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i] ?? 0));
  }
  const out = raw.createBuffer(buffer.numberOfChannels, Math.max(1, buffer.length), buffer.sampleRate);
  const g = max > 1e-4 ? peak / max : 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = (src[i] ?? 0) * g;
  }
  return out;
}

function fireVoice(
  buffer: AudioBuffer,
  when: number,
  opts: { presetId: VoicePresetId; pitch: number; volume: number; extraPitch?: number; rateMul?: number },
) {
  const raw = rawCtx;
  if (!raw || !nativeOut || !buffer) return;
  if (raw.state === "suspended") void raw.resume();
  const p = presetById(opts.presetId);
  const chain = makeVoiceChain(raw, false);
  chain.apply(p);
  const src = raw.createBufferSource();
  src.buffer = buffer;
  const semis = p.pitch + opts.pitch + (opts.extraPitch ?? 0);
  src.playbackRate.value = Math.max(0.2, Math.min(6, (opts.rateMul ?? 1) * 2 ** (semis / 12)));
  chain.output.gain.value = Math.max(0, Math.min(6, opts.volume * 1.35));
  src.connect(chain.input);
  chain.output.connect(nativeOut);
  const t = Math.max(when, raw.currentTime + 0.002);
  chain.start(t);
  try {
    src.start(t);
  } catch {
    try {
      src.start();
    } catch {
      /* */
    }
  }
  const life = buffer.duration / Math.max(0.2, src.playbackRate.value) + 2.2;
  window.setTimeout(() => {
    try {
      src.stop();
    } catch {
      /* */
    }
    chain.dispose();
  }, life * 1000);
}

function setupLiveVoice(raw: AudioContext) {
  if (liveChain) return;
  liveChain = makeVoiceChain(raw, true);
  liveChain.output.gain.value = liveMonitorOn ? 0.95 : 0;
  liveChain.output.connect(nativeOut!);
  liveChain.apply(presetById(getSnap().voicePreset));
}

function setupRecording(raw: AudioContext) {
  if (recNode) return;
  recSink = raw.createGain();
  recSink.gain.value = 0;
  recNode = raw.createScriptProcessor(2048, 1, 1);
  recNode.onaudioprocess = (ev) => {
    if (!recording) return;
    recChunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
  };
  recNode.connect(recSink);
  recSink.connect(raw.destination);
  liveChain?.input.connect(recNode);
}

function adoptBuffer(buffer: AudioBuffer): AudioBuffer {
  const raw = need().getContext().rawContext as AudioContext;
  if (buffer.sampleRate === raw.sampleRate) {
    const out = raw.createBuffer(buffer.numberOfChannels, buffer.length, raw.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      out.copyToChannel(buffer.getChannelData(c), c);
    }
    return out;
  }
  const destLen = Math.max(1, Math.round(buffer.length * (raw.sampleRate / buffer.sampleRate)));
  const out = raw.createBuffer(buffer.numberOfChannels, destLen, raw.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    const ratio = src.length / destLen;
    for (let i = 0; i < destLen; i++) {
      dst[i] = src[Math.min(src.length - 1, Math.floor(i * ratio))] ?? 0;
    }
  }
  return out;
}

function emit(e: EngineEvent) {
  listeners.forEach((fn) => fn(e));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bindState(fn: () => StudioSnapshot) {
  getSnap = fn;
}

function need(): ToneNs {
  if (!T) throw new Error("Audio engine not started");
  return T;
}

function stretchTarget(mode: StretchMode, duration: number, bpm: number): number | null {
  const bar = (60 / bpm) * 4;
  switch (mode) {
    case "off":
      return null;
    case "16n":
      return bar / 16;
    case "8n":
      return bar / 8;
    case "4n":
      return bar / 4;
    case "2n":
      return bar / 2;
    case "1m":
      return bar;
    case "2m":
      return bar * 2;
    case "auto":
      if (duration < bar / 8) return null;
      return Math.max(1, Math.round(duration / bar)) * bar;
    default:
      return null;
  }
}

function presetById(id: VoicePresetId) {
  return VOICE_PRESETS.find((p) => p.id === id) ?? VOICE_PRESETS[0]!;
}

function applyVoiceNodes(id: VoicePresetId, extraPitch: number) {
  const p = presetById(id);
  const tone = need();
  pitchShift.pitch = p.pitch + extraPitch;
  dist.distortion = p.dist;
  dist.wet.value = p.dist > 0.02 ? 1 : 0;
  crush.distortion = p.crush;
  crush.wet.value = p.crush;
  freqShift.frequency.value = p.freqShift;
  freqShift.wet.value = Math.abs(p.freqShift) > 1 ? 1 : 0;
  cheby.order = Math.max(1, Math.round(1 + p.cheby * 7));
  cheby.wet.value = p.cheby;
  chorus.wet.value = p.chorus;
  phaser.wet.value = p.phaser;
  delay.wet.value = p.delay;
  reverb.wet.value = p.reverb;
  lpf.frequency.value = p.lpf;
  hpf.frequency.value = p.hpf;
  tremolo.wet.value = p.tremolo;
  tremolo.frequency.value = p.tremolo > 0.5 ? Number(tone.Time("16n").toFrequency()) : 6;
  liveChain?.apply(p);
}

export async function bootStudio(onStatus?: (msg: string) => void): Promise<void> {
  const raw = unlockAudio();
  await raw.resume();
  if (started) return;
  onStatus?.("Audio-Kontext…");
  T = await import("tone");
  const tone = T;
  try {
    if (tone.getContext().rawContext !== raw) {
      tone.setContext(new tone.Context({ context: raw, lookAhead: 0.06 }));
    }
  } catch {
    /* context already live */
  }
  await tone.start();
  await raw.resume();
  setRenderSampleRate(raw.sampleRate || 44100);
  setupNativeGraph(raw);
  setupLiveVoice(raw);
  setupRecording(raw);

  master = new tone.Channel({ volume: -2 });
  drumBus = new tone.Channel({ volume: 0 });
  voiceBus = new tone.Channel({ volume: 0 });
  takeBus = new tone.Channel({ volume: 0 });
  limiter = new tone.Limiter(-1.2);
  const comp = new tone.Compressor(-18, 3);

  masterReverb = new tone.Reverb({ decay: 2.2, wet: 0.08 });
  await masterReverb.generate();
  masterDelay = new tone.FeedbackDelay("8n", 0.28);
  masterDelay.wet.value = 0;
  masterDist = new tone.Distortion(0);
  masterDist.wet.value = 0;
  masterCrush = new tone.Distortion(0);
  masterCrush.wet.value = 0;
  masterFilter = new tone.Filter(18000, "lowpass");
  masterChorus = new tone.Chorus(1.4, 2.5, 0.3).start();
  masterChorus.wet.value = 0;
  masterPhaser = new tone.Phaser({ frequency: 0.4, octaves: 3, baseFrequency: 300 });
  masterPhaser.wet.value = 0;
  masterTrem = new tone.Tremolo("8n", 0).start();
  masterTrem.wet.value = 0;

  master.chain(
    masterFilter,
    masterDist,
    masterCrush,
    masterChorus,
    masterPhaser,
    masterDelay,
    masterReverb,
    masterTrem,
    comp,
    limiter,
    tone.getDestination(),
  );
  drumBus.connect(master);
  voiceBus.connect(master);
  takeBus.connect(master);

  voiceIn = new tone.Gain(1);
  monitorGain = new tone.Gain(1);
  hpf = new tone.Filter(40, "highpass");
  lpf = new tone.Filter(18000, "lowpass");
  pitchShift = new tone.PitchShift({ pitch: 0, windowSize: 0.08 });
  dist = new tone.Distortion(0);
  dist.wet.value = 0;
  crush = new tone.Distortion(0);
  crush.wet.value = 0;
  freqShift = new tone.FrequencyShifter(0);
  freqShift.wet.value = 0;
  cheby = new tone.Chebyshev(1);
  cheby.wet.value = 0;
  chorus = new tone.Chorus(1.8, 3.2, 0.4).start();
  chorus.wet.value = 0;
  phaser = new tone.Phaser();
  phaser.wet.value = 0;
  delay = new tone.FeedbackDelay("8n", 0.32);
  delay.wet.value = 0;
  reverb = new tone.Reverb({ decay: 2.6, wet: 0.05 });
  await reverb.generate();
  tremolo = new tone.Tremolo("16n", 0.8).start();
  tremolo.wet.value = 0;

  voiceIn.chain(
    hpf,
    lpf,
    pitchShift,
    dist,
    crush,
    freqShift,
    cheby,
    chorus,
    phaser,
    delay,
    reverb,
    tremolo,
    monitorGain,
    voiceBus,
  );

  for (let i = 0; i < PAD_COUNT; i++) {
    const ch = new tone.Channel({ volume: 0 });
    ch.connect(drumBus);
    padCh[i] = ch;
  }

  onStatus?.("Metronom…");
  clickHiBuf = adoptBuffer(await generateClick(true));
  clickLoBuf = adoptBuffer(await generateClick(false));

  onStatus?.("Stimme…");
  demoBuf = adoptBuffer(await generateDemoVoice());

  const steps = Array.from({ length: STEP_COUNT }, (_, i) => i);
  seq = new tone.Sequence(
    (time, step) => {
      const snap = getSnap();
      const pat = snap.patterns[snap.currentPattern];
      const anySolo = snap.pads.some((p) => p.solo);
      if (pat) {
        for (let i = 0; i < PAD_COUNT; i++) {
          if (!pat[i]?.[step]) continue;
          const pad = snap.pads[i];
          if (!pad || pad.mute) continue;
          if (anySolo && !pad.solo) continue;
          triggerPadAt(i, time, 0.92, pad);
        }
      }
      const preset = presetById(snap.voicePreset);
      if (snap.melodyOn || preset.melody) {
        const note = snap.melody[step] ?? 0;
        pitchShift.pitch = preset.pitch + snap.voicePitch + note;
      }
      if (snap.click && step % 4 === 0) {
        const buf = step === 0 ? clickHiBuf : clickLoBuf;
        if (buf) fireNative(buf, time, 1, step === 0 ? 0.45 : 0.28);
      }
      if (step === 0) {
        const bpm = tone.getTransport().bpm.value;
        const barSec = (60 / bpm) * 4;
        const bar = Math.floor(tone.getTransport().getTicksAtTime(time) / tone.getTransport().PPQ / 4);
        const barInLoop = ((bar % 4) + 4) % 4;
        const takeSolo = snap.takes.some((t) => t.solo);
        for (const take of snap.takes) {
          if (take.mute) continue;
          if (takeSolo && !take.solo) continue;
          if (take.startBar % 4 !== barInLoop) continue;
          playTakeBuffer(take, time, bpm, barSec);
        }
      }
      tone.Draw.schedule(() => {
        const pos = String(tone.getTransport().position);
        const [b, be] = pos.split(":");
        emit({
          type: "step",
          step,
          bar: Number(b ?? 0),
          beat: Number(be ?? 0),
        });
      }, time);
    },
    steps,
    "16n",
  );
  seq.start(0);
  tone.getTransport().loop = true;
  tone.getTransport().loopStart = 0;
  tone.getTransport().loopEnd = "4m";
  tone.getTransport().swingSubdivision = "16n";

  applyVoiceNodes("natural", 0);
  beep();
  started = true;
}

export function setBpm(n: number) {
  need().getTransport().bpm.value = n;
}

export function setSwing(n: number) {
  need().getTransport().swing = n;
}

export function play() {
  const tone = need();
  unlockAudio();
  if (tone.getTransport().state === "started") return;
  tone.getTransport().start();
}

export function stop() {
  const tone = need();
  tone.getTransport().stop();
  tone.getTransport().position = 0;
  emit({ type: "stopped" });
}

function attachPadBuffer(index: number, buffer: AudioBuffer) {
  const live = adoptBuffer(buffer);
  padBufs[index] = live;
  try {
    padPlayers[index]?.dispose();
  } catch {
    /* */
  }
  padPlayers[index] = null;
  padGrains[index] = null;
}

function triggerPadAt(index: number, time: number, velocity: number, pad?: PadState) {
  const buf = padBufs[index];
  if (!buf) return;
  const snapPad = pad ?? getSnap().pads[index];
  const bpm = T ? T.getTransport().bpm.value : 120;
  const pitch = snapPad?.pitch ?? 0;
  const target = stretchTarget(snapPad?.stretch ?? "off", buf.duration, bpm);
  const rate = 2 ** (pitch / 12);
  const playbackRate = target ? (buf.duration / Math.max(0.02, target)) * rate : rate;
  const gainVal = (snapPad?.volume ?? 0.9) * velocity;
  fireNative(buf, time, playbackRate, gainVal);
  if (T) {
    T.Draw.schedule(() => emit({ type: "pad", index, velocity }), time);
  } else {
    emit({ type: "pad", index, velocity });
  }
}

export function tapPad(index: number, velocity = 1) {
  if (!started) return;
  const raw = unlockAudio();
  triggerPadAt(index, raw.currentTime + 0.01, velocity);
}

export async function loadKit(id: KitId): Promise<KitSample[]> {
  const samples = await generateKit(id);
  for (let i = 0; i < PAD_COUNT; i++) {
    const sample = samples[i];
    if (!sample) continue;
    attachPadBuffer(i, sample.buffer);
  }
  return samples;
}

export function assignToPad(
  index: number,
  buffer: AudioBuffer,
  _name: string,
  stretch: StretchMode = "off",
) {
  attachPadBuffer(index, buffer);
  void stretch;
}

export function setPadMute(index: number, mute: boolean) {
  const ch = padCh[index];
  if (ch) ch.mute = mute;
}

export function setVoicePreset(id: VoicePresetId, extraPitch = 0) {
  applyVoiceNodes(id, extraPitch);
}

export function setVoicePitch(id: VoicePresetId, extraPitch: number) {
  applyVoiceNodes(id, extraPitch);
}

export function setMonitor(on: boolean) {
  liveMonitorOn = on;
  if (liveChain) liveChain.output.gain.value = on ? 0.95 : 0;
  if (monitorGain) monitorGain.gain.value = on ? 1 : 0;
}

export async function armMic(): Promise<boolean> {
  const raw = unlockAudio();
  setupLiveVoice(raw);
  setupRecording(raw);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    try {
      micSource?.disconnect();
    } catch {
      /* */
    }
    micSource = raw.createMediaStreamSource(stream);
    const boost = raw.createGain();
    boost.gain.value = 3.2;
    micSource.connect(boost);
    if (liveChain) boost.connect(liveChain.input);
    liveChain?.apply(presetById(getSnap().voicePreset));
    if (liveChain) liveChain.output.gain.value = liveMonitorOn ? 0.95 : 0;
    micOpen = true;
    return true;
  } catch {
    micOpen = false;
    return false;
  }
}

export function isMicOpen() {
  return micOpen;
}

export function startRecord() {
  recChunks = [];
  recording = true;
  emit({ type: "recording", on: true });
}

function chunksToBuffer(): AudioBuffer {
  const tone = need();
  const raw = tone.getContext().rawContext as AudioContext;
  const length = recChunks.reduce((s, c) => s + c.length, 0);
  const buf = raw.createBuffer(1, Math.max(1, length), raw.sampleRate);
  const d = buf.getChannelData(0);
  let o = 0;
  for (const c of recChunks) {
    d.set(c, o);
    o += c.length;
  }
  return buf;
}

export function stopRecord(): AudioBuffer {
  recording = false;
  emit({ type: "recording", on: false });
  return normalizeBuffer(chunksToBuffer());
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const tone = need();
  const arr = await file.arrayBuffer();
  const raw = tone.getContext().rawContext as AudioContext;
  return raw.decodeAudioData(arr.slice(0));
}

export function setSampler(buffer: AudioBuffer, name: string) {
  samplerBuf = buffer;
  samplerName = name;
}

export function getSamplerInfo() {
  return { buffer: samplerBuf, name: samplerName, duration: samplerBuf?.duration ?? 0 };
}

export function previewSampler(start: number, end: number, pitch = 0) {
  if (!samplerBuf) return;
  const sliced = adoptBuffer(sliceBuffer(samplerBuf, start, end));
  const raw = unlockAudio();
  fireNative(sliced, raw.currentTime + 0.01, 2 ** (pitch / 12), 0.9);
}

export function sliceSampler(start: number, end: number) {
  if (!samplerBuf) return null;
  return sliceBuffer(samplerBuf, start, end);
}

export function addTakeBuffer(id: string, buffer: AudioBuffer) {
  takeBufs.set(id, normalizeBuffer(adoptBuffer(buffer), 0.92));
}

export function removeTakeBuffer(id: string) {
  takeBufs.delete(id);
}

function playTakeBuffer(take: TakeMeta, time: number, bpm: number, barSec: number) {
  const buf = takeBufs.get(take.id);
  if (!buf) return;
  const target = stretchTarget(take.stretch, buf.duration, bpm);
  const rateMul = target ? buf.duration / Math.max(0.02, target) : 1;
  fireVoice(buf, time, {
    presetId: take.presetId,
    pitch: take.pitch,
    volume: take.volume,
    rateMul,
  });
  void barSec;
}

export function previewTake(id: string, meta: TakeMeta) {
  if (!takeBufs.get(id)) return;
  const raw = unlockAudio();
  playTakeBuffer(meta, raw.currentTime + 0.01, T?.getTransport().bpm.value ?? 120, 2);
}

export function previewDemo(presetId: VoicePresetId, extraPitch = 0) {
  if (!demoBuf) return;
  applyVoiceNodes(presetId, extraPitch);
  const raw = unlockAudio();
  fireVoice(demoBuf, raw.currentTime + 0.01, {
    presetId,
    pitch: extraPitch,
    volume: 1.35,
  });
}

export function playBufferThroughVoice(buffer: AudioBuffer) {
  const raw = unlockAudio();
  const live = normalizeBuffer(adoptBuffer(buffer), 0.92);
  fireVoice(live, raw.currentTime + 0.01, {
    presetId: getSnap().voicePreset,
    pitch: getSnap().voicePitch,
    volume: 1.3,
  });
}

export function setMasterFx(fx: FxRack) {
  masterReverb.wet.value = fx.reverb;
  masterDelay.wet.value = fx.delay;
  masterDist.distortion = fx.dist;
  masterDist.wet.value = fx.dist > 0.02 ? 1 : 0;
  masterCrush.distortion = fx.crush;
  masterCrush.wet.value = fx.crush;
  masterFilter.frequency.value = 200 + fx.cutoff * 17800;
  masterChorus.wet.value = fx.chorus;
  masterPhaser.wet.value = fx.phaser;
  masterTrem.wet.value = fx.gate;
  if (nativeFilter) nativeFilter.frequency.value = 200 + fx.cutoff * 17800;
  if (nativeDelayGain) nativeDelayGain.gain.value = fx.delay * 0.7;
  if (nativeDelay) nativeDelay.delayTime.value = 0.12 + fx.delay * 0.28;
  if (nativeDist) nativeDist.curve = fx.dist + fx.crush > 0.02 ? driveCurve(fx.dist + fx.crush * 0.6) : identityCurve();
  if (nativeOut) nativeOut.gain.value = 1;
}

export function waveformOf(buffer: AudioBuffer, points = 240): number[] {
  const ch = buffer.getChannelData(0);
  const out: number[] = [];
  const step = Math.max(1, Math.floor(ch.length / points));
  for (let i = 0; i < points; i++) {
    let max = 0;
    const start = i * step;
    for (let j = 0; j < step && start + j < ch.length; j++) {
      max = Math.max(max, Math.abs(ch[start + j] ?? 0));
    }
    out.push(max);
  }
  return out;
}

export function getTakeBuffer(id: string) {
  return takeBufs.get(id) ?? null;
}

export function getDemoBuffer() {
  return demoBuf;
}

export function getPadBuffer(index: number) {
  return padBufs[index] ?? null;
}
