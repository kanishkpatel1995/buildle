// lofi.js — "beats to build to" (the Commons update, C3). A second soundtrack
// beside music.js's golden-hour ambient: a day-seeded lo-fi hip-hop loop —
// swung boom-bap drums, a Rhodes on jazzy maj7/min9 chords, a round sub bass,
// and the lo-fi signature on a master "tape" bus (lowpass warmth, a touch of
// bitcrush, tape wow, reverb, vinyl crackle, and a kick-ducked sidechain pump).
//
// Architecture mirrors jacbz/Lofi (the canonical browser lo-fi generator) but
// synthesises everything — no samples, no files. It shares the one global Tone
// Transport with music.js (music.js owns starting it); this engine only schedules
// a Sequence that runs while lo-fi mode is active, so the two never both sound.
// Everyone on a given UTC day hears the same chords and tempo.

import * as ToneNS from 'tone';
import { getDayNumber } from './prompts.js';

const Tone = ToneNS.default ?? ToneNS;

// ── groove ──────────────────────────────────────────────────────────────────
const BPM_MIN = 72, BPM_SPAN = 14;          // 72–86, snapped to even values
const SWING_MIN = 0.28, SWING_SPAN = 0.2;   // 0.28–0.48 on the 16th grid
const STEPS = 16;                            // one bar of sixteenths
const HUMANIZE_S = 0.012;                    // micro-timing jitter (per client)

// ── bus / dynamics ──────────────────────────────────────────────────────────
const LOFI_BUS_GAIN = 0.32;                  // sits a hair under the SFX
const MUTE_RAMP_S = 0.3;
const ACTIVE_RAMP_S = 0.6;                   // fade the whole engine in/out on toggle
const TAPE_LOWPASS_HZ = 5200;                // warmth — roll off the highs
const TAPE_LOWPASS_HZ_MOBILE = 4200;
const BITS = 6;                              // gentle bitcrush grit
const CHORUS_HZ = 0.6, CHORUS_DEPTH = 0.4;   // tape wow / flutter
const REVERB_DECAY_S = 3.4, REVERB_DECAY_MOBILE_S = 1.8, REVERB_WET = 0.26;
const LIMITER_DB = -1;
const DUCK_FLOOR = 0.55;                     // sidechain dip depth on each kick
const DUCK_ATTACK_S = 0.012;
const DUCK_RELEASE_S = 0.26;
const VINYL_GAIN = 0.05;                     // crackle level
const VINYL_BUFFER_S = 4;

// ── scale / harmony ─────────────────────────────────────────────────────────
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'G', 'A', 'Bb'];
const ROOT_SEMI = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, G: 7, A: 9, Bb: 10 };
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Chord shapes as semitone stacks (maj7 / min7 / dom9 / min9 — the lo-fi staples).
const SHAPES = {
  maj7: [0, 4, 7, 11, 14],
  min7: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  min9: [0, 3, 7, 10, 14],
};
// Progressions as [scaleDegreeSemitone, shape] over the seeded major key. These
// are the classic jazzy loops: I–vi–ii–V, ii–V–I–vi, IV–iii–vi–V.
const PROGRESSIONS = [
  [[0, 'maj7'], [9, 'min9'], [2, 'min7'], [7, 'dom9']],
  [[2, 'min7'], [7, 'dom9'], [0, 'maj7'], [9, 'min9']],
  [[5, 'maj7'], [4, 'min7'], [9, 'min9'], [7, 'dom9']],
  [[0, 'maj7'], [5, 'maj7'], [9, 'min9'], [7, 'dom9']],
];
const CHORD_OCTAVE = 4;                       // Rhodes voicing centre
const BASS_OCTAVE = 2;

// ── mobile degrade ──────────────────────────────────────────────────────────
const MOBILE_MAX_CORES = 4;
const MOBILE_MAX_WIDTH_PX = 700;

let isStarted = false;
let isActive = false;
let muted = false;
let mobileBudget = false;
let cfg = null;

let tapeIn = null, duckGain = null, lofiOut = null, limiter = null;
let kick = null, snare = null, hat = null, rhodes = null, bass = null, pad = null;
let seq = null;
let bar = 0;
let pendingRecorderNode = null;
let prevSwing = 0, prevSwingSub = '8n', prevBpm = 120;
let appliedTransport = false;

// ── seeded PRNG (cyrb53-ish hash → mulberry32), identical per UTC day ─────────
function hashInt(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function midiToName(m) {
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

function detectMobileBudget() {
  const cores = navigator.hardwareConcurrency || 8;
  if (cores <= MOBILE_MAX_CORES) return true;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse && window.innerWidth < MOBILE_MAX_WIDTH_PX;
}

// One frozen config per day: tempo, swing, key, progression, and a couple of
// rhythm flavours — all drawn in a fixed order so every client matches.
function buildDayConfig() {
  const day = getDayNumber();
  const rng = mulberry32(hashInt(day * 2654435761));
  const bpm = BPM_MIN + Math.round((rng() * BPM_SPAN) / 2) * 2;
  const swing = SWING_MIN + rng() * SWING_SPAN;
  const root = ROOTS[(rng() * ROOTS.length) | 0];
  const rootSemi = ROOT_SEMI[root];
  const prog = PROGRESSIONS[(rng() * PROGRESSIONS.length) | 0];

  // Pre-voice every chord (Rhodes notes) and its bass root for the bar.
  const chords = prog.map(([deg, shape]) => {
    const base = rootSemi + deg + 12 * (CHORD_OCTAVE + 1);
    const offs = SHAPES[shape];
    // drop the 5th occasionally for an airier voicing (seeded per chord)
    const notes = offs
      .filter((o, i) => !(i === 2 && rng() < 0.35))
      .map((o) => midiToName(base + o));
    const bassMidi = rootSemi + deg + 12 * (BASS_OCTAVE + 1);
    return { notes, bass: midiToName(bassMidi) };
  });

  const ghostKick = rng() < 0.6;            // extra kick before the 2nd snare
  const swung16Hats = rng() < 0.5;          // 16th vs 8th hats
  return Object.freeze({ day, bpm, swing, root, chords, ghostKick, swung16Hats });
}

// ── graph ─────────────────────────────────────────────────────────────────
function buildTape() {
  lofiOut = new Tone.Gain(muted ? 0 : 0);   // engine starts silent; setActive ramps it
  const lowpass = new Tone.Filter({
    frequency: mobileBudget ? TAPE_LOWPASS_HZ_MOBILE : TAPE_LOWPASS_HZ, type: 'lowpass', rolloff: -24,
  });
  const crusher = new Tone.BitCrusher(BITS);
  crusher.wet.value = 0.35;
  const chorus = new Tone.Chorus(CHORUS_HZ, 2.5, CHORUS_DEPTH);
  chorus.wet.value = 0.5;
  try { chorus.start(); } catch { /* older builds auto-run */ }
  const reverb = new Tone.Reverb({ decay: mobileBudget ? REVERB_DECAY_MOBILE_S : REVERB_DECAY_S, wet: REVERB_WET });
  limiter = new Tone.Limiter(LIMITER_DB);

  tapeIn = new Tone.Gain(1);
  tapeIn.chain(lowpass, crusher, chorus, reverb, lofiOut, limiter);
  limiter.toDestination();

  // vinyl crackle — filtered looped noise, always feeding the tape
  const noiseBuf = makeNoiseBuffer();
  const vinyl = new Tone.Player(noiseBuf);
  vinyl.loop = true;
  const vHigh = new Tone.Filter(1200, 'highpass');
  const vLow = new Tone.Filter(7000, 'lowpass');
  const vGain = new Tone.Gain(VINYL_GAIN);
  vinyl.chain(vHigh, vLow, vGain, tapeIn);
  try { vinyl.start(); } catch { /* buffer not ready — crackle simply absent */ }

  // sidechain bus: chords/bass/pad pass through duckGain, dipped on each kick
  duckGain = new Tone.Gain(1);
  duckGain.connect(tapeIn);
}

function makeNoiseBuffer() {
  const ctx = Tone.getContext().rawContext;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * VINYL_BUFFER_S), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // sparse crackle: mostly quiet with occasional pops, plus a faint hiss floor
  for (let i = 0; i < data.length; i++) {
    let v = (Math.random() * 2 - 1) * 0.06;
    if (Math.random() < 0.0009) v += (Math.random() * 2 - 1) * 0.9;
    data[i] = v;
  }
  return new Tone.ToneAudioBuffer(buf);
}

function buildVoices() {
  // drums → straight to the tape (never ducked by their own kick)
  kick = new Tone.MembraneSynth({
    pitchDecay: 0.03, octaves: 6,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2 },
  });
  kick.volume.value = -4;
  kick.connect(tapeIn);

  snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
  });
  const snareFilter = new Tone.Filter(1900, 'bandpass');
  snareFilter.Q.value = 0.8;
  snare.volume.value = -16;
  snare.chain(snareFilter, tapeIn);

  hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
  });
  const hatFilter = new Tone.Filter(8000, 'highpass');
  hat.volume.value = -26;
  hat.chain(hatFilter, tapeIn);

  // melodic → duckGain (sidechained)
  rhodes = new Tone.PolySynth({
    voice: Tone.FMSynth,
    maxPolyphony: mobileBudget ? 6 : 10,
    options: {
      harmonicity: 2.0,
      modulationIndex: 2.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.008, decay: 0.5, sustain: 0.18, release: 1.4 },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 },
    },
  });
  rhodes.volume.value = -13;
  rhodes.connect(duckGain);

  bass = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.4 },
    filter: { Q: 1, type: 'lowpass' },
    filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.4, baseFrequency: 120, octaves: 2 },
  });
  bass.volume.value = -10;
  bass.connect(duckGain);

  if (!mobileBudget) {
    pad = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 6,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 1.6, decay: 0.4, sustain: 0.8, release: 3 },
      },
    });
    pad.volume.value = -26;
    pad.connect(duckGain);
  }
}

// Quick sidechain dip on duckGain, fired by the kick.
function duck(time) {
  if (!duckGain) return;
  const g = duckGain.gain;
  g.cancelScheduledValues(time);
  g.setValueAtTime(g.value, time);
  g.linearRampToValueAtTime(DUCK_FLOOR, time + DUCK_ATTACK_S);
  g.linearRampToValueAtTime(1, time + DUCK_ATTACK_S + DUCK_RELEASE_S);
}

// One 16th step. step ∈ 0..15; bar advances the chord on wrap.
function onStep(time, step) {
  if (!isActive) return;
  const h = () => time + (Math.random() - 0.5) * HUMANIZE_S;
  const chord = cfg.chords[bar % cfg.chords.length];

  // hats — 8th (or swung-16th) grid, velocity alternating
  if (cfg.swung16Hats ? true : step % 2 === 0) {
    const v = 0.18 + (step % 4 === 0 ? 0.12 : 0) + Math.random() * 0.05;
    try { hat.triggerAttackRelease('16n', h(), v); } catch { /* voice busy */ }
  }

  // kick — boom-bap: downbeat + the "and" of beat 3, optional ghost before snare
  if (step === 0 || step === 10 || (cfg.ghostKick && step === 8)) {
    kick.triggerAttackRelease('C1', '8n', h(), step === 0 ? 1 : 0.7);
    duck(time);
  }

  // snare — backbeats (2 & 4)
  if (step === 4 || step === 12) {
    snare.triggerAttackRelease('16n', h(), 0.9);
  }

  // chord stabs — on the bar, and a softer push on the "and" of 2
  if (step === 0) {
    rhodes.triggerAttackRelease(chord.notes, '2n', h(), 0.5);
    if (pad) pad.triggerAttackRelease(chord.notes, '1m', time, 0.4);
  } else if (step === 6) {
    rhodes.triggerAttackRelease(chord.notes, '8n', h(), 0.32);
  }

  // bass — root on 1, a lift on the "and" of 3
  if (step === 0) bass.triggerAttackRelease(chord.bass, '4n', h(), 0.9);
  else if (step === 11) bass.triggerAttackRelease(chord.bass, '8n', h(), 0.7);

  if (step === STEPS - 1) bar++;
}

function buildGraph() {
  buildTape();
  buildVoices();
  seq = new Tone.Sequence((time, step) => onStep(time, step),
    Array.from({ length: STEPS }, (_, i) => i), '16n');
  seq.humanize = false;   // we humanise per-hit ourselves
}

// Apply / restore the swung lo-fi feel on the shared transport.
function applyTransport(on) {
  const transport = Tone.getTransport();
  if (on) {
    if (!appliedTransport) {
      prevSwing = transport.swing;
      prevSwingSub = transport.swingSubdivision;
      prevBpm = transport.bpm.value;
      appliedTransport = true;
    }
    transport.bpm.rampTo(cfg.bpm, 0.4);
    transport.swing = cfg.swing;
    transport.swingSubdivision = '16n';
  } else if (appliedTransport) {
    transport.bpm.rampTo(prevBpm, 0.4);
    transport.swing = prevSwing;
    transport.swingSubdivision = prevSwingSub;
    appliedTransport = false;
  }
}

function busTarget() {
  return muted ? 0 : LOFI_BUS_GAIN;
}

export const lofi = {
  // Build the whole graph on the shared context (idempotent). Silent until
  // setActive(true). music.js owns starting the transport.
  start(rawContext) {
    if (isStarted || !rawContext) return;
    isStarted = true;
    Tone.setContext(rawContext);
    mobileBudget = detectMobileBudget();
    cfg = buildDayConfig();
    buildGraph();
    if (pendingRecorderNode) {
      try { Tone.connect(limiter, pendingRecorderNode); } catch { /* ignore */ }
      pendingRecorderNode = null;
    }
  },

  // Switch the engine on/off. Starts/stops the sequence, applies the swung
  // transport, and fades the bus. Phase-locks the sequence to the transport's
  // next bar so chords land on the grid.
  setActive(b) {
    isActive = !!b;
    if (!isStarted) return;
    const g = lofiOut.gain;
    g.cancelScheduledValues(Tone.now());
    if (isActive) {
      applyTransport(true);
      bar = 0;
      try { seq.start(Tone.getTransport().nextSubdivision('1m')); } catch { try { seq.start(0); } catch { /* */ } }
      g.rampTo(busTarget(), ACTIVE_RAMP_S);
    } else {
      g.rampTo(0, ACTIVE_RAMP_S);
      try { seq.stop('+' + ACTIVE_RAMP_S); } catch { /* not started */ }
      applyTransport(false);
    }
  },

  setMuted(b) {
    muted = !!b;
    if (!isStarted || !isActive) return;
    lofiOut.gain.rampTo(busTarget(), MUTE_RAMP_S);
  },

  connectRecorder(node) {
    if (!node) return;
    if (!isStarted) { pendingRecorderNode = node; return; }
    try { Tone.connect(limiter, node); } catch { /* ignore */ }
  },

  get started() { return isStarted; },
  get active() { return isActive; },
};
