// views.js — external camera modes (photo mode, sky view) and cinematic drone
// paths. Owns player.camera whenever the player doesn't (player.externalCamera),
// and every mode change is a damped glide — the camera never snaps.

import * as THREE from 'three';

// ── Transitions ──────────────────────────────────────────────────────────
const GLIDE_DAMP = 3;             // damped lerp factor: 1 - exp(-GLIDE_DAMP·dt)
const HANDOFF_DIST = 0.5;         // returning glide hands back within this range
const FOLLOW_TARGET_UP = 1.2;     // matches CAM_TARGET_UP in player.js

// ── Orbit feel (sensitivities match player.js) ───────────────────────────
const ORBIT_SENS = 0.005;         // radians per pixel
const ZOOM_SCALE = 0.001;         // wheel delta → distance factor

// ── Photo mode ───────────────────────────────────────────────────────────
const PHOTO_DIST_MIN = 4, PHOTO_DIST_MAX = 90;
const PHOTO_PITCH_MIN = 0.05, PHOTO_PITCH_MAX = 1.35;
const PHOTO_IDLE_S = 8;           // seconds without input before auto-drift
const PHOTO_DRIFT = 0.03;         // rad/s

// ── Sky view ─────────────────────────────────────────────────────────────
const SKY_DIST = 46;
const SKY_DIST_MIN = 30, SKY_DIST_MAX = 140;   // sky view zoom range
const SKY_PITCH = 1.15;
const SKY_ORBIT = 0.05;           // rad/s

// ── Drone paths ──────────────────────────────────────────────────────────
const LOOK_UP_FRAC = 0.12;        // look target sits this ×radius above center
const LOOK_AHEAD_FRAC = 0.11;     // look-ahead along travel, ×radius
const BOB_CYCLES = 2;             // full sine bobs across one path traversal
const BOB_AMP_FRAC = 0.018;       // bob amplitude, ×radius
const BOB_AMP_MIN = 0.25;

// sunsetRing: starts slightly low and behind the current view, rises as it
// circles, and eases back down so the closed loop stays continuous.
const RING_H = [0.18, 0.24, 0.34, 0.46, 0.55, 0.57, 0.48, 0.32]; // height ×radius
const RING_R = [1.0, 1.05, 1.1, 1.06, 1.0, 0.94, 0.9, 0.95];     // radius ×radius

// lowFlyby: a low lateral sweep past the center. [forward, right, height] ×radius
// in a frame whose forward axis points from the center toward the current camera.
const FLYBY = [
  [1.4, 0.5, 0.34],
  [0.7, 0.55, 0.2],
  [0, 0.5, 0.13],
  [-0.7, 0.35, 0.18],
  [-1.4, 0.1, 0.32],
];

// riseReveal: close and low, spiralling up and out to a high 3/4 reveal.
// [angle offset ×π from the camera side, radius ×radius, height ×radius]
const REVEAL = [
  [0, 0.55, 0.1],
  [0.35, 0.7, 0.26],
  [0.7, 0.9, 0.5],
  [1.05, 1.1, 0.78],
  [1.4, 1.25, 1.05],
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Views {
  constructor(player, { reducedMotion = false } = {}) {
    this.player = player;
    this.mode = 'follow';
    this._reduced = reducedMotion;
    this._returning = false;      // gliding home; player re-takes camera when close
    this._driven = false;         // capture.js poses the camera directly
    this._yaw = 0;
    this._pitch = SKY_PITCH;
    this._dist = SKY_DIST;
    this._idleT = 0;

    // Scratch vectors — update() allocates nothing.
    this._center = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._scratch = new THREE.Vector3();
    this._target = new THREE.Vector3();
  }

  setMode(mode, { center } = {}) {
    if (this._driven) return;     // capture owns the camera until it ends the drive

    if (mode === 'photo' || mode === 'sky') {
      this.mode = mode;
      this._returning = false;
      this._center.copy(center ?? this.player.getCenter());
      // Seed the orbit from the camera's current pose relative to the new
      // center, so the takeover continues from exactly where the camera is.
      const cam = this.player.camera;
      this._scratch.copy(cam.position).sub(this._center);
      const len = this._scratch.length() || 1;
      this._yaw = Math.atan2(this._scratch.x, this._scratch.z);
      if (mode === 'photo') {
        this._pitch = clamp(
          Math.asin(clamp(this._scratch.y / len, -1, 1)), PHOTO_PITCH_MIN, PHOTO_PITCH_MAX);
        this._dist = clamp(len, PHOTO_DIST_MIN, PHOTO_DIST_MAX);
      } else {
        this._pitch = SKY_PITCH;
        this._dist = SKY_DIST;
      }
      this._idleT = 0;
      this._seedLook(this._center);
      this.player.externalCamera = true;
      return;
    }

    // mode === 'follow' — glide home. The player re-takes the camera only once
    // the transition has closed to within HANDOFF_DIST, never immediately.
    if (this.mode === 'follow' && !this.player.externalCamera) return;
    this.mode = 'follow';
    this._returning = true;
    this._seedLook(this._followLook(this._target));
  }

  update(dt, _t) {
    if (this._driven) return;
    const cam = this.player.camera;

    if (this.mode === 'follow') {
      if (!this._returning) return;
      const k = 1 - Math.exp(-GLIDE_DAMP * dt);
      this.player._desiredCamera(this._desired);
      this._followLook(this._target);
      cam.position.lerp(this._desired, k);
      this._look.lerp(this._target, k);
      cam.lookAt(this._look);
      if (cam.position.distanceTo(this._desired) < HANDOFF_DIST) {
        this._returning = false;
        this.player.externalCamera = false;
        // hand the player a matching look target so its first lookAt is seamless
        if (this.player._look) this.player._look.copy(this._look);
      }
      return;
    }

    if (this.mode === 'photo') {
      this._idleT += dt;
      if (!this._reduced && this._idleT >= PHOTO_IDLE_S) this._yaw += PHOTO_DRIFT * dt;
    } else if (!this._reduced) {
      this._yaw += SKY_ORBIT * dt;
    }

    const k = 1 - Math.exp(-GLIDE_DAMP * dt);
    const c = Math.cos(this._pitch) * this._dist;
    this._desired.set(
      this._center.x + Math.sin(this._yaw) * c,
      this._center.y + Math.sin(this._pitch) * this._dist,
      this._center.z + Math.cos(this._yaw) * c);
    cam.position.lerp(this._desired, k);
    this._look.lerp(this._center, k);
    cam.lookAt(this._look);
  }

  orbit(dx, dy) {
    if (this.mode !== 'photo' || this._driven) return;
    this._yaw -= dx * ORBIT_SENS;
    this._pitch = clamp(this._pitch + dy * ORBIT_SENS, PHOTO_PITCH_MIN, PHOTO_PITCH_MAX);
    this._idleT = 0;
  }

  zoom(delta) {
    if (this._driven) return;
    if (this.mode === 'photo') {
      this._dist = clamp(this._dist * (1 + delta * ZOOM_SCALE), PHOTO_DIST_MIN, PHOTO_DIST_MAX);
      this._idleT = 0;
    } else if (this.mode === 'sky') {
      this._dist = clamp(this._dist * (1 + delta * ZOOM_SCALE), SKY_DIST_MIN, SKY_DIST_MAX);
    }
  }

  // → { getPose(u, outPos, outLook) }, u ∈ [0,1]. Paths start near the current
  // camera azimuth so entering a path never cuts to the far side of the island.
  makeDronePath(name, center, radius) {
    const cam = this.player.camera.position;
    const a0 = Math.atan2(cam.x - center.x, cam.z - center.z);
    const pts = [];
    if (name === 'lowFlyby') {
      const fx = Math.sin(a0), fz = Math.cos(a0);   // center → camera side
      const rx = fz, rz = -fx;                      // right of forward
      for (const [f, r, h] of FLYBY) {
        pts.push(new THREE.Vector3(
          center.x + (fx * f + rx * r) * radius,
          center.y + h * radius,
          center.z + (fz * f + rz * r) * radius));
      }
    } else if (name === 'riseReveal') {
      for (const [a, r, h] of REVEAL) {
        const ang = a0 + a * Math.PI;
        pts.push(new THREE.Vector3(
          center.x + Math.sin(ang) * r * radius,
          center.y + h * radius,
          center.z + Math.cos(ang) * r * radius));
      }
    } else {  // 'sunsetRing'
      for (let i = 0; i < RING_H.length; i++) {
        const ang = a0 + (i / RING_H.length) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          center.x + Math.sin(ang) * RING_R[i] * radius,
          center.y + RING_H[i] * radius,
          center.z + Math.cos(ang) * RING_R[i] * radius));
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, name !== 'lowFlyby' && name !== 'riseReveal', 'centripetal');
    curve.getLength();    // pre-warm the arc-length cache so the first pose is cheap
    const focus = center.clone();
    focus.y += radius * LOOK_UP_FRAC;
    const ahead = radius * LOOK_AHEAD_FRAC;
    const bobAmp = Math.max(BOB_AMP_MIN, radius * BOB_AMP_FRAC);
    const tangent = new THREE.Vector3();
    return {
      getPose(u, outPos, outLook) {
        const uu = clamp(u, 0, 1);
        curve.getPointAt(uu, outPos);
        outPos.y += bobAmp * Math.sin(uu * Math.PI * 2 * BOB_CYCLES);
        curve.getTangentAt(uu, tangent);
        tangent.y = 0;
        const len = tangent.length();
        outLook.copy(focus);
        // a small look-ahead into the turn keeps bends feeling cinematic
        if (len > 1e-5) outLook.addScaledVector(tangent, ahead / len);
        return outPos;
      },
    };
  }

  // ── Internal handshake for capture.js ───────────────────────────────────
  // While "driven", capture poses player.camera directly every frame, so
  // update() must leave it alone and setMode() must ignore stray inputs.
  // mode reads 'photo' so main treats filming as an external-camera state
  // (no ghost cube in the clip, movement input parked).
  _beginExternalDrive() {
    this._driven = true;
    this._returning = false;
    this.mode = 'photo';
    this.player.externalCamera = true;
  }

  _endExternalDrive() {
    this._driven = false;
  }

  // Seed the eased look target along the camera's CURRENT view direction at
  // the distance of the upcoming target, so the first lookAt of a transition
  // matches the current orientation exactly — no rotational snap.
  _seedLook(target) {
    const cam = this.player.camera;
    const d = cam.position.distanceTo(target);
    cam.getWorldDirection(this._scratch);
    this._look.copy(cam.position).addScaledVector(this._scratch, d);
  }

  _followLook(out) {
    const p = this.player.position;
    return out.set(p.x, p.y + FOLLOW_TARGET_UP, p.z);
  }
}
