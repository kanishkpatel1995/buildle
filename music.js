// music.js — the song of the day (CONTRACT-A §3). A generative golden-hour
// soundtrack in four layers: a pad felt more than heard, sparse Eno-style felt
// keys drifting in and out of phase, rare chime sparkles, and tightly quantized
// notes for every block placed. Everything musical is derived up front from a
// splitmix32 PRNG seeded by the UTC day number, and the loops are phase-locked
// to UTC midnight, so the whole world hears the same notes at the same moments.
// reducedMotion never silences music — it's audio, not motion.

import * as ToneNS from 'tone';
import { getDayNumber } from './prompts.js';

const Tone = ToneNS.default ?? ToneNS;

// transport — a 16th at 80bpm is ~187ms, tight enough to feel causal
const TRANSPORT_BPM = 80;
const TRANSPORT_START_AT = '+0.1';

// bus & dynamics — the whole soundtrack sits UNDER the SFX (≈ -12 dB)
const MUSIC_BUS_GAIN = 0.25;
const MUTE_RAMP_S = 0.3;
const DUCK_LEVEL = 0.55;          // bus dips to this fraction while SFX speak
const DUCK_ATTACK_S = 0.05;
const DUCK_RELEASE_S = 0.6;
const REVERB_DECAY_S = 5;
const REVERB_DECAY_MOBILE_S = 2.5;
const REVERB_PREDELAY_S = 0.04;
const REVERB_WET = 0.35;
const COMPRESSOR_THRESHOLD_DB = -24;
const COMPRESSOR_RATIO = 3;
const LIMITER_CEILING_DB = -1;

// seeding & scale — the user-triggerable pool is ALWAYS major pentatonic
const ROOTS = ['Db', 'D', 'Eb', 'F', 'Ab'];
const ROOT_SEMITONES = { Db: 1, D: 2, Eb: 3, F: 5, Ab: 8 };
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PENTA_OFFSETS = [0, 2, 4, 7, 9];           // major pentatonic degrees
const POOL_BASE_OCTAVE = 3;                      // pool spans octaves 3–5
const POOL_OCTAVE_SPAN = 2;                      // 2-octave window + top root
const CHIME_OFFSETS = [12, 14, 16, 19, 21, 24];  // pentatonic, octaves 4–5

// pad chord spelling (semitone offsets above the pad root, octave 2)
const PAD_ROOT_OCTAVE = 2;
const CHORD_MAJ9 = [0, 7, 16, 23, 26];
const CHORD_ADD9 = [0, 7, 16, 26];
const COLOR_MAJ7_OFFSET = 23;
const COLOR_B7_OFFSET = 22;       // Mixolydian b7 — pad only
const COLOR_SHARP11_OFFSET = 30;  // Lydian #11, voiced up an octave — pad only
const ADD9_PROBABILITY = 0.3;     // "occasionally add9"
const PAD_COLOR_PROBABILITY = 0.2; // 1 day in 5 the pad gets a color tone

// L1 pad — two detuned fatsawtooth voices behind a slow-breathing lowpass
const PAD_GAIN = 0.5;
const PAD_FAT_COUNT = 3;
const PAD_FAT_SPREAD = 25;
const PAD_DETUNE_CENTS = 7;       // voices sit ±7 cents apart
const PAD_PAN = 0.5;              // voices panned ±0.5
const PAD_ATTACK_S = 4;
const PAD_DECAY_S = 0.1;
const PAD_SUSTAIN = 1;
const PAD_RELEASE_S = 8;
const PAD_FILTER_HZ = 700;
const PAD_FILTER_Q = 0.5;
const PAD_LFO_HZ = 0.07;
const PAD_LFO_MIN_HZ = 450;
const PAD_LFO_MAX_HZ = 950;
const PAD_VIBRATO_HZ = 0.5;       // tape-wow warmth
const PAD_VIBRATO_DEPTH = 0.1;
const PAD_SWELL_MIN_S = 25;
const PAD_SWELL_MAX_S = 45;
const PAD_SWELL_HOLD_S = 10;      // attack + hold before the 8s release begins
const PAD_SWELL_TAIL_S = PAD_SWELL_HOLD_S + PAD_RELEASE_S;
const PAD_FIRST_SWELL_AT = '+0.3'; // local welcome swell so start isn't silent
const PAD_VELOCITY = 0.9;
const PAD_MAX_POLYPHONY = 8;      // chord is ≤6 notes; headroom, no overlap

// L2 Eno loops — five mono felt keys, one patient note each, free-running
const FELT_LOOP_COUNT = 5;
const FELT_LOOP_COUNT_MOBILE = 4;
const FELT_INTERVAL_MIN_S = 18;
const FELT_INTERVAL_SPREAD_S = 14; // intervals land in 18–32s
const FELT_HARMONICITY = 1;
const FELT_MOD_INDEX = 2.5;
const FELT_MOD_ATTACK_S = 0.001;
const FELT_MOD_DECAY_S = 0.3;
const FELT_MOD_RELEASE_S = 0.3;
const FELT_ATTACK_S = 0.005;
const FELT_DECAY_S = 1.5;
const FELT_RELEASE_S = 1.5;
const FELT_FILTER_HZ = 1500;
const FELT_GAIN = 0.8;
const FELT_NOTE_DUR_S = 1.2;
const FELT_VEL_MIN = 0.55;
const FELT_VEL_MAX = 0.85;
const FELT_POOL_MAX_INDEX = 7; // felt keys stay in octaves 3–4: patient, warm
const FELT_DUP_REROLLS = 3;    // deterministic re-rolls to spread the voicing

// L3 chimes — rare sparkles on a quantized grid
const CHIME_GAIN = 0.6;
const CHIME_INTERVAL = '4n';
const CHIME_PROB_MIN = 0.06;
const CHIME_PROB_MAX = 0.15;
const CHIME_HUMANIZE_S = 0.02;
const CHIME_PARTIALS = [1, 0, 2, 0, 3];
const CHIME_ATTACK_S = 0.001;
const CHIME_DECAY_S = 1.2;
const CHIME_RELEASE_S = 1.2;
const CHIME_DELAY_TIME = '8n.';
const CHIME_DELAY_FEEDBACK = 0.7;
const CHIME_DELAY_WET = 0.5;
const CHIME_NOTE_DUR_S = 0.25;
const CHIME_VELOCITY = 0.8;

// L4 interaction — block placements as quantized pentatonic notes
const KEYS_GAIN = 0.8;
const KEYS_MAX_POLYPHONY = 6;
const KEYS_MAX_POLYPHONY_MOBILE = 4;
const KEYS_QUANTIZE = '16n';
const KEYS_NOTE_DUR_S = 0.9;
const KEYS_VEL_LOCAL = 0.7;
const KEYS_VEL_REMOTE = 0.35;
const KEYS_COLOR_VEL_SPREAD = 0.08; // colorIndex adds a whisper of variety
const MAX_NOTES_PER_SEC = 8;
const RATE_WINDOW_S = 1;
const BURST_WINDOW_S = 0.12;       // excess inside this window strums as one chord
const BURST_MAX_NOTES = 12;
const STRUM_MAX_NOTES = 4;
const STRUM_SPACING_S = 0.028;
const NOTE_TIME_RESET = -1e9;
const VOICE_RETRIGGER_EPS_S = 0.005; // start times must strictly increase per voice

// mobile degrade thresholds
const MOBILE_MAX_CORES = 4;
const MOBILE_MAX_WIDTH_PX = 700;

// shared felt-keys patch (L2 voices and the L4 PolySynth)
const FELT_VOICE_OPTIONS = {
  harmonicity: FELT_HARMONICITY,
  modulationIndex: FELT_MOD_INDEX,
  oscillator: { type: 'sine' },
  modulation: { type: 'sine' },
  modulationEnvelope: { attack: FELT_MOD_ATTACK_S, decay: FELT_MOD_DECAY_S, sustain: 0, release: FELT_MOD_RELEASE_S },
  envelope: { attack: FELT_ATTACK_S, decay: FELT_DECAY_S, sustain: 0, release: FELT_RELEASE_S },
};

let isStarted = false;
let muted = false;
let mobileBudget = false;
let cfg = null;

let musicBus = null;
let limiter = null;
let padSynths = [];
let chimeSynth = null;
let keysVoices = [];
let keysVoiceLastT = null;
let keysVoiceIdx = 0;
let pendingRecorderNode = null;

// L4 rate limiting / burst collapse — fixed-size, allocation-free
const noteTimes = new Float64Array(MAX_NOTES_PER_SEC).fill(NOTE_TIME_RESET);
let noteTimeIdx = 0;
const burstNotes = new Array(BURST_MAX_NOTES).fill(null);
let burstCount = 0;
let burstVelocity = 0;
let burstScheduled = false;
let gestureArmed = false;

function hashInt(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function splitmix32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

function midiToName(m) {
  return NOTE_NAMES[m % 12] + (((m / 12) | 0) - 1);
}

function secondsSinceUtcMidnight() {
  const now = new Date();
  return (now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 1000;
}

// Global phase-lock: everyone's first tick lands on the same UTC-midnight grid.
function phaseLockDelay(interval) {
  return interval - (secondsSinceUtcMidnight() % interval);
}

function detectMobileBudget() {
  const cores = navigator.hardwareConcurrency || 8;
  if (cores <= MOBILE_MAX_CORES) return true;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse && window.innerWidth < MOBILE_MAX_WIDTH_PX;
}

// ONE frozen config per day — every rng() call below happens unconditionally,
// in a fixed order, so all clients derive the identical song.
function buildDayConfig() {
  const day = getDayNumber();
  const rng = splitmix32(hashInt(day));
  const root = ROOTS[((day % ROOTS.length) + ROOTS.length) % ROOTS.length];
  const poolRootMidi = ROOT_SEMITONES[root] + 12 * (POOL_BASE_OCTAVE + 1);

  const pentaPool = [];
  for (let oct = 0; oct < POOL_OCTAVE_SPAN; oct++) {
    for (let i = 0; i < PENTA_OFFSETS.length; i++) {
      pentaPool.push(midiToName(poolRootMidi + oct * 12 + PENTA_OFFSETS[i]));
    }
  }
  pentaPool.push(midiToName(poolRootMidi + 12 * POOL_OCTAVE_SPAN));

  const chimeNotes = CHIME_OFFSETS.map((o) => midiToName(poolRootMidi + o));

  const chordType = rng() < ADD9_PROBABILITY ? 'add9' : 'maj9';
  const colorRoll = rng();
  const colorPick = rng();
  const offsets = (chordType === 'add9' ? CHORD_ADD9 : CHORD_MAJ9).slice();
  if (colorRoll < PAD_COLOR_PROBABILITY) {
    if (colorPick < 0.5) {
      const i = offsets.indexOf(COLOR_MAJ7_OFFSET);
      if (i >= 0) offsets[i] = COLOR_B7_OFFSET;
      else offsets.push(COLOR_B7_OFFSET);
    } else {
      offsets.push(COLOR_SHARP11_OFFSET);
    }
  }
  const padRootMidi = ROOT_SEMITONES[root] + 12 * (PAD_ROOT_OCTAVE + 1);
  const padChord = offsets.map((o) => midiToName(padRootMidi + o));

  const padSwellInterval = PAD_SWELL_MIN_S + rng() * (PAD_SWELL_MAX_S - PAD_SWELL_MIN_S);
  const chimeProbability = CHIME_PROB_MIN + rng() * (CHIME_PROB_MAX - CHIME_PROB_MIN);

  // Felt notes draw from the lower pool window; duplicates re-roll a fixed
  // number of times. Conditions depend only on seeded values, so every client
  // takes the identical path and the song stays globally identical.
  const feltLoops = [];
  for (let i = 0; i < FELT_LOOP_COUNT; i++) {
    let note = pentaPool[(rng() * (FELT_POOL_MAX_INDEX + 1)) | 0];
    for (let r = 0; r < FELT_DUP_REROLLS && feltLoops.some((l) => l.note === note); r++) {
      note = pentaPool[(rng() * (FELT_POOL_MAX_INDEX + 1)) | 0];
    }
    feltLoops.push(Object.freeze({
      interval: FELT_INTERVAL_MIN_S + rng() * FELT_INTERVAL_SPREAD_S,
      note,
      velocity: FELT_VEL_MIN + rng() * (FELT_VEL_MAX - FELT_VEL_MIN),
    }));
  }

  return Object.freeze({
    day,
    root,
    pentaPool: Object.freeze(pentaPool),
    chimeNotes: Object.freeze(chimeNotes),
    padChord: Object.freeze(padChord),
    padSwellInterval,
    chimeProbability,
    feltLoops: Object.freeze(feltLoops),
  });
}

function onPadSwell(time) {
  for (let i = 0; i < padSynths.length; i++) {
    padSynths[i].triggerAttackRelease(cfg.padChord, PAD_SWELL_HOLD_S, time, PAD_VELOCITY);
  }
}

function buildPad(transport) {
  const padGainNode = new Tone.Gain(PAD_GAIN);
  padGainNode.connect(musicBus);
  const padFilter = new Tone.Filter({ frequency: PAD_FILTER_HZ, type: 'lowpass', Q: PAD_FILTER_Q });
  padFilter.connect(padGainNode);
  const padLfo = new Tone.LFO(PAD_LFO_HZ, PAD_LFO_MIN_HZ, PAD_LFO_MAX_HZ);
  padLfo.connect(padFilter.frequency);
  padLfo.start();
  const padVibrato = new Tone.Vibrato(PAD_VIBRATO_HZ, PAD_VIBRATO_DEPTH);
  padVibrato.connect(padFilter);

  const voiceCount = mobileBudget ? 1 : 2;
  const oscillator = mobileBudget
    ? { type: 'sawtooth' }
    : { type: 'fatsawtooth', count: PAD_FAT_COUNT, spread: PAD_FAT_SPREAD };
  for (let i = 0; i < voiceCount; i++) {
    const sign = i === 0 ? 1 : -1;
    const synth = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: PAD_MAX_POLYPHONY,
      options: {
        oscillator,
        detune: voiceCount === 1 ? 0 : sign * PAD_DETUNE_CENTS,
        envelope: { attack: PAD_ATTACK_S, decay: PAD_DECAY_S, sustain: PAD_SUSTAIN, release: PAD_RELEASE_S },
      },
    });
    const panner = new Tone.Panner(voiceCount === 1 ? 0 : sign * PAD_PAN);
    synth.connect(panner);
    panner.connect(padVibrato);
    padSynths.push(synth);
  }

  const firstDelay = phaseLockDelay(cfg.padSwellInterval);
  transport.scheduleRepeat(onPadSwell, cfg.padSwellInterval, '+' + firstDelay);
  // a local welcome swell, but only when it can't overlap the locked one
  if (firstDelay > PAD_SWELL_TAIL_S) transport.scheduleOnce(onPadSwell, PAD_FIRST_SWELL_AT);
}

function makeFeltTick(synth, loop) {
  return (time) => synth.triggerAttackRelease(loop.note, FELT_NOTE_DUR_S, time, loop.velocity);
}

function buildFeltLoops(transport) {
  const feltGainNode = new Tone.Gain(FELT_GAIN);
  feltGainNode.connect(musicBus);
  const feltFilter = new Tone.Filter(FELT_FILTER_HZ, 'lowpass');
  feltFilter.connect(feltGainNode);
  const count = mobileBudget ? FELT_LOOP_COUNT_MOBILE : FELT_LOOP_COUNT;
  for (let i = 0; i < count; i++) {
    const loop = cfg.feltLoops[i];
    const synth = new Tone.FMSynth(FELT_VOICE_OPTIONS);
    synth.connect(feltFilter);
    transport.scheduleRepeat(makeFeltTick(synth, loop), loop.interval, '+' + phaseLockDelay(loop.interval));
  }
}

function onChime(time) {
  const note = cfg.chimeNotes[(Math.random() * cfg.chimeNotes.length) | 0];
  chimeSynth.triggerAttackRelease(note, CHIME_NOTE_DUR_S, time, CHIME_VELOCITY);
}

function buildChimes() {
  const chimeGainNode = new Tone.Gain(CHIME_GAIN);
  chimeGainNode.connect(musicBus);
  const chimeDelay = new Tone.FeedbackDelay({
    delayTime: CHIME_DELAY_TIME,
    feedback: CHIME_DELAY_FEEDBACK,
    wet: CHIME_DELAY_WET,
  });
  chimeDelay.connect(chimeGainNode);
  chimeSynth = new Tone.Synth({
    oscillator: { partials: CHIME_PARTIALS },
    envelope: { attack: CHIME_ATTACK_S, decay: CHIME_DECAY_S, sustain: 0, release: CHIME_RELEASE_S },
  });
  chimeSynth.connect(chimeDelay);
  const chimeLoop = new Tone.Loop({
    callback: onChime,
    interval: CHIME_INTERVAL,
    probability: cfg.chimeProbability,
    humanize: CHIME_HUMANIZE_S,
  });
  chimeLoop.start(0);
}

// A fixed bank of mono felt-keys voices played round-robin: retriggering the
// oldest voice IS the voice steal, with none of PolySynth's drop warnings.
function buildKeys() {
  const keysGainNode = new Tone.Gain(KEYS_GAIN);
  keysGainNode.connect(musicBus);
  const keysFilter = new Tone.Filter(FELT_FILTER_HZ, 'lowpass');
  keysFilter.connect(keysGainNode);
  const count = mobileBudget ? KEYS_MAX_POLYPHONY_MOBILE : KEYS_MAX_POLYPHONY;
  keysVoiceLastT = new Float64Array(count).fill(NOTE_TIME_RESET);
  for (let i = 0; i < count; i++) {
    const voice = new Tone.FMSynth(FELT_VOICE_OPTIONS);
    voice.connect(keysFilter);
    keysVoices.push(voice);
  }
}

// Tone mono synths require strictly increasing start times, so a steal that
// lands on a stolen voice's exact start gets nudged forward a hair — a pileup
// on one 16th reads as a micro-strum instead of an exception.
function triggerKey(note, time, velocity) {
  const i = keysVoiceIdx;
  keysVoiceIdx = (keysVoiceIdx + 1) % keysVoices.length;
  let t = time;
  const minT = keysVoiceLastT[i] + VOICE_RETRIGGER_EPS_S;
  if (t < minT) t = minT;
  keysVoiceLastT[i] = t;
  keysVoices[i].triggerAttackRelease(note, KEYS_NOTE_DUR_S, t, velocity);
}

function buildGraph() {
  const transport = Tone.getTransport();
  transport.bpm.value = TRANSPORT_BPM;

  musicBus = new Tone.Gain(muted ? 0 : MUSIC_BUS_GAIN);
  const reverb = new Tone.Reverb({
    decay: mobileBudget ? REVERB_DECAY_MOBILE_S : REVERB_DECAY_S,
    preDelay: REVERB_PREDELAY_S,
    wet: REVERB_WET,
  });
  const compressor = new Tone.Compressor(COMPRESSOR_THRESHOLD_DB, COMPRESSOR_RATIO);
  limiter = new Tone.Limiter(LIMITER_CEILING_DB);
  musicBus.connect(reverb);
  reverb.connect(compressor);
  compressor.connect(limiter);
  limiter.toDestination();

  buildPad(transport);
  buildFeltLoops(transport);
  buildChimes();
  buildKeys();
}

function quantizedTime() {
  const transport = Tone.getTransport();
  if (transport.state === 'started') {
    const t = transport.nextSubdivision(KEYS_QUANTIZE);
    if (t > 0) return t;
  }
  return Tone.now();
}

function flushBurst() {
  burstScheduled = false;
  if (burstCount === 0) {
    burstVelocity = 0;
    return;
  }
  const t = quantizedTime();
  let played = 0;
  for (let i = 0; i < burstCount && played < STRUM_MAX_NOTES; i++) {
    const note = burstNotes[i];
    let dup = false;
    for (let j = 0; j < i; j++) {
      if (burstNotes[j] === note) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    triggerKey(note, t + played * STRUM_SPACING_S, burstVelocity);
    played++;
  }
  burstCount = 0;
  burstVelocity = 0;
}

function queueBurstNote(note, velocity) {
  if (burstCount < BURST_MAX_NOTES) burstNotes[burstCount++] = note;
  if (velocity > burstVelocity) burstVelocity = velocity;
  if (!burstScheduled) {
    burstScheduled = true;
    Tone.getContext().setTimeout(flushBurst, BURST_WINDOW_S);
  }
}

function onGestureResume() {
  gestureArmed = false;
  const raw = Tone.getContext().rawContext;
  if (raw.state !== 'running') raw.resume().catch(() => {});
}

function armGestureResume() {
  if (gestureArmed) return;
  gestureArmed = true;
  window.addEventListener('pointerdown', onGestureResume, { once: true, passive: true });
}

function onVisibilityChange() {
  const raw = Tone.getContext().rawContext;
  if (document.hidden) {
    if (raw.state === 'running') raw.suspend().catch(() => {});
  } else {
    if (raw.state !== 'running') raw.resume().catch(() => {});
    // iOS can land in 'interrupted' until a fresh gesture — re-check then
    armGestureResume();
  }
}

export const music = {
  // Idempotent. Adopts the game's existing AudioContext, derives today's
  // config, builds the whole graph, then rolls the transport.
  start(rawContext) {
    if (isStarted || !rawContext) return;
    isStarted = true;
    Tone.setContext(rawContext);
    mobileBudget = detectMobileBudget();
    cfg = buildDayConfig();
    noteTimes.fill(NOTE_TIME_RESET);
    buildGraph();
    if (pendingRecorderNode) {
      Tone.connect(limiter, pendingRecorderNode);
      pendingRecorderNode = null;
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    Tone.getTransport().start(TRANSPORT_START_AT);
  },

  setMuted(b) {
    muted = !!b;
    if (!isStarted) return;
    const g = musicBus.gain;
    g.cancelScheduledValues(Tone.now());
    g.rampTo(muted ? 0 : MUSIC_BUS_GAIN, MUTE_RAMP_S);
  },

  // Quick dip so SFX read clearly over the music, then ease back.
  duck() {
    if (!isStarted || muted) return;
    const g = musicBus.gain;
    const now = Tone.now();
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(MUSIC_BUS_GAIN * DUCK_LEVEL, now + DUCK_ATTACK_S);
    g.linearRampToValueAtTime(MUSIC_BUS_GAIN, now + DUCK_ATTACK_S + DUCK_RELEASE_S);
  },

  // A placed block becomes a pentatonic note: higher block, higher pitch,
  // snapped to the next 16th. Floods collapse into one strummed chord.
  notePlaced(y, colorIndex, remote = false) {
    if (!isStarted || muted) return;
    const pool = cfg.pentaPool;
    let idx = y | 0;
    if (idx < 0) idx = 0;
    if (idx >= pool.length) idx = pool.length - 1;
    const note = pool[idx];
    const base = remote ? KEYS_VEL_REMOTE : KEYS_VEL_LOCAL;
    const velocity = base * (1 - KEYS_COLOR_VEL_SPREAD + KEYS_COLOR_VEL_SPREAD * (((colorIndex | 0) % 8) / 7));
    const now = Tone.now();
    if (now - noteTimes[noteTimeIdx] < RATE_WINDOW_S) {
      queueBurstNote(note, velocity);
      return;
    }
    noteTimes[noteTimeIdx] = now;
    noteTimeIdx = (noteTimeIdx + 1) % MAX_NOTES_PER_SEC;
    triggerKey(note, quantizedTime(), velocity);
  },

  // Routes the post-limiter mix into the share-clip recorder destination.
  connectRecorder(node) {
    if (!node) return;
    if (!isStarted) {
      pendingRecorderNode = node;
      return;
    }
    Tone.connect(limiter, node);
  },

  get started() {
    return isStarted;
  },
};
