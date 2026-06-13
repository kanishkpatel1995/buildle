// foundry.js — the build animator + the builder NPC (CONTRACT-W6 §2).
//
// A summoned build materializes on the foundry's empty plinth, block by block,
// bottom-up and outward, as if growing. createFoundry owns a DEDICATED World
// for these builds (separate from the island's ground world), a honey-bodied
// builder who stands at the lectern and raises a glowing wand while conjuring,
// and the pacing that makes a 600-block build take ~4 calm seconds.

import * as THREE from 'three';
import { World, PALETTE } from './world.js';
import { createCharacter } from './player.js';
import { audio } from './audio.js';
import { music } from './music.js';
import { FOUNDRY_BUILD_ORIGIN } from './islands/foundry.js';

// ── build World geometry ─────────────────────────────────────────────────────
const WORLD_SIZE = 32;            // 32×32 footprint, radius 16, centered on the plinth
const WORLD_RADIUS = 16;
const BUILD_SPAN = 24;            // builds are authored in a 24-wide 0..23 grid
const BUILD_HALF = 12;            // build-local bx → global origin.x − 12 + bx
const Y_MAX = 31;                 // world height ceiling (world.js WORLD_HEIGHT − 1)

// ── pacing — small builds ~2s, 600 ~4s, huge ones cap ~6s ────────────────────
const PLACE_RATE = 140;           // target cells/second at the sweet spot
const MIN_DURATION = 2;           // s — even a tiny build savors its arrival
const MAX_DURATION = 6;           // s — a giant build still finishes promptly
const MAX_PER_TICK = 64;          // hard cap on placements per frame (frame-time guard)

// ── rationed feedback — so 600 blocks don't roar ─────────────────────────────
const AUDIO_EVERY = 10;           // audio.place() on ~every Nth block
const MUSIC_EVERY = 6;            // music.notePlaced() on ~every Nth block

// ── the builder NPC ──────────────────────────────────────────────────────────
const BODY_COLOR = 9;             // Honey
const LECTERN_LOCAL = { x: 0, z: 9.0 };   // just plinth-side of the lectern (islands/foundry.js)
const FACE_YAW = Math.PI;         // face the plinth (−z), toward where the build rises
// wand: a slim Cocoa shaft tipped with a Glow Lantern cube, parented to armR.
const WAND_SHAFT_W = 0.06, WAND_SHAFT_LEN = 0.62;
const WAND_TIP = 0.16;
const WAND_EMISSIVE = '#FFE8A8';
const WAND_EMISSIVE_BASE = 0.55;
const WAND_EMISSIVE_AMP = 0.35;   // tip pulses brighter while conjuring
// conjuring pose: raise the wand arm and bob gently.
const ARM_RAISE = -2.0;           // armR rotation.x at full raise (rad)
const ARM_EASE = 7;               // raise/lower easing rate (1/s)
const CONJURE_BOB_AMP = 0.05;
const CONJURE_BOB_SPEED = 5.0;
const CONJURE_WAVE_AMP = 0.16;    // small wand-hand waver while building (rad)
const CONJURE_WAVE_SPEED = 6.5;
// idle life (gardener feel): breathing + blink.
const BREATH_AMP = 0.02;
const BREATH_RATE = 1.7;
const BLINK_EVERY_MIN = 3, BLINK_EVERY_MAX = 6, BLINK_TIME = 0.12;

// Per-cell hash in [0, 1) — deterministic blink phase, no random in update.
function hashCell(x, z, salt = 0) {
  let h = (Math.imul(x + salt * 101, 374761393) + Math.imul(z - salt * 53, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function createFoundry({ scene, reducedMotion = false }) {
  const world = new World(scene, {
    reducedMotion,
    origin: FOUNDRY_BUILD_ORIGIN,
    size: WORLD_SIZE,
    radius: WORLD_RADIUS,
    buildable: false,
    seeded: false,
  });
  world.load(null);
  const ox = world.origin.x, oz = world.origin.z;

  // ── the builder ─────────────────────────────────────────────────────────
  const c = createCharacter({ bodyColorIndex: BODY_COLOR });
  const group = c.group;
  const rig = c.rig;
  const armR = c.armR;
  const armL = c.armL;
  const body = c.body;
  const eyeL = c.eyeL;
  const eyeR = c.eyeR;

  // the wand, parented to the right arm so the raise carries it up.
  const cocoaMat = new THREE.MeshLambertMaterial({ color: PALETTE[12].hex });
  const tipMat = new THREE.MeshLambertMaterial({
    color: PALETTE[15].hex, emissive: WAND_EMISSIVE, emissiveIntensity: WAND_EMISSIVE_BASE,
  });
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(WAND_SHAFT_W, WAND_SHAFT_LEN, WAND_SHAFT_W)
      .translate(0, -WAND_SHAFT_LEN / 2 - 0.02, 0.06),
    cocoaMat);
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(WAND_TIP, WAND_TIP, WAND_TIP)
      .translate(0, -WAND_SHAFT_LEN - 0.02, 0.06),
    tipMat);
  shaft.castShadow = true;
  tip.castShadow = true;
  armR.add(shaft, tip);

  group.position.set(ox + LECTERN_LOCAL.x, 0, oz + LECTERN_LOCAL.z);
  group.rotation.y = FACE_YAW;
  scene.add(group);

  // ── state ─────────────────────────────────────────────────────────────────
  let queue = null;          // sorted [bx, by, bz, c] pending this build
  let qIndex = 0;            // next entry to place
  let placed = 0;            // blocks landed in the active build
  let building = false;
  let accum = 0;             // fractional placements carried between frames
  let rate = PLACE_RATE;     // cells/second for the active build
  let resolveBuild = null;   // resolves the build() Promise when the last lands

  const blinkSeed = hashCell(ox, oz, 13);
  let blinkT = BLINK_EVERY_MIN + blinkSeed * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
  let armBlend = 0;          // 0 idle → 1 fully raised (eased)

  function clear() {
    world.load(null);
    queue = null;
    qIndex = 0;
    placed = 0;
    accum = 0;
    building = false;
    // Settle any awaiter of a superseded/cancelled build so it never hangs.
    if (resolveBuild) {
      const r = resolveBuild;
      resolveBuild = null;
      r();
    }
  }

  // Place one queued cell; ration the audio + music so a flood stays calm.
  function placeOne() {
    const b = queue[qIndex++];
    const ok = world.forcePlace(ox - BUILD_HALF + b[0], b[1], oz - BUILD_HALF + b[2], b[3]);
    if (ok) {
      placed++;
      if (placed % AUDIO_EVERY === 0) audio.place();
      if (placed % MUSIC_EVERY === 0) music.notePlaced(b[1], b[3], true);
    }
  }

  function finish() {
    building = false;
    queue = null;
    if (resolveBuild) {
      const r = resolveBuild;
      resolveBuild = null;
      r();
    }
  }

  // build(blocks): clear, sort bottom-up + outward, pace into the world.
  function build(blocks) {
    clear();
    const list = Array.isArray(blocks) ? blocks : [];
    // Keep only in-range cells (build-local 0..23 → clamp/skip out of bounds).
    const valid = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.length < 4) continue;
      const bx = e[0] | 0, by = e[1] | 0, bz = e[2] | 0, ci = e[3] | 0;
      if (bx < 0 || bx >= BUILD_SPAN || bz < 0 || bz >= BUILD_SPAN) continue;
      if (by < 0 || by > Y_MAX) continue;
      valid.push([bx, by, bz, ci]);
    }
    // Grow upward, then outward from the build's horizontal center: y asc, then
    // distance from center asc. Reads as the build "growing" out of the plinth.
    const cx = (BUILD_SPAN - 1) / 2, cz = (BUILD_SPAN - 1) / 2;
    valid.sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      const da = (a[0] - cx) * (a[0] - cx) + (a[2] - cz) * (a[2] - cz);
      const db = (b[0] - cx) * (b[0] - cx) + (b[2] - cz) * (b[2] - cz);
      return da - db;
    });

    queue = valid;
    qIndex = 0;
    placed = 0;
    accum = 0;
    const n = valid.length;
    // duration in [MIN, MAX]; rate derived so small builds still take ~2s and
    // huge ones still finish by ~6s.
    const duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, n / PLACE_RATE));
    rate = n > 0 ? n / duration : PLACE_RATE;
    building = n > 0;

    return new Promise((resolve) => {
      if (n === 0) {
        resolve();
        return;
      }
      resolveBuild = resolve;
    });
  }

  // ── per-frame: pace placements, animate the builder, tick the world ───────
  function update(dt, t) {
    // pace placements
    if (building && queue) {
      let budget;
      if (reducedMotion) {
        budget = queue.length - qIndex;   // settle quickly, still sequential
      } else {
        accum += rate * dt;
        budget = accum | 0;
        if (budget > MAX_PER_TICK) budget = MAX_PER_TICK;
        accum -= budget;
      }
      for (let i = 0; i < budget && qIndex < queue.length; i++) placeOne();
      if (qIndex >= queue.length) finish();
    }

    // raise/lower the wand arm toward its target pose
    const target = building ? 1 : 0;
    armBlend += (target - armBlend) * (1 - Math.exp(-ARM_EASE * dt));
    const wave = building ? Math.sin(t * CONJURE_WAVE_SPEED) * CONJURE_WAVE_AMP * armBlend : 0;
    armR.rotation.x = ARM_RAISE * armBlend + wave;
    armL.rotation.x = -0.25 * armBlend;            // the off-hand lifts a touch too

    // the wand tip glows brighter while conjuring
    if (!reducedMotion) {
      tipMat.emissiveIntensity = WAND_EMISSIVE_BASE
        + WAND_EMISSIVE_AMP * armBlend * (0.6 + 0.4 * Math.sin(t * CONJURE_BOB_SPEED));
    }

    // gentle conjuring bob while building; idle breathing otherwise
    if (!reducedMotion) {
      rig.position.y = Math.sin(t * CONJURE_BOB_SPEED) * CONJURE_BOB_AMP * armBlend;
      const breath = BREATH_AMP * (0.5 + 0.5 * Math.sin(t * BREATH_RATE)) * (1 - armBlend);
      body.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
    }

    // blink — a quick scale-y squash, same as the player/gardener
    blinkT -= dt;
    if (blinkT <= -BLINK_TIME) {
      blinkT = BLINK_EVERY_MIN + hashCell(qIndex, placed, 7) * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
    }
    const eyeY = blinkT < 0 ? 1 - 0.88 * Math.sin(Math.PI * (-blinkT / BLINK_TIME)) : 1;
    eyeL.scale.y = eyeY;
    eyeR.scale.y = eyeY;

    world.update(dt, t);
  }

  return {
    world,
    group,
    update,
    build,
    clear,
    get building() { return building; },
    get count() { return placed; },
  };
}
