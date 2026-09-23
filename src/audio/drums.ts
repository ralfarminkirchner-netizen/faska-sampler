import type { KitId } from "./types";

export type KitSample = { name: string; buffer: AudioBuffer };

export const KIT_META: { id: KitId; name: string; blurb: string }[] = [
  { id: "808", name: "Classic 808", blurb: "Analoger Boom, Cowbell, lange Kicks" },
  { id: "909", name: "Classic 909", blurb: "Punchy House-Maschine" },
  { id: "acoustic", name: "Acoustic Kit", blurb: "Felle, Rim, leichter Room" },
  { id: "trap", name: "Trap 808", blurb: "Sub, Snaps, geschichtete Hats" },
  { id: "perc", name: "Percussion", blurb: "Congas, Shaker, Clave, Bongos" },
  { id: "fx", name: "FX & Hits", blurb: "Impacts, Rises, Stabs, Laser" },
  { id: "vocal", name: "Vocal Chops", blurb: "Vokale aufs Raster, ready to chop" },
  { id: "lofi", name: "Lo-Fi Dust", blurb: "Dumpf, tape, rauschender Floor" },
];

function makeNoise(ctx: OfflineAudioContext, duration: number, color: "white" | "pink" = "white") {
  const frames = Math.max(1, Math.ceil(duration * ctx.sampleRate));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "pink") {
      last = last * 0.93 + w * 0.07;
      d[i] = last * 3;
    } else d[i] = w;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function osc(
  ctx: OfflineAudioContext,
  type: OscillatorType,
  freq: number,
  t0: number,
  t1: number,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t0);
  o.stop(t1);
  return o;
}

function drive(ctx: OfflineAudioContext, amount: number) {
  const sh = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  sh.curve = curve;
  sh.oversample = "2x";
  return sh;
}

function env(
  ctx: OfflineAudioContext,
  t0: number,
  attack: number,
  decay: number,
  peak = 1,
) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t0 + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function filter(
  ctx: OfflineAudioContext,
  type: BiquadFilterType,
  freq: number,
  q = 1,
) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function fadeNormalize(buffer: AudioBuffer, peak = 0.89) {
  const fadeIn = Math.min(buffer.length, Math.floor(buffer.sampleRate * 0.002));
  const fadeOut = Math.min(buffer.length, Math.floor(buffer.sampleRate * 0.012));
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  }
  const g = max > 1e-6 ? peak / max : 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      let s = d[i] * g;
      if (i < fadeIn) s *= i / fadeIn;
      if (i > d.length - fadeOut) s *= (d.length - i) / fadeOut;
      d[i] = s;
    }
  }
  return buffer;
}

let renderSr = 44100;

export function setRenderSampleRate(sr: number) {
  if (sr > 0) renderSr = sr;
}

async function render(duration: number, setup: (ctx: OfflineAudioContext) => void) {
  const sr = renderSr;
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * sr), sr);
  setup(ctx);
  const buf = await ctx.startRendering();
  return fadeNormalize(buf);
}

function kick(
  startF: number,
  endF: number,
  decay: number,
  click = 0.4,
  punch = 2.2,
) {
  return render(Math.max(0.35, decay + 0.08), (ctx) => {
    const o = osc(ctx, "sine", startF, 0, decay);
    o.frequency.setValueAtTime(startF, 0);
    o.frequency.exponentialRampToValueAtTime(endF, 0.09);
    const g = env(ctx, 0, 0.002, decay, 1);
    const sh = drive(ctx, punch);
    o.connect(sh);
    sh.connect(g);
    g.connect(ctx.destination);

    const clickOsc = osc(ctx, "sine", 2400, 0, 0.03);
    const cg = env(ctx, 0, 0.0004, 0.018, click);
    clickOsc.connect(cg);
    cg.connect(ctx.destination);

    const n = makeNoise(ctx, 0.04);
    const nf = filter(ctx, "highpass", 1800, 0.7);
    const ng = env(ctx, 0, 0.0004, 0.025, click * 0.35);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

function snare(toneF: number, decay: number, noiseAmt = 0.9, hp = 900) {
  return render(decay + 0.05, (ctx) => {
    const o = osc(ctx, "triangle", toneF, 0, decay * 0.6);
    const og = env(ctx, 0, 0.001, decay * 0.45, 0.55);
    o.connect(og);
    og.connect(ctx.destination);
    const n = makeNoise(ctx, decay);
    const hpF = filter(ctx, "highpass", hp, 0.8);
    const bp = filter(ctx, "bandpass", 1800, 0.7);
    const ng = env(ctx, 0, 0.001, decay, noiseAmt);
    n.connect(hpF);
    hpF.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

function hat(decay: number, open: boolean, metallic = true) {
  return render(decay + 0.02, (ctx) => {
    const g = env(ctx, 0, 0.001, decay, open ? 0.7 : 0.85);
    const hp = filter(ctx, "highpass", open ? 6000 : 7500, 0.8);
    const bp = filter(ctx, "bandpass", 9000, 1.2);
    if (metallic) {
      const ratios = [1, 1.34, 1.96, 2.41, 2.79, 3.32, 4.07];
      for (const r of ratios) {
        const o = osc(ctx, "square", 420 * r, 0, decay);
        o.connect(bp);
      }
    }
    const n = makeNoise(ctx, decay);
    n.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    n.start(0);
  });
}

function clap(decay = 0.32) {
  return render(decay + 0.05, (ctx) => {
    const delays = [0, 0.012, 0.023, 0.038];
    for (const t of delays) {
      const n = makeNoise(ctx, 0.08);
      const bp = filter(ctx, "bandpass", 1400, 1.4);
      const hp = filter(ctx, "highpass", 600);
      const g = env(ctx, t, 0.001, 0.045, 0.9);
      n.connect(hp);
      hp.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      n.start(t);
    }
    const tail = makeNoise(ctx, decay);
    const tbp = filter(ctx, "bandpass", 1200, 0.8);
    const tg = env(ctx, 0.04, 0.01, decay, 0.45);
    tail.connect(tbp);
    tbp.connect(tg);
    tg.connect(ctx.destination);
    tail.start(0.04);
  });
}

function tom(freq: number, decay: number) {
  return render(decay + 0.04, (ctx) => {
    const o = osc(ctx, "sine", freq, 0, decay);
    o.frequency.setValueAtTime(freq * 1.6, 0);
    o.frequency.exponentialRampToValueAtTime(freq, 0.06);
    const g = env(ctx, 0, 0.003, decay, 0.95);
    const sh = drive(ctx, 1.6);
    o.connect(sh);
    sh.connect(g);
    g.connect(ctx.destination);
    const n = makeNoise(ctx, 0.08, "pink");
    const bp = filter(ctx, "bandpass", freq * 2, 1);
    const ng = env(ctx, 0, 0.002, 0.07, 0.22);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

function rim() {
  return render(0.14, (ctx) => {
    const o = osc(ctx, "square", 420, 0, 0.05);
    const og = env(ctx, 0, 0.0004, 0.05, 0.5);
    const bp = filter(ctx, "bandpass", 900, 2);
    o.connect(bp);
    bp.connect(og);
    og.connect(ctx.destination);
    const n = makeNoise(ctx, 0.06);
    const hp = filter(ctx, "highpass", 1500);
    const ng = env(ctx, 0, 0.0004, 0.04, 0.7);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

function cowbell() {
  return render(0.55, (ctx) => {
    const g = env(ctx, 0, 0.001, 0.5, 0.7);
    const bp = filter(ctx, "bandpass", 740, 4);
    const o1 = osc(ctx, "square", 540, 0, 0.55);
    const o2 = osc(ctx, "square", 800, 0, 0.55);
    o1.connect(bp);
    o2.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
  });
}

function clave() {
  return render(0.18, (ctx) => {
    const o = osc(ctx, "triangle", 2500, 0, 0.12);
    const g = env(ctx, 0, 0.0005, 0.1, 0.8);
    const bp = filter(ctx, "bandpass", 2100, 3);
    o.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
  });
}

function shaker(decay = 0.18) {
  return render(decay, (ctx) => {
    const n = makeNoise(ctx, decay);
    const hp = filter(ctx, "highpass", 7000);
    const g = env(ctx, 0, 0.008, decay - 0.01, 0.55);
    n.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    n.start(0);
  });
}

function cymbal(decay = 1.6) {
  return render(decay, (ctx) => {
    const g = env(ctx, 0, 0.004, decay, 0.7);
    const hp = filter(ctx, "highpass", 4200, 0.7);
    const ratios = [1, 1.49, 1.78, 2.24, 2.71, 3.11, 4.18, 5.33];
    for (const r of ratios) {
      const o = osc(ctx, "square", 380 * r, 0, decay);
      o.connect(hp);
    }
    const n = makeNoise(ctx, decay);
    n.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    n.start(0);
  });
}

function bass808(freq = 49) {
  return render(1.8, (ctx) => {
    const o = osc(ctx, "sine", freq * 2.4, 0, 1.8);
    o.frequency.setValueAtTime(freq * 2.4, 0);
    o.frequency.exponentialRampToValueAtTime(freq, 0.12);
    const g = env(ctx, 0, 0.004, 1.7, 1);
    const sh = drive(ctx, 2.8);
    o.connect(sh);
    sh.connect(g);
    g.connect(ctx.destination);
  });
}

function conga(freq: number, decay = 0.42) {
  return render(decay, (ctx) => {
    const o = osc(ctx, "sine", freq, 0, decay);
    o.frequency.setValueAtTime(freq * 1.8, 0);
    o.frequency.exponentialRampToValueAtTime(freq, 0.03);
    const g = env(ctx, 0, 0.002, decay, 0.9);
    o.connect(g);
    g.connect(ctx.destination);
    const n = makeNoise(ctx, 0.05, "pink");
    const bp = filter(ctx, "bandpass", freq * 3, 1.4);
    const ng = env(ctx, 0, 0.001, 0.05, 0.25);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

function impact() {
  return render(1.1, (ctx) => {
    const o = osc(ctx, "sine", 180, 0, 1.1);
    o.frequency.exponentialRampToValueAtTime(40, 0.4);
    const g = env(ctx, 0, 0.004, 1.05, 1);
    const sh = drive(ctx, 3);
    o.connect(sh);
    sh.connect(g);
    g.connect(ctx.destination);
    const n = makeNoise(ctx, 0.4);
    const lp = filter(ctx, "lowpass", 800);
    lp.frequency.setValueAtTime(4000, 0);
    lp.frequency.exponentialRampToValueAtTime(200, 0.35);
    const ng = env(ctx, 0, 0.002, 0.4, 0.8);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

function rise() {
  return render(1.4, (ctx) => {
    const n = makeNoise(ctx, 1.4);
    const bp = filter(ctx, "bandpass", 400, 4);
    bp.frequency.setValueAtTime(300, 0);
    bp.frequency.exponentialRampToValueAtTime(6000, 1.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, 0);
    g.gain.exponentialRampToValueAtTime(0.8, 1.35);
    n.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    n.start(0);
  });
}

function laser() {
  return render(0.45, (ctx) => {
    const o = osc(ctx, "sawtooth", 1400, 0, 0.45);
    o.frequency.setValueAtTime(1400, 0);
    o.frequency.exponentialRampToValueAtTime(120, 0.42);
    const g = env(ctx, 0, 0.002, 0.42, 0.7);
    const f = filter(ctx, "lowpass", 2400, 8);
    o.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
  });
}

function stab(freq: number) {
  return render(0.35, (ctx) => {
    const g = env(ctx, 0, 0.002, 0.32, 0.75);
    const lp = filter(ctx, "lowpass", 1800, 4);
    for (const r of [1, 1.5, 2]) {
      const o = osc(ctx, "sawtooth", freq * r, 0, 0.35);
      o.connect(lp);
    }
    lp.connect(g);
    g.connect(ctx.destination);
  });
}

const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1200, 2600],
  e: [400, 2200, 2700],
  i: [270, 2300, 3000],
  o: [500, 900, 2400],
  u: [300, 700, 2200],
};

export function synthesizeVowel(vowel: keyof typeof VOWELS, freq: number, duration = 0.45) {
  return render(duration, (ctx) => {
    const formants = VOWELS[vowel];
    const source = osc(ctx, "sawtooth", freq, 0, duration);
    const g = env(ctx, 0, 0.02, duration - 0.02, 0.55);
    for (const f of formants) {
      const bp = filter(ctx, "bandpass", f, 8);
      source.connect(bp);
      bp.connect(g);
    }
    g.connect(ctx.destination);
  });
}

function glass() {
  return render(0.9, (ctx) => {
    const g = env(ctx, 0, 0.002, 0.85, 0.6);
    for (const f of [1750, 2620, 3490, 5230]) {
      const o = osc(ctx, "sine", f, 0, 0.9);
      o.connect(g);
    }
    g.connect(ctx.destination);
  });
}

function lofiKick() {
  return render(0.7, (ctx) => {
    const o = osc(ctx, "sine", 140, 0, 0.7);
    o.frequency.setValueAtTime(140, 0);
    o.frequency.exponentialRampToValueAtTime(48, 0.1);
    const g = env(ctx, 0, 0.003, 0.65, 0.9);
    const lp = filter(ctx, "lowpass", 900);
    const sh = drive(ctx, 2.4);
    o.connect(sh);
    sh.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    const n = makeNoise(ctx, 0.7, "pink");
    const ng = ctx.createGain();
    ng.gain.value = 0.04;
    n.connect(ng);
    ng.connect(ctx.destination);
    n.start(0);
  });
}

type Gen = () => Promise<AudioBuffer>;

const KITS: Record<KitId, { name: string; gen: Gen }[]> = {
  "808": [
    { name: "Kick", gen: () => kick(140, 42, 0.7, 0.35, 2.4) },
    { name: "Snare", gen: () => snare(180, 0.28, 0.85, 800) },
    { name: "Clap", gen: () => clap(0.3) },
    { name: "CHH", gen: () => hat(0.07, false) },
    { name: "OHH", gen: () => hat(0.32, true) },
    { name: "Rim", gen: () => rim() },
    { name: "Cowbell", gen: () => cowbell() },
    { name: "Maracas", gen: () => shaker(0.14) },
    { name: "Tom Lo", gen: () => tom(90, 0.5) },
    { name: "Tom Mid", gen: () => tom(130, 0.42) },
    { name: "Tom Hi", gen: () => tom(180, 0.36) },
    { name: "Clave", gen: () => clave() },
    { name: "Kick Long", gen: () => kick(110, 32, 1.4, 0.2, 2.8) },
    { name: "Snare Alt", gen: () => snare(210, 0.22, 0.7, 1200) },
    { name: "Cymbal", gen: () => cymbal(1.4) },
    { name: "808 Bass", gen: () => bass808(41) },
  ],
  "909": [
    { name: "Kick", gen: () => kick(180, 55, 0.38, 0.7, 1.8) },
    { name: "Snare", gen: () => snare(210, 0.22, 1, 1100) },
    { name: "Clap", gen: () => clap(0.26) },
    { name: "CHH", gen: () => hat(0.055, false) },
    { name: "OHH", gen: () => hat(0.38, true) },
    { name: "Rim", gen: () => rim() },
    { name: "Ride", gen: () => cymbal(1.1) },
    { name: "Crash", gen: () => cymbal(1.8) },
    { name: "Tom Lo", gen: () => tom(100, 0.4) },
    { name: "Tom Mid", gen: () => tom(145, 0.34) },
    { name: "Tom Hi", gen: () => tom(200, 0.28) },
    { name: "Clave", gen: () => clave() },
    { name: "Kick 2", gen: () => kick(160, 48, 0.5, 0.55, 2) },
    { name: "Snare 2", gen: () => snare(190, 0.3, 0.8, 700) },
    { name: "Perc", gen: () => shaker(0.1) },
    { name: "Bass", gen: () => bass808(55) },
  ],
  acoustic: [
    { name: "Kick", gen: () => kick(120, 50, 0.45, 0.5, 1.5) },
    { name: "Snare", gen: () => snare(175, 0.32, 0.75, 600) },
    { name: "Rim", gen: () => rim() },
    { name: "CHH", gen: () => hat(0.08, false, false) },
    { name: "OHH", gen: () => hat(0.4, true, false) },
    { name: "Tom Lo", gen: () => tom(80, 0.55) },
    { name: "Tom Mid", gen: () => tom(120, 0.45) },
    { name: "Tom Hi", gen: () => tom(170, 0.35) },
    { name: "Ride", gen: () => cymbal(1.3) },
    { name: "Crash", gen: () => cymbal(1.7) },
    { name: "Clap", gen: () => clap(0.28) },
    { name: "Shaker", gen: () => shaker(0.16) },
    { name: "Stick", gen: () => clave() },
    { name: "Room Snare", gen: () => snare(160, 0.5, 0.6, 400) },
    { name: "Kick Sub", gen: () => kick(90, 38, 0.8, 0.15, 2) },
    { name: "Perc", gen: () => conga(210, 0.3) },
  ],
  trap: [
    { name: "808 Sub", gen: () => bass808(37) },
    { name: "Kick", gen: () => kick(150, 40, 0.55, 0.6, 2.6) },
    { name: "Snare", gen: () => snare(220, 0.2, 0.95, 1400) },
    { name: "Clap", gen: () => clap(0.24) },
    { name: "CHH", gen: () => hat(0.045, false) },
    { name: "OHH", gen: () => hat(0.28, true) },
    { name: "Snap", gen: () => rim() },
    { name: "Perc", gen: () => clave() },
    { name: "Hat Roll", gen: () => hat(0.06, false) },
    { name: "Tom", gen: () => tom(140, 0.3) },
    { name: "Crash", gen: () => cymbal(1.2) },
    { name: "Shaker", gen: () => shaker(0.12) },
    { name: "808 Mid", gen: () => bass808(49) },
    { name: "Snare 2", gen: () => snare(260, 0.16, 1, 1600) },
    { name: "Fx Hit", gen: () => stab(110) },
    { name: "Rise", gen: () => rise() },
  ],
  perc: [
    { name: "Conga Lo", gen: () => conga(110, 0.4) },
    { name: "Conga Mid", gen: () => conga(160, 0.34) },
    { name: "Conga Hi", gen: () => conga(220, 0.28) },
    { name: "Bongo Lo", gen: () => conga(280, 0.22) },
    { name: "Bongo Hi", gen: () => conga(360, 0.18) },
    { name: "Clave", gen: () => clave() },
    { name: "Shaker", gen: () => shaker(0.14) },
    { name: "Cabasa", gen: () => shaker(0.08) },
    { name: "Cowbell", gen: () => cowbell() },
    { name: "Rim", gen: () => rim() },
    { name: "Tamb", gen: () => hat(0.2, true, true) },
    { name: "Wood", gen: () => clave() },
    { name: "Clap", gen: () => clap(0.22) },
    { name: "Tom", gen: () => tom(150, 0.3) },
    { name: "Guiro", gen: () => shaker(0.22) },
    { name: "Crash", gen: () => cymbal(1) },
  ],
  fx: [
    { name: "Impact", gen: () => impact() },
    { name: "Rise", gen: () => rise() },
    { name: "Laser", gen: () => laser() },
    { name: "Stab A", gen: () => stab(110) },
    { name: "Stab B", gen: () => stab(146) },
    { name: "Stab C", gen: () => stab(165) },
    { name: "Glass", gen: () => glass() },
    { name: "Sub Drop", gen: () => kick(80, 25, 1.2, 0.1, 3) },
    { name: "Noise Hit", gen: () => snare(100, 0.18, 1, 400) },
    { name: "Cym Reverse", gen: () => rise() },
    { name: "Zap", gen: () => laser() },
    { name: "Clack", gen: () => rim() },
    { name: "Whoosh", gen: () => rise() },
    { name: "Boom", gen: () => impact() },
    { name: "Chime", gen: () => glass() },
    { name: "Bass Stab", gen: () => stab(55) },
  ],
  vocal: [
    { name: "Ah C", gen: () => synthesizeVowel("a", 130.8, 0.4) },
    { name: "Ah Eb", gen: () => synthesizeVowel("a", 155.6, 0.4) },
    { name: "Ah G", gen: () => synthesizeVowel("a", 196, 0.4) },
    { name: "Ah C5", gen: () => synthesizeVowel("a", 261.6, 0.4) },
    { name: "Oh C", gen: () => synthesizeVowel("o", 130.8, 0.4) },
    { name: "Ee G", gen: () => synthesizeVowel("e", 196, 0.38) },
    { name: "Oo C", gen: () => synthesizeVowel("u", 130.8, 0.45) },
    { name: "Ey Eb", gen: () => synthesizeVowel("e", 155.6, 0.32) },
    { name: "Ah Low", gen: () => synthesizeVowel("a", 98, 0.5) },
    { name: "Mm", gen: () => synthesizeVowel("u", 110, 0.5) },
    { name: "Hey", gen: () => synthesizeVowel("e", 220, 0.22) },
    { name: "Huh", gen: () => synthesizeVowel("a", 146, 0.18) },
    { name: "Oh High", gen: () => synthesizeVowel("o", 261.6, 0.3) },
    { name: "Air", gen: () => shaker(0.2) },
    { name: "Chop", gen: () => synthesizeVowel("i", 196, 0.16) },
    { name: "Pad Ah", gen: () => synthesizeVowel("a", 130.8, 0.9) },
  ],
  lofi: [
    { name: "Kick", gen: () => lofiKick() },
    { name: "Snare", gen: () => snare(150, 0.36, 0.55, 500) },
    { name: "Rim", gen: () => rim() },
    { name: "CHH", gen: () => hat(0.09, false, false) },
    { name: "OHH", gen: () => hat(0.35, true, false) },
    { name: "Clap", gen: () => clap(0.34) },
    { name: "Tom", gen: () => tom(100, 0.5) },
    { name: "Shaker", gen: () => shaker(0.18) },
    { name: "Dust Hit", gen: () => snare(90, 0.4, 0.4, 300) },
    { name: "Keys", gen: () => stab(98) },
    { name: "Sub", gen: () => bass808(36) },
    { name: "Ride", gen: () => cymbal(1.5) },
    { name: "Snap", gen: () => rim() },
    { name: "Vox", gen: () => synthesizeVowel("o", 146, 0.5) },
    { name: "Tape Kick", gen: () => kick(100, 40, 0.7, 0.2, 2.2) },
    { name: "Cym", gen: () => cymbal(1.1) },
  ],
};

const cache = new Map<string, KitSample[]>();

export async function generateKit(id: KitId): Promise<KitSample[]> {
  const key = `${id}:${renderSr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const specs = KITS[id];
  const samples: KitSample[] = [];
  for (const spec of specs) {
    samples.push({ name: spec.name, buffer: await spec.gen() });
  }
  cache.set(key, samples);
  return samples;
}

export async function generateDemoVoice(): Promise<AudioBuffer> {
  const a = await synthesizeVowel("a", 146.8, 0.55);
  const o = await synthesizeVowel("o", 174.6, 0.5);
  const e = await synthesizeVowel("e", 196, 0.45);
  const sr = a.sampleRate;
  const gap = Math.floor(sr * 0.08);
  const total = a.length + gap + o.length + gap + e.length;
  const oc = new OfflineAudioContext(1, total, sr);
  const out = oc.createBuffer(1, total, sr);
  const d = out.getChannelData(0);
  d.set(a.getChannelData(0), 0);
  d.set(o.getChannelData(0), a.length + gap);
  d.set(e.getChannelData(0), a.length + gap + o.length + gap);
  // close dummy context
  return fadeNormalize(out, 0.8);
}

export async function generateClick(high: boolean): Promise<AudioBuffer> {
  return render(0.05, (ctx) => {
    const o = osc(ctx, "sine", high ? 1800 : 1100, 0, 0.04);
    const g = env(ctx, 0, 0.0005, 0.035, high ? 0.5 : 0.4);
    o.connect(g);
    g.connect(ctx.destination);
  });
}

export function sliceBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(buffer.length, Math.floor(endSec * sr));
  const len = Math.max(1, end - start);
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, len, sr);
  const out = ctx.createBuffer(buffer.numberOfChannels, len, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(start, start + len), c);
  }
  return fadeNormalize(out, 0.95);
}

export function emptyPattern(): boolean[][] {
  return Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => false));
}

export function factoryPatterns(): boolean[][][] {
  const house = emptyPattern();
  [0, 4, 8, 12].forEach((s) => {
    house[0]![s] = true;
  });
  [4, 12].forEach((s) => {
    house[2]![s] = true;
  });
  for (let s = 0; s < 16; s++) house[3]![s] = true;
  [2, 6, 10, 14].forEach((s) => {
    house[4]![s] = true;
  });
  [3, 11].forEach((s) => {
    house[7]![s] = true;
  });

  const boom = emptyPattern();
  [0, 7, 10].forEach((s) => {
    boom[0]![s] = true;
  });
  [4, 12].forEach((s) => {
    boom[1]![s] = true;
  });
  [2, 6, 8, 11, 14].forEach((s) => {
    boom[3]![s] = true;
  });
  [4, 12].forEach((s) => {
    boom[2]![s] = true;
  });
  boom[15]![0] = true;

  const trap = emptyPattern();
  [0, 3, 8, 11].forEach((s) => {
    trap[0]![s] = true;
  });
  [4, 12].forEach((s) => {
    trap[2]![s] = true;
  });
  for (let s = 0; s < 16; s++) trap[3]![s] = s % 2 === 0;
  [6, 14].forEach((s) => {
    trap[4]![s] = true;
  });
  trap[15]![0] = true;
  trap[15]![10] = true;
  [7, 13].forEach((s) => {
    trap[7]![s] = true;
  });

  const breakbeat = emptyPattern();
  [0, 3, 6, 8, 11, 14].forEach((s) => {
    breakbeat[0]![s] = true;
  });
  [4, 6, 12, 13].forEach((s) => {
    breakbeat[1]![s] = true;
  });
  for (let s = 0; s < 16; s++) breakbeat[3]![s] = true;
  [2, 10].forEach((s) => {
    breakbeat[6]![s] = true;
  });

  return [house, boom, trap, breakbeat, emptyPattern(), emptyPattern(), emptyPattern(), emptyPattern()];
}

export const PATTERN_NAMES = [
  "House",
  "Boom",
  "Trap",
  "Break",
  "Beat 5",
  "Beat 6",
  "Beat 7",
  "Beat 8",
];
