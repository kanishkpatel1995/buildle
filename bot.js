// bot.js — the gardener (CONTRACT §9): a little Sage-suited NPC who builds
// the day's authored build in real time on its own island. It catches up to
// the schedule instantly on construct, then walks to every placement — no
// teleporting — pausing to reach before each block, and putters around
// admiring its work whenever it gets ahead. Finishes at ~sunset (0.8 of the
// UTC day), then wanders and admires until midnight.

import * as THREE from 'three';
import { createCharacter } from './player.js';
import { getDayNumber, getDayFraction } from './prompts.js';
import { BOT_BUILDS } from './botbuilds.js';
import { PALETTE } from './world.js';

// ── Schedule ────────────────────────────────────────────────────────────────
const COMPLETE_AT = 0.8; // the build finishes at this fraction of the UTC day
const SCHEDULE_EVERY = 0.25; // s between clock consultations (keeps Date off the frame path)
const BEHIND_HURRY = 3; // blocks behind schedule before hurrying
const HURRY_PLACE_EVERY = 1.2; // s — cadence placements while hurrying
const HURRY_SPEED = 4.5; // u/s while behind

// ── Locomotion ──────────────────────────────────────────────────────────────
const WALK_SPEED = 2.8; // u/s
const WANDER_SPEED = 1.5; // gentle putter when done or ahead
const TURN_RATE = 10; // facing damping (1/s)
const STEP_EASE = 9; // foot height easing toward the surface (1/s)
const ARRIVE_EPS = 0.15;
const STUCK_LIMIT = 2.5; // s of no progress → place (or admire) from here
const STEER = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]; // detour angles (rad)
const NEIGHBORS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // stand cells, south first
const SCAN_TOP = 15; // builds cap at y 14, so surfaces top out here

// ── Performance & charm ─────────────────────────────────────────────────────
const REACH_TIME = 0.4; // s — pause + arm raise before each placement
const REACH_ARM = -2.1; // arm rotation at full reach (rad)
const ADMIRE_MIN = 3, ADMIRE_MAX = 6; // s spent gazing at the build
const WANDER_R_MIN = 3.5, WANDER_R_MAX = 7.5; // putter radius around the build
const STRIDE = 0.85; // matches the player's gait
const WALK_SWING = 0.55;
const ARM_SWING = 0.42;
const BOB_AMP = 0.045;
const BREATH_AMP = 0.02;
const BREATH_RATE = 1.7;
const BLINK_EVERY_MIN = 3, BLINK_EVERY_MAX = 6, BLINK_TIME = 0.12;

// ── Look ────────────────────────────────────────────────────────────────────
const BODY_COLOR = 7; // Sage
const HAT_COLOR = 9; // Honey straw hat
const HAT_BAND_COLOR = 12; // Cocoa band
const NAME = 'the gardener';
const LABEL_Y = 2.05;
const LABEL_HEX = '#F7F1E8'; // Cloud White, same as the player's label

export class Gardener {
  constructor(scene, botWorld, { reducedMotion = false } = {}) {
    this.world = botWorld;
    this.onPlace = null; // settable: (y, colorIndex) => void per animated placement
    this._reduced = reducedMotion;
    this._ox = botWorld.origin.x;
    this._oz = botWorld.origin.z;

    this._initDay(getDayNumber());

    const c = createCharacter({ bodyColorIndex: BODY_COLOR });
    this.group = c.group;
    this._rig = c.rig;
    this._legL = c.legL;
    this._legR = c.legR;
    this._armL = c.armL;
    this._armR = c.armR;
    this._body = c.body;
    this._eyeL = c.eyeL;
    this._eyeR = c.eyeR;
    this._addHat(c.head);
    this._buildLabel();

    // Spawn south of the island center, facing the build.
    this.group.position.set(this._ox + 0.5, 0, this._oz + 6.5);
    this.group.position.y = this._surfaceY(this._ox, this._oz + 6);
    this._yaw = Math.PI;
    this._targetYaw = Math.PI;
    this.group.rotation.y = this._yaw;
    scene.add(this.group);

    this._state = 'decide';
    this._schedT = 0;
    this._hurryT = 0;
    this._stuckT = 0;
    this._reachT = 0;
    this._admireT = 0;
    this._targetX = this.group.position.x;
    this._targetZ = this.group.position.z;
    this._faceX = this._centerX;
    this._faceZ = this._centerZ;
    this._phase = 0;
    this._moveBlend = 0;
    this._blinkT = BLINK_EVERY_MIN + Math.random() * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
    this._info = { name: this._name, placed: 0, total: 0, done: false };
  }

  getBuildInfo() {
    const info = this._info; // reused — callers must not retain it
    info.name = this._name;
    info.placed = this._placed;
    info.total = this._total;
    info.done = this._placed >= this._total;
    return info;
  }

  update(dt, t) {
    // The clock is consulted on a coarse timer; a UTC midnight rollover
    // clears the island and starts the next authored build.
    this._schedT -= dt;
    if (this._schedT <= 0) {
      this._schedT = SCHEDULE_EVERY;
      const day = getDayNumber();
      if (day !== this._day) {
        this.world.load(null);
        this._initDay(day);
        this._state = 'decide';
      } else {
        this._due = this._dueCount();
      }
    }

    // Hurry cadence: when well behind schedule (a long pause, a slow tab) a
    // block lands every 1.2s no matter where the feet are — the gardener
    // keeps walking, but walking never gates progress.
    const behind = this._due - this._placed;
    if (behind > BEHIND_HURRY) {
      this._hurryT += dt;
      if (this._hurryT >= HURRY_PLACE_EVERY) {
        this._hurryT -= HURRY_PLACE_EVERY;
        this._placeNext();
      }
    } else {
      this._hurryT = 0;
    }

    let moved = 0;
    switch (this._state) {
      case 'decide':
        if (this._placed < this._due) this._beginSeek();
        else this._beginAdmire();
        break;
      case 'seek':
        if (this._pending !== this._placed) {
          // the hurry cadence placed this block mid-walk — pick the next one
          this._state = 'decide';
          break;
        }
        moved = this._step(dt, behind > BEHIND_HURRY ? HURRY_SPEED : WALK_SPEED);
        if (this._distToTarget() <= ARRIVE_EPS || this._stuckT > STUCK_LIMIT) {
          this._beginReach();
        }
        break;
      case 'reach': {
        this._reachT += dt;
        const k = Math.min(this._reachT / REACH_TIME, 1);
        this._armR.rotation.x = REACH_ARM * Math.sin(Math.PI * k);
        if (k >= 1) {
          this._armR.rotation.x = 0;
          this._placeNext();
          this._state = 'decide';
        }
        break;
      }
      case 'wander':
        if (this._placed < this._due) {
          this._beginSeek();
          break;
        }
        moved = this._step(dt, WANDER_SPEED);
        if (this._distToTarget() <= ARRIVE_EPS || this._stuckT > STUCK_LIMIT) {
          this._beginAdmire();
        }
        break;
      case 'admire':
        if (this._placed < this._due) {
          this._beginSeek();
          break;
        }
        this._admireT -= dt;
        if (this._admireT <= 0) this._beginWander();
        break;
    }

    // Feet glide along the surface under the current cell — auto-step both
    // up and down, and ride catch-up blocks gracefully if one lands below.
    const gp = this.group.position;
    const surf = this._surfaceY(Math.floor(gp.x), Math.floor(gp.z));
    if (this._reduced || Math.abs(surf - gp.y) < 0.004) {
      gp.y = surf;
    } else {
      gp.y += (surf - gp.y) * (1 - Math.exp(-STEP_EASE * dt));
    }

    // Smooth shortest-arc facing.
    const d = Math.atan2(Math.sin(this._targetYaw - this._yaw), Math.cos(this._targetYaw - this._yaw));
    this._yaw += d * (1 - Math.exp(-TURN_RATE * dt));
    this.group.rotation.y = this._yaw;

    // Two-frame walk swing, distance-driven like the player's.
    this._phase += moved * (Math.PI / STRIDE);
    this._moveBlend += ((moved > 0.0005 ? 1 : 0) - this._moveBlend) * (1 - Math.exp(-10 * dt));
    const swing = Math.tanh(Math.sin(this._phase) * 2.4) * this._moveBlend;
    this._legL.rotation.x = swing * WALK_SWING;
    this._legR.rotation.x = -swing * WALK_SWING;
    this._armL.rotation.x = -swing * ARM_SWING;
    if (this._state !== 'reach') this._armR.rotation.x = swing * ARM_SWING;

    if (!this._reduced) {
      this._rig.position.y = Math.abs(Math.sin(this._phase)) * BOB_AMP * this._moveBlend;
      const breath = BREATH_AMP * (0.5 + 0.5 * Math.sin(t * BREATH_RATE)) * (1 - this._moveBlend);
      this._body.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
    }

    // Occasional blink — a quick scale-y squash, same as the player's.
    this._blinkT -= dt;
    if (this._blinkT <= -BLINK_TIME) {
      this._blinkT = BLINK_EVERY_MIN + Math.random() * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
    }
    const eyeY = this._blinkT < 0
      ? 1 - 0.88 * Math.sin(Math.PI * (-this._blinkT / BLINK_TIME))
      : 1;
    this._eyeL.scale.y = eyeY;
    this._eyeR.scale.y = eyeY;
  }

  // -- the day's build ---------------------------------------------------------

  _initDay(day) {
    this._day = day;
    const build = BOT_BUILDS[((day % 7) + 7) % 7];
    this._name = build.name;
    this._blocks = build.blocks;
    this._total = build.blocks.length;
    this._due = this._dueCount();
    this._placed = this._due;
    if (this._due > 0) {
      const bulk = new Array(this._due);
      for (let i = 0; i < this._due; i++) {
        const b = this._blocks[i];
        bulk[i] = [b[0] + this._ox, b[1], b[2] + this._oz, b[3]];
      }
      this.world.setBlocksBulk(bulk);
    }
    let sx = 0, sz = 0;
    for (const b of this._blocks) {
      sx += b[0];
      sz += b[2];
    }
    this._centerX = this._ox + sx / this._total + 0.5;
    this._centerZ = this._oz + sz / this._total + 0.5;
    this._hurryT = 0;
    this._pending = -1;
  }

  _dueCount() {
    return Math.min(this._total,
      Math.floor(Math.min(1, getDayFraction() / COMPLETE_AT) * this._total));
  }

  _placeNext() {
    if (this._placed >= this._total) return;
    const b = this._blocks[this._placed];
    this._placed++;
    this.world.forcePlace(b[0] + this._ox, b[1], b[2] + this._oz, b[3]);
    if (this.onPlace) this.onPlace(b[1], b[3]);
  }

  // -- behavior transitions ------------------------------------------------------

  _beginSeek() {
    if (this._placed >= this._total) {
      this._beginAdmire();
      return;
    }
    this._pending = this._placed;
    const b = this._blocks[this._pending];
    const bx = b[0] + this._ox, by = b[1], bz = b[2] + this._oz;
    // Stand on the friendliest adjacent cell: on the island, surface as close
    // to the block's height as possible, never hovering above the placement.
    let sx = bx, sz = bz, bestScore = Infinity;
    for (let i = 0; i < NEIGHBORS.length; i++) {
      const cx = bx + NEIGHBORS[i][0], cz = bz + NEIGHBORS[i][1];
      if (!this.world.isGroundAt(cx, cz)) continue;
      const surf = this._surfaceY(cx, cz);
      const score = Math.abs(surf - by) + (surf > by ? 1.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        sx = cx;
        sz = cz;
      }
    }
    this._targetX = sx + 0.5;
    this._targetZ = sz + 0.5;
    this._faceX = bx + 0.5;
    this._faceZ = bz + 0.5;
    this._stuckT = 0;
    this._state = 'seek';
  }

  _beginReach() {
    const gp = this.group.position;
    this._targetYaw = Math.atan2(this._faceX - gp.x, this._faceZ - gp.z);
    this._reachT = 0;
    this._state = 'reach';
  }

  _beginWander() {
    const gp = this.group.position;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = WANDER_R_MIN + Math.random() * (WANDER_R_MAX - WANDER_R_MIN);
      const x = this._centerX + Math.sin(a) * r;
      const z = this._centerZ + Math.cos(a) * r;
      if (!this.world.isGroundAt(Math.floor(x), Math.floor(z))) continue;
      if (Math.hypot(x - gp.x, z - gp.z) < 1.5) continue; // somewhere new
      this._targetX = x;
      this._targetZ = z;
      this._stuckT = 0;
      this._state = 'wander';
      return;
    }
    this._beginAdmire();
  }

  _beginAdmire() {
    const gp = this.group.position;
    if (Math.hypot(this._centerX - gp.x, this._centerZ - gp.z) > 0.5) {
      this._targetYaw = Math.atan2(this._centerX - gp.x, this._centerZ - gp.z);
    }
    this._admireT = ADMIRE_MIN + Math.random() * (ADMIRE_MAX - ADMIRE_MIN);
    this._state = 'admire';
  }

  // -- locomotion ------------------------------------------------------------------

  // One steering step toward the target: try the direct bearing first, then
  // widening detours. A move is legal when the cell is on the island mask and
  // the surface changes by at most one block (auto-step ±1). Returns the
  // distance actually walked.
  _step(dt, speed) {
    const gp = this.group.position;
    const dx = this._targetX - gp.x, dz = this._targetZ - gp.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE_EPS) return 0;
    const step = Math.min(speed * dt, dist);
    const bx = dx / dist, bz = dz / dist;
    const here = this._surfaceY(Math.floor(gp.x), Math.floor(gp.z));
    for (let i = 0; i < STEER.length; i++) {
      const ca = Math.cos(STEER[i]), sa = Math.sin(STEER[i]);
      const mx = bx * ca - bz * sa;
      const mz = bx * sa + bz * ca;
      const nx = gp.x + mx * step, nz = gp.z + mz * step;
      const cx = Math.floor(nx), cz = Math.floor(nz);
      if (!this.world.isGroundAt(cx, cz)) continue;
      if (Math.abs(this._surfaceY(cx, cz) - here) > 1) continue;
      gp.x = nx;
      gp.z = nz;
      this._targetYaw = Math.atan2(mx, mz);
      this._stuckT = 0;
      return step;
    }
    this._stuckT += dt;
    return 0;
  }

  _distToTarget() {
    const gp = this.group.position;
    return Math.hypot(this._targetX - gp.x, this._targetZ - gp.z);
  }

  // Foot height for a column: top solid block + 1, or the grass at 0.
  _surfaceY(cx, cz) {
    for (let y = SCAN_TOP; y >= 0; y--) {
      if (this.world.isSolid(cx, y, cz)) return y + 1;
    }
    return 0;
  }

  // -- look --------------------------------------------------------------------------

  _addHat(head) {
    const hatMat = new THREE.MeshLambertMaterial({ color: PALETTE[HAT_COLOR].hex });
    const bandMat = new THREE.MeshLambertMaterial({ color: PALETTE[HAT_BAND_COLOR].hex });
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.6), hatMat);
    brim.position.y = 0.305;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.36), bandMat);
    band.position.y = 0.37;
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.34), hatMat);
    crown.position.y = 0.45;
    for (const m of [brim, band, crown]) m.castShadow = true;
    head.add(brim, band, crown);
  }

  // Same canvas style as the player's name label.
  _buildLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = LABEL_Y;
    this.group.add(sprite);
    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 128);
      ctx.font = '600 56px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(43, 45, 58, 0.55)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = LABEL_HEX;
      ctx.fillText(NAME, 256, 66);
      tex.needsUpdate = true;
    };
    draw();
    if (document.fonts) document.fonts.ready.then(draw);
  }
}
