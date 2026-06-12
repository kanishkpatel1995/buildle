// audio.js — every Buildle sound, synthesized live with WebAudio. No files.
// All envelopes ramp exponentially to a small floor (never zero) so nothing clicks.
// Everything stays soft and rounded: sine/triangle voices, lowpassed where helpful.

const MASTER_GAIN = 0.9;
const ENV_FLOOR = 0.0001;       // exponential ramps may never reach 0
const ATTACK = 0.008;           // s, default fade-in to kill onset clicks
const MUTE_RAMP = 0.05;         // s, smoothing for the mute toggle

// wind ambience — looped filtered noise, breathing slowly via an LFO
const WIND_GAIN = 0.04;
const WIND_FADE_IN = 2.5;       // s, hiss swells in instead of switching on
const WIND_FILTER_HZ = 400;
const WIND_FILTER_Q = 0.7;
const WIND_LFO_HZ = 0.07;
const WIND_LFO_DEPTH = 0.018;   // < WIND_GAIN so the floor never hits zero
const WIND_BUFFER_S = 4;

// place — soft "tok"
const PLACE_FREQ = 520;
const PLACE_GLIDE = 260;
const PLACE_DUR = 0.07;
const PLACE_PEAK = 0.2;
const PLACE_LOWPASS = 1600;

// remove — lower "tuk"
const REMOVE_FREQ = 360;
const REMOVE_GLIDE = 170;
const REMOVE_DUR = 0.09;
const REMOVE_PEAK = 0.18;
const REMOVE_LOWPASS = 1200;

// footsteps — barely audible taps, alternating pitch
const STEP_FREQ_A = 190;
const STEP_FREQ_B = 160;
const STEP_GLIDE_RATIO = 0.72;  // each tap sinks slightly, like a soft pad on grass
const STEP_DUR = 0.05;
const STEP_PEAK = 0.045;

// ui blip
const UI_FREQ = 660;
const UI_DUR = 0.06;
const UI_PEAK = 0.1;

// note-open chime — two gentle ascending notes (C5, G5)
const OPEN_NOTES = [523.25, 783.99];
const OPEN_SPACING = 0.1;       // s between notes
const OPEN_DUR = 0.35;
const OPEN_PEAK = 0.1;
const OPEN_LOWPASS = 2600;

// streak milestone — warm ascending arpeggio in C major pentatonic (G4 A4 C5 E5)
const MILESTONE_NOTES = [392.0, 440.0, 523.25, 659.25];
const MILESTONE_SPACING = 0.11;
const MILESTONE_DUR = 0.5;
const MILESTONE_LAST_DUR = 0.85; // final note lingers
const MILESTONE_PEAK = 0.12;
const MILESTONE_LOWPASS = 2200;

let ctx = null;
let master = null;
let muted = false;
let recordDest = null; // lazy MediaStreamAudioDestinationNode for capture.js

function ready() {
  return ctx !== null && ctx.state === 'running';
}

// One short voice: osc → (optional lowpass) → click-free envelope → master.
function tone({ type = 'sine', freq, glideTo = 0, dur, peak, at = 0, lowpass = 0 }) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);

  const env = ctx.createGain();
  env.gain.setValueAtTime(ENV_FLOOR, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + ATTACK);
  env.gain.exponentialRampToValueAtTime(ENV_FLOOR, t0 + dur);

  let head = osc;
  if (lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    osc.connect(lp);
    head = lp;
  }
  head.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function startWind() {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * WIND_BUFFER_S, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = WIND_FILTER_HZ;
  band.Q.value = WIND_FILTER_Q;

  const gain = ctx.createGain();
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(ENV_FLOOR, t0);
  gain.gain.exponentialRampToValueAtTime(WIND_GAIN, t0 + WIND_FADE_IN);

  // slow breathing: LFO output sums onto the base gain value
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = WIND_LFO_HZ;
  const depth = ctx.createGain();
  depth.gain.value = WIND_LFO_DEPTH;
  lfo.connect(depth);
  depth.connect(gain.gain);

  src.connect(band);
  band.connect(gain);
  gain.connect(master);
  src.start(t0);
  lfo.start(t0);
}

export const audio = {
  // Create/resume the AudioContext and start ambience. Safe to call repeatedly;
  // every other method no-ops until this has run on a user gesture.
  ensure() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = muted ? ENV_FLOOR : MASTER_GAIN;
      master.connect(ctx.destination);
      startWind();
    }
    if (ctx.state === 'suspended') ctx.resume();
  },

  setMuted(b) {
    muted = !!b;
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? ENV_FLOOR : MASTER_GAIN, ctx.currentTime, MUTE_RAMP);
  },

  get muted() {
    return muted;
  },

  // The raw AudioContext — music.js builds its Tone graph on the same context.
  // null before ensure() has run on a user gesture.
  getRawContext() {
    return ctx;
  },

  // Recording tap: a lazily-created MediaStreamAudioDestinationNode with the
  // master gain also connected into it, so SFX land in captured clips too.
  getRecordDest() {
    if (!ctx) return null;
    if (!recordDest) {
      recordDest = ctx.createMediaStreamDestination();
      master.connect(recordDest);
    }
    return recordDest;
  },

  getRecordStream() {
    return this.getRecordDest()?.stream ?? null;
  },

  place() {
    if (!ready()) return;
    tone({ type: 'triangle', freq: PLACE_FREQ, glideTo: PLACE_GLIDE, dur: PLACE_DUR, peak: PLACE_PEAK, lowpass: PLACE_LOWPASS });
  },

  remove() {
    if (!ready()) return;
    tone({ type: 'triangle', freq: REMOVE_FREQ, glideTo: REMOVE_GLIDE, dur: REMOVE_DUR, peak: REMOVE_PEAK, lowpass: REMOVE_LOWPASS });
  },

  step(alt) {
    if (!ready()) return;
    const freq = alt ? STEP_FREQ_A : STEP_FREQ_B;
    tone({ freq, glideTo: freq * STEP_GLIDE_RATIO, dur: STEP_DUR, peak: STEP_PEAK });
  },

  ui() {
    if (!ready()) return;
    tone({ freq: UI_FREQ, dur: UI_DUR, peak: UI_PEAK });
  },

  open() {
    if (!ready()) return;
    for (let i = 0; i < OPEN_NOTES.length; i++) {
      tone({ freq: OPEN_NOTES[i], dur: OPEN_DUR, peak: OPEN_PEAK, at: i * OPEN_SPACING, lowpass: OPEN_LOWPASS });
    }
  },

  milestone() {
    if (!ready()) return;
    for (let i = 0; i < MILESTONE_NOTES.length; i++) {
      const last = i === MILESTONE_NOTES.length - 1;
      tone({
        type: 'triangle',
        freq: MILESTONE_NOTES[i],
        dur: last ? MILESTONE_LAST_DUR : MILESTONE_DUR,
        peak: MILESTONE_PEAK,
        at: i * MILESTONE_SPACING,
        lowpass: MILESTONE_LOWPASS,
      });
    }
  },
};
