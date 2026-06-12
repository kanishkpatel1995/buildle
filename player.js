// player.js — the little wanderer: character mesh, third-person camera rig,
// movement, collision, and the tiny animations that make them feel alive.

import * as THREE from 'three';
import { PALETTE, WORLD_HEIGHT } from './world.js';

// ── Movement & physics ──────────────────────────────────────────────────────
const MOVE_SPEED = 4.3;          // u/s
const TURN_RATE = 12;            // facing rotation damping (1/s)
const AABB_HALF = 0.35;          // collision half-extent (x/z)
const AABB_HEIGHT = 1.5;
const GRAVITY = 26;              // u/s²
const TERMINAL_FALL = 12;        // u/s
const PHYS_DT_MAX = 0.05;        // clamp physics step so tab-switch frames can't tunnel
const STEP_EASE = 11;            // visual rise rate after an auto-step (1/s)
const STRIDE = 0.85;             // horizontal units per footstep
const COLL_EPS = 1e-4;
const VOID_Y = -20;              // respawn floor — below the deepest underside rock
const SPAWN_X = 1, SPAWN_Z = 16; // on the path, south of the plaza
const SPAWN_YAW = Math.PI;       // facing north (-z), toward the center

// ── Camera rig ──────────────────────────────────────────────────────────────
const CAM_FOV = 50, CAM_NEAR = 0.1, CAM_FAR = 1000;
const CAM_DIST = 10.5, CAM_DIST_MIN = 4, CAM_DIST_MAX = 18;
const CAM_PITCH = 0.18, CAM_PITCH_MIN = 0.08, CAM_PITCH_MAX = 1.25;
const CAM_TARGET_UP = 1.2;       // orbit target = feet + this
const CAM_DAMP = 5;              // follow damping: 1 - exp(-CAM_DAMP * dt)
const ORBIT_SENS = 0.005;        // radians per pixel

// ── Character look (BRIEF §4.5 — the slightly-too-big head is the charm) ────
const HEAD_HEX = '#F7F1E8';      // Cloud White
const EYE_HEX = '#2B2D3A';       // Ink
const LEG_DARKEN = 0.78;         // legs are a shaded cut of the body color
const WALK_SWING = 0.55;         // leg swing amplitude (rad)
const ARM_SWING = 0.42;
const BOB_AMP = 0.045;           // walk bob height
const BREATH_AMP = 0.02;         // idle breathing scale
const BREATH_RATE = 1.7;
const BLINK_EVERY_MIN = 3, BLINK_EVERY_MAX = 6, BLINK_TIME = 0.12;
const LABEL_Y = 2.05;            // ~0.6 above the head

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Builds the little wanderer mesh — shared by the Player and any NPC (the
// gardener). The returned group is NOT added to any scene; the rig inside it
// holds every animated part so a walk bob can move the whole character while
// group.position stays the clean physics foot point. All parts cast shadows.
export function createCharacter({ bodyColorIndex, headHex = HEAD_HEX } = {}) {
  const valid = Number.isInteger(bodyColorIndex)
    && bodyColorIndex >= 0 && bodyColorIndex < PALETTE.length;
  const idx = valid ? bodyColorIndex : 1 + Math.floor(Math.random() * 14); // a mid-tone, never glow
  const bodyHex = PALETTE[idx].hex;

  const headMat = new THREE.MeshLambertMaterial({ color: headHex });
  const eyeMat = new THREE.MeshLambertMaterial({ color: EYE_HEX });
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyHex });
  const legMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(bodyHex).multiplyScalar(LEG_DARKEN),
  });

  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const legGeo = new THREE.BoxGeometry(0.13, 0.36, 0.14).translate(0, -0.18, 0);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.105, 0.36, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.105, 0.36, 0);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.56, 0.26).translate(0, 0.28, 0), bodyMat);
  body.position.y = 0.33;

  const armGeo = new THREE.BoxGeometry(0.11, 0.34, 0.12).translate(0, -0.17, 0);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.26, 0.84, 0);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.26, 0.84, 0);

  // Head: slightly wider than the body on purpose. Eyes sit proud of the
  // local +z face, which is the direction the character walks.
  const head = new THREE.Group();
  head.position.y = 1.16;
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.52), headMat);
  const eyeGeo = new THREE.BoxGeometry(0.075, 0.1, 0.03);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.115, 0.02, 0.265);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.115, 0.02, 0.265);
  head.add(headMesh, eyeL, eyeR);

  rig.add(legL, legR, body, armL, armR, head);
  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, rig, legL, legR, armL, armR, body, head, eyeL, eyeR };
}

export class Player {
  constructor(scene, world, { name, bodyColorIndex, reducedMotion = false }) {
    this.world = world;
    this._reduced = reducedMotion;

    this.camera = new THREE.PerspectiveCamera(
      CAM_FOV, (window.innerWidth / window.innerHeight) || 1, CAM_NEAR, CAM_FAR);
    this.group = new THREE.Group();
    this.position = this.group.position;
    this.onFootstep = null;
    this.externalCamera = false; // true → views.js drives the camera, not update()

    // Physics state. group.position.y is the eased visual foot height;
    // _physY is the authoritative one collision runs against.
    this._physY = 0;
    this._velY = 0;
    this._grounded = true;
    this._yaw = SPAWN_YAW;
    this._inX = 0;
    this._inZ = 0;

    this._camYaw = 0;
    this._pitch = CAM_PITCH;
    this._dist = CAM_DIST;

    this._phase = 0;             // walk cycle phase (π per stride)
    this._moveBlend = 0;
    this._stepDist = 0;
    this._stepAlt = false;
    this._blinkT = BLINK_EVERY_MIN + Math.random() * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);

    // Scratch vectors — update() allocates nothing.
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._center = new THREE.Vector3();

    this._buildBody(bodyColorIndex);
    this._buildLabel(name);

    this.group.position.set(SPAWN_X, 0, SPAWN_Z);
    this.group.rotation.y = this._yaw;
    scene.add(this.group);

    // Camera starts at its final pose — there is never a spawn snap.
    this._desiredCamera(this._desired);
    this.camera.position.copy(this._desired);
    this._look.set(this.position.x, CAM_TARGET_UP, this.position.z);
    this.camera.lookAt(this._look);
  }

  // Intent in camera space: +x strafes right, -z is away from the camera
  // (three.js camera convention: forward = -z, so W sends z = -1).
  setMoveInput(x, z) {
    const m = Math.hypot(x, z);
    const s = m > 1 ? 1 / m : 1;
    this._inX = x * s;
    this._inZ = z * s;
  }

  orbit(dx, dy) {
    this._camYaw -= dx * ORBIT_SENS;
    this._pitch = clamp(this._pitch + dy * ORBIT_SENS, CAM_PITCH_MIN, CAM_PITCH_MAX);
  }

  zoom(delta) {
    this._dist = clamp(this._dist * (1 + delta * 0.001), CAM_DIST_MIN, CAM_DIST_MAX);
  }

  setName(name) {
    this._name = String(name ?? '').trim() || 'wanderer';
    this._drawLabel();
  }

  // Swap the collision world (island travel). Coordinates stay global.
  setWorld(world) {
    this.world = world;
  }

  getCenter() {
    return this._center.set(this.position.x, this.position.y + 0.75, this.position.z);
  }

  // Does cell (x,y,z) intersect the character's collision box? Placement is
  // rejected for these cells so you can't build inside (or entomb) yourself.
  // Mirrors _collides()' cell math, against the authoritative physics height.
  overlapsCell(x, y, z) {
    const p = this.position;
    return (
      x >= Math.floor(p.x - AABB_HALF) && x <= Math.floor(p.x + AABB_HALF - COLL_EPS) &&
      z >= Math.floor(p.z - AABB_HALF) && z <= Math.floor(p.z + AABB_HALF - COLL_EPS) &&
      y >= Math.floor(this._physY + COLL_EPS) && y <= Math.floor(this._physY + AABB_HEIGHT - COLL_EPS)
    );
  }

  update(dt, t) {
    const pdt = clamp(dt, 0, PHYS_DT_MAX);
    const ox = this.position.x, oz = this.position.z;

    // Camera-relative intent → world-space move direction.
    const moving = this._inX !== 0 || this._inZ !== 0;
    let mx = 0, mz = 0;
    if (moving) {
      const fx = -Math.sin(this._camYaw), fz = -Math.cos(this._camYaw); // ground-plane forward
      mx = fx * -this._inZ - fz * this._inX;
      mz = fz * -this._inZ + fx * this._inX;
      this._moveAxis(mx * MOVE_SPEED * pdt, 0);
      this._moveAxis(0, mz * MOVE_SPEED * pdt);
    }

    // Gravity, then land on whatever the feet sank into.
    this._velY = Math.max(this._velY - GRAVITY * pdt, -TERMINAL_FALL);
    const ny = this._physY + this._velY * pdt;
    if (this._hitsFloor(this.position.x, ny, this.position.z)) {
      this._physY = Math.floor(ny + COLL_EPS) + 1;
      this._velY = 0;
      this._grounded = true;
    } else {
      this._physY = ny;
      this._grounded = false;
    }

    // Losing your support block over the void must never soft-lock the
    // session: below the island, glide home to spawn.
    if (this._physY < VOID_Y) {
      this.position.set(SPAWN_X, 0, SPAWN_Z);
      this._physY = 0;
      this._velY = 0;
      this._grounded = true;
      this.group.position.y = 0;
    }

    // Visual y: falling tracks physics exactly; step-ups ease upward.
    const gp = this.group.position;
    if (this._reduced || this._physY <= gp.y) {
      gp.y = this._physY;
    } else {
      gp.y += (this._physY - gp.y) * (1 - Math.exp(-STEP_EASE * dt));
      if (this._physY - gp.y < 0.004) gp.y = this._physY;
    }

    // Footsteps: alternate every STRIDE units actually travelled.
    const moved = Math.hypot(this.position.x - ox, this.position.z - oz);
    if (this._grounded && moved > 0) {
      this._stepDist += moved;
      if (this._stepDist >= STRIDE) {
        this._stepDist -= STRIDE;
        this._stepAlt = !this._stepAlt;
        if (this.onFootstep) this.onFootstep(this._stepAlt);
      }
    }

    // Smooth shortest-arc facing toward the move direction.
    if (moving) {
      const target = Math.atan2(mx, mz);
      const d = Math.atan2(Math.sin(target - this._yaw), Math.cos(target - this._yaw));
      this._yaw += d * (1 - Math.exp(-TURN_RATE * dt));
      this.group.rotation.y = this._yaw;
    }

    // Walk cycle driven by distance, flattened sine for a soft two-frame feel.
    this._phase += moved * (Math.PI / STRIDE);
    this._moveBlend += ((moving && this._grounded ? 1 : 0) - this._moveBlend)
      * (1 - Math.exp(-10 * dt));
    const swing = Math.tanh(Math.sin(this._phase) * 2.4) * this._moveBlend;
    this._legL.rotation.x = swing * WALK_SWING;
    this._legR.rotation.x = -swing * WALK_SWING;
    this._armL.rotation.x = -swing * ARM_SWING;
    this._armR.rotation.x = swing * ARM_SWING;

    if (!this._reduced) {
      this._rig.position.y = Math.abs(Math.sin(this._phase)) * BOB_AMP * this._moveBlend;
      const breath = BREATH_AMP * (0.5 + 0.5 * Math.sin(t * BREATH_RATE)) * (1 - this._moveBlend);
      this._body.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
    }

    // Blink: a quick scale-y squash every few seconds.
    this._blinkT -= dt;
    if (this._blinkT <= -BLINK_TIME) {
      this._blinkT = BLINK_EVERY_MIN + Math.random() * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
    }
    const eyeY = this._blinkT < 0
      ? 1 - 0.88 * Math.sin(Math.PI * (-this._blinkT / BLINK_TIME))
      : 1;
    this._eyeL.scale.y = eyeY;
    this._eyeR.scale.y = eyeY;

    // Damped third-person follow; orbit inputs steer the desired pose,
    // the camera glides toward it and never snaps. While views.js drives the
    // camera, only the look target keeps tracking the player so handing
    // control back lands exactly where the follow rig expects.
    if (this.externalCamera) {
      this._look.set(gp.x, gp.y + CAM_TARGET_UP, gp.z);
    } else {
      this._desiredCamera(this._desired);
      const k = 1 - Math.exp(-CAM_DAMP * dt);
      this.camera.position.lerp(this._desired, k);
      this._look.lerp(this._tmp.set(gp.x, gp.y + CAM_TARGET_UP, gp.z), k);
      this.camera.lookAt(this._look);
    }
  }

  _desiredCamera(out) {
    const gp = this.group.position;
    const c = Math.cos(this._pitch) * this._dist;
    out.set(
      gp.x + Math.sin(this._camYaw) * c,
      gp.y + CAM_TARGET_UP + Math.sin(this._pitch) * this._dist,
      gp.z + Math.cos(this._camYaw) * c);
  }

  // One horizontal axis at a time, so the other keeps sliding along walls.
  _moveAxis(dx, dz) {
    if (dx === 0 && dz === 0) return;
    const p = this.position;
    const nx = p.x + dx, nz = p.z + dz;
    if (!this._collides(nx, this._physY, nz)) {
      p.x = nx;
      p.z = nz;
      return;
    }
    // Auto-step: exactly one block up, only when grounded, with headroom
    // both where we are and where we're going.
    if (this._grounded) {
      const stepY = Math.round(this._physY) + 1;
      if (!this._collides(nx, stepY, nz) && !this._collides(p.x, stepY, p.z)) {
        this._physY = stepY;
        p.x = nx;
        p.z = nz;
      }
    }
  }

  // AABB vs voxel grid. Off-island columns with nothing to stand on count as
  // walls at every height, so nobody ever strolls into the sky.
  _collides(px, py, pz) {
    const x0 = Math.floor(px - AABB_HALF), x1 = Math.floor(px + AABB_HALF - COLL_EPS);
    const z0 = Math.floor(pz - AABB_HALF), z1 = Math.floor(pz + AABB_HALF - COLL_EPS);
    const y0 = Math.floor(py + COLL_EPS), y1 = Math.floor(py + AABB_HEIGHT - COLL_EPS);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        if (!this.world.isGroundAt(cx, cz) && !this._hasSupport(cx, cz, y0)) return true;
        for (let cy = y0; cy <= y1; cy++) {
          if (this.world.isSolid(cx, cy, cz)) return true;
        }
      }
    }
    return false;
  }

  _hasSupport(cx, cz, feetCellY) {
    for (let y = Math.min(feetCellY, WORLD_HEIGHT) - 1; y >= 0; y--) {
      if (this.world.isSolid(cx, y, cz)) return true;
    }
    return false;
  }

  _hitsFloor(px, ny, pz) {
    const cy = Math.floor(ny + COLL_EPS);
    const x0 = Math.floor(px - AABB_HALF), x1 = Math.floor(px + AABB_HALF - COLL_EPS);
    const z0 = Math.floor(pz - AABB_HALF), z1 = Math.floor(pz + AABB_HALF - COLL_EPS);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        if (this.world.isSolid(cx, cy, cz)) return true;
      }
    }
    return false;
  }

  _buildBody(bodyColorIndex) {
    const c = createCharacter({ bodyColorIndex });
    this._rig = c.rig;
    this._legL = c.legL;
    this._legR = c.legR;
    this._body = c.body;
    this._armL = c.armL;
    this._armR = c.armR;
    this._head = c.head;
    this._eyeL = c.eyeL;
    this._eyeR = c.eyeR;
    // Adopt the rig directly — same hierarchy as before the extraction
    // (group → rig); createCharacter's wrapper group is discarded.
    this.group.add(this._rig);
  }

  _buildLabel(name) {
    this._name = String(name ?? '').trim() || 'wanderer';
    this._labelCanvas = document.createElement('canvas');
    this._labelCanvas.width = 512;
    this._labelCanvas.height = 128;
    this._labelTexture = new THREE.CanvasTexture(this._labelCanvas);
    this._labelTexture.colorSpace = THREE.SRGBColorSpace;
    this._label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._labelTexture, transparent: true, depthWrite: false,
    }));
    this._label.scale.set(1.6, 0.4, 1);
    this._label.position.y = LABEL_Y;
    this.group.add(this._label);
    this._drawLabel();
    if (document.fonts) document.fonts.ready.then(() => this._drawLabel());
  }

  _drawLabel() {
    const ctx = this._labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    let size = 56; // 28px at the canvas's 2x resolution
    ctx.font = `600 ${size}px Nunito, sans-serif`;
    const w = ctx.measureText(this._name).width;
    if (w > 460) {
      size = Math.max(22, Math.floor((size * 460) / w));
      ctx.font = `600 ${size}px Nunito, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(43, 45, 58, 0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = HEAD_HEX;
    ctx.fillText(this._name, 256, 66);
    this._labelTexture.needsUpdate = true;
  }
}
