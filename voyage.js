// voyage.js — the Voyage: archipelago map mode, island flights, and arrival
// choreography (CONTRACT-W3). The compass lifts the camera to a fixed voyage
// altitude where the real archipelago is the map — loaded islands stand as
// live meshes, everything else as baked billboard impostors. Selecting an
// island raises its card; sailing flies a Bézier arc whose final stretch
// hides any meshing still in flight inside a cloud hold.

import * as THREE from 'three';
import { music } from './music.js';

// ── tunables ────────────────────────────────────────────────────────────────

// Map mode (the ascent). One canonical pose for every departure island —
// computed so the WHOLE ring (x −183..117, z −191..175 with radii) sits inside
// a 30° fov at landscape aspect; the contract's island-relative (0,140,95)
// left the southern arc behind the camera from the plaza.
const OPEN_S_MIN = 1.2, OPEN_S_MAX = 1.8;   // ascent scales with distance
const OPEN_DIST_REF = 320;             // ascent runs OPEN_S_MIN per this many units
const MAP_CAM = { x: 20, y: 280, z: 380 };
const MAP_LOOK = { x: 20, y: 0, z: 28 };    // pitch ≈ −38°, due north over the ring
const VOYAGE_FOV = 30;                  // map fov at the reference (landscape) aspect
const MAP_REF_ASPECT = 1.6;             // MAP_CAM was framed for this aspect
const MAP_FOV_MAX = 52;                 // widen on portrait phones so the whole ring fits
const FOG_VOYAGE = 0.001;              // below main's floor — the map reads at 400–600u

// Flight
const FLIGHT_S_MIN = 2.6, FLIGHT_S_MAX = 3.4;
const FLIGHT_DIST_NEAR = 80, FLIGHT_DIST_FAR = 280;  // duration scales across this
const FLIGHT_LIFT = 30;                // Bézier control-point lift above the chord
const ARRIVE_BACK = 14;                // arrival camera sits this far beyond the dock
const ARRIVE_UP = 9;
const FOCAL_UP = 6;                    // island focal center = origin + this
const FOV_CRUISE = 25, FOV_DESCENT = 50;
const ARRIVE_LEAD_S = 1.0;             // teleport fires this long before touchdown
const RETARGET_RATE = 3;               // provisional dock → real dock blend (1/s)

// Cloud hold — when the destination is still meshing at 80% of the flight
const HOLD_AT = 0.8;
const HOLD_CREEP = 0.86;               // u keeps drifting toward this while held
const HOLD_CREEP_RATE = 0.55;          // 1/s — never stops moving, never arrives
const HOLD_ORBIT_R = 12;
const HOLD_ORBIT_W = 0.5;              // rad/s
const HOLD_R_RATE = 1.7;               // orbit radius bloom (1/s)
const HOLD_R_DECAY = 5;                // orbit radius decay after release (1/s)
const HOLD_FADE_SPAN = 0.2;            // residual orbit offset gone over this much u
const CLOUD_SPAWN_AT = 0.65;           // clouds gather ahead of the hold point
const CLOUD_COLOR = '#F7E2D0';
const CLOUD_SCALE = 34;
const CLOUD_OPACITY = 0.92;
const CLOUD_IN_S = 0.6, CLOUD_OUT_S = 0.8;
const CLOUD_DRIFT = 0.8;               // u/s
const CLOUD_JITTER_XZ = 5, CLOUD_JITTER_Y = 2.5;

// Map-mode dressing
const BOB_AMP = 0.5;                   // impostor bob amplitude
const BOB_PERIOD = 8;                  // s
const PICK_RADIUS_K = 1.2;             // picking sphere = island radius × this
const PICK_Y = 8;                      // picking sphere center height
const LRU_EXTRA = 2;                   // loaded showcase islands beyond the current

const TAP_MS = 350, TAP_PX = 10;
const FOV_EPS = 0.01;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// inverse of easeInOutCubic on its upper half (u ≥ 0.5) — hold resume only
const easeInvUpper = (u) => 1 - Math.cbrt(2 * (1 - u)) / 2;

export function createVoyage({
  scene, renderer, player, views, ui,
  islands, residents, reducedMotion, onArrive,
}) {
  const { ISLANDS, loadShowcase, bakeImpostor } = islands;

  // Dev islands join the map only when the localStorage flag names them —
  // the honest version of the deleted W1 hook ('1' = legacy test-isle).
  let devId = null;
  try {
    const v = localStorage.getItem('buildle_testisle');
    if (v) devId = v === '1' ? 'test-isle' : v;
  } catch { /* storage may be walled off */ }
  const list = ISLANDS.filter((meta) => !meta.dev || meta.id === devId);

  const group = new THREE.Group();
  group.name = 'voyage';
  scene.add(group);

  // ── registry ──────────────────────────────────────────────────────────────
  // One entry per island: load state, impostor sprite, and a generous invisible
  // picking sphere (sprites are thin — spheres make mobile taps land).

  const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
  const sphereMat = new THREE.MeshBasicMaterial();
  const entries = new Map();
  list.forEach((meta, i) => {
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(meta.origin.x, PICK_Y, meta.origin.z);
    sphere.scale.setScalar(meta.radius * PICK_RADIUS_K);
    sphere.visible = false;            // raycastable, never rendered
    sphere.userData.islandId = meta.id;
    group.add(sphere);
    entries.set(meta.id, {
      meta,
      sphere,
      resident: meta.kind === 'plaza' || meta.kind === 'gardener',
      state: 'unloaded',               // 'loading' | 'loaded' (residents stay put)
      isle: null,
      promise: null,
      keep: false,                     // selected/sailed-to — bake must not dispose it
      lastTouch: 0,
      impostor: null,
      bobBase: 0,
      bobPhase: (i / list.length) * Math.PI * 2,
    });
  });

  // ── state ─────────────────────────────────────────────────────────────────

  let state = 'closed';                // 'opening' | 'map' | 'flight'
  let currentIsland = 'plaza';
  let selectedId = null;
  let openT = 0;
  let openS = OPEN_S_MIN;
  let startFov = 0;
  let startFog = 0;
  let mapFov = VOYAGE_FOV;              // recomputed per-open for the live aspect
  let bakeStarted = false;
  let flight = null;

  // The map camera is framed for a landscape aspect; on a narrower (portrait)
  // viewport widen the fov so the whole archipelago still fits horizontally.
  function computeMapFov() {
    const aspect = (window.innerWidth || 1) / (window.innerHeight || 1);
    return Math.min(MAP_FOV_MAX, VOYAGE_FOV * Math.max(1, MAP_REF_ASPECT / aspect));
  }

  const startPos = new THREE.Vector3();
  const startLook = new THREE.Vector3();
  const mapPos = new THREE.Vector3();
  const mapLook = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickTargets = [];
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const c1 = new THREE.Vector3();
  const c2 = new THREE.Vector3();

  // ── loading & impostors ───────────────────────────────────────────────────

  // Never rejects — callers read entry.state afterwards. A failed load resets
  // to 'unloaded' so a later select or the flight hold can retry it.
  function ensureLoaded(id) {
    const entry = entries.get(id);
    if (entry.resident || entry.state === 'loaded') return Promise.resolve(entry);
    if (entry.state === 'loading') return entry.promise;
    entry.state = 'loading';
    entry.promise = loadShowcase(id, scene, { reducedMotion })
      .then((isle) => {
        entry.isle = isle;
        entry.state = 'loaded';
        if (entry.impostor) entry.impostor.visible = false;
        return entry;
      })
      .catch(() => {
        entry.state = 'unloaded';
        entry.promise = null;
        return entry;
      });
    return entry.promise;
  }

  // First open: bake a billboard for every showcase island, one island at a
  // time — each load is already frame-paced, the bake itself is one render.
  // Islands the player meanwhile selected (keep) stay loaded; the rest are
  // disposed right after their portrait is taken.
  async function bakeAll() {
    for (const entry of entries.values()) {
      if (entry.resident || entry.impostor || entry.meta.kind !== 'showcase') continue;
      await ensureLoaded(entry.meta.id);
      if (entry.state !== 'loaded') continue;   // load failed — sphere still picks it
      const sprite = bakeImpostor(renderer, scene, entry.isle);
      sprite.userData.islandId = entry.meta.id;
      entry.impostor = sprite;
      entry.bobBase = sprite.position.y;
      group.add(sprite);
      if (!entry.keep && entry.meta.id !== currentIsland) {
        entry.isle.dispose();
        entry.isle = null;
        entry.state = 'unloaded';
        entry.promise = null;
      }
      sprite.visible = entry.state !== 'loaded';
    }
  }

  // At most LRU_EXTRA showcase islands stay loaded beyond the current one;
  // the least-recently-visited goes back to being a billboard.
  function pruneLRU() {
    const loaded = [];
    for (const entry of entries.values()) {
      if (!entry.resident && entry.state === 'loaded' && entry.meta.id !== currentIsland) {
        loaded.push(entry);
      }
    }
    loaded.sort((a, b) => b.lastTouch - a.lastTouch);
    for (const entry of loaded.slice(LRU_EXTRA)) {
      entry.isle.dispose();
      entry.isle = null;
      entry.state = 'unloaded';
      entry.promise = null;
      entry.keep = false;
      if (entry.impostor) entry.impostor.visible = true;
    }
  }

  // ── selection ─────────────────────────────────────────────────────────────

  function pickAt(clientX, clientY) {
    ndc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, player.camera);
    pickTargets.length = 0;
    for (const entry of entries.values()) {
      pickTargets.push(entry.sphere);
      if (entry.impostor && entry.impostor.visible) pickTargets.push(entry.impostor);
    }
    const hits = raycaster.intersectObjects(pickTargets, false);
    return hits.length > 0 ? hits[0].object.userData.islandId : null;
  }

  function select(id) {
    if (state !== 'map') return;
    selectedId = id;
    const entry = entries.get(id);
    entry.keep = true;
    entry.lastTouch = performance.now();
    // prefetch — begin meshing while the player decides
    if (!entry.resident && entry.state === 'unloaded') ensureLoaded(id);
    ui.voyageCard({
      name: entry.meta.name,
      epithet: entry.meta.epithet,
      current: id === currentIsland,
      onSail: () => sail(id),
      onStay: () => close(),
    });
  }

  // ── open / close ──────────────────────────────────────────────────────────

  function open() {
    if (state !== 'closed') return;
    state = 'opening';
    openT = 0;
    music.duck();
    views._beginExternalDrive();
    const cam = player.camera;
    startPos.copy(cam.position);
    startFov = cam.fov;
    startFog = scene.fog.density;
    mapFov = computeMapFov();
    mapPos.set(MAP_CAM.x, MAP_CAM.y, MAP_CAM.z);
    mapLook.set(MAP_LOOK.x, MAP_LOOK.y, MAP_LOOK.z);
    openS = Math.min(OPEN_S_MAX, Math.max(OPEN_S_MIN,
      OPEN_S_MIN * (startPos.distanceTo(mapPos) / OPEN_DIST_REF)));
    // seed the eased look along the current view direction at the distance of
    // the target, so the first frame matches the camera's orientation exactly
    cam.getWorldDirection(v1);
    startLook.copy(cam.position).addScaledVector(v1, cam.position.distanceTo(mapLook));
    selectedId = null;
    ui.setVoyaging(true);
    if (!bakeStarted) {
      bakeStarted = true;
      bakeAll();
    }
  }

  function close() {
    if (state !== 'opening' && state !== 'map') return;
    state = 'closed';
    selectedId = null;
    ui.hideVoyageCard();
    ui.setVoyaging(false);
    // hand the camera home; player.update re-eases fov, main re-eases fog
    views._endExternalDrive();
    views.setMode('follow');
  }

  // ── flight ────────────────────────────────────────────────────────────────

  function arrivalPose(entry, outPos, outLook) {
    const o = entry.meta.origin;
    let dock;
    if (entry.resident) dock = residents[entry.meta.id].stand;
    else if (entry.state === 'loaded') dock = entry.isle.dockSpawn;
    else {
      // dock unknown until the module loads — guess the near side; the real
      // pose blends in the moment the load resolves (RETARGET_RATE)
      const gx = mapPos.x - o.x, gz = mapPos.z - o.z;
      const gl = Math.hypot(gx, gz) || 1;
      dock = { x: o.x + (gx / gl) * entry.meta.radius, z: o.z + (gz / gl) * entry.meta.radius };
    }
    const az = Math.atan2(dock.x - o.x, dock.z - o.z);
    outPos.set(
      dock.x + Math.sin(az) * ARRIVE_BACK,
      ARRIVE_UP,
      dock.z + Math.cos(az) * ARRIVE_BACK);
    outLook.set(o.x, FOCAL_UP, o.z);
    return entry.resident || entry.state === 'loaded';
  }

  function sail(id) {
    if (state !== 'map' || id === currentIsland) return;
    const entry = entries.get(id);
    entry.keep = true;
    entry.lastTouch = performance.now();
    if (!entry.resident && entry.state === 'unloaded') ensureLoaded(id);
    ui.hideVoyageCard();
    selectedId = null;
    const f = {
      dest: id,
      from: player.camera.position.clone(),
      look0: mapLook.clone(),
      p3: new THREE.Vector3(),
      p3t: new THREE.Vector3(),
      l3: new THREE.Vector3(),
      dockKnown: false,
      elapsed: 0,
      ue: 0,
      T: 0,
      holding: false,
      held: false,
      orbitR: 0,
      orbitA: 0,
      uResume: 1,
      clouds: [],
      cloudsSpawned: false,
      arrived: false,
    };
    f.dockKnown = arrivalPose(entry, f.p3t, f.l3);
    f.p3.copy(f.p3t);
    const dist = f.from.distanceTo(f.p3);
    f.T = FLIGHT_S_MIN + (FLIGHT_S_MAX - FLIGHT_S_MIN) *
      clamp01((dist - FLIGHT_DIST_NEAR) / (FLIGHT_DIST_FAR - FLIGHT_DIST_NEAR));
    flight = f;
    state = 'flight';
  }

  // Cubic Bézier between the (possibly retargeting) endpoints; control points
  // lift the chord so the path arcs like a thrown paper plane, not a slide.
  function bezier(f, u, out) {
    c1.lerpVectors(f.from, f.p3, 1 / 3);
    c1.y += FLIGHT_LIFT;
    c2.lerpVectors(f.from, f.p3, 2 / 3);
    c2.y += FLIGHT_LIFT;
    const w = 1 - u;
    out.set(0, 0, 0)
      .addScaledVector(f.from, w * w * w)
      .addScaledVector(c1, 3 * w * w * u)
      .addScaledVector(c2, 3 * w * u * u)
      .addScaledVector(f.p3, u * u * u);
    return out;
  }

  function fireArrive(f, entry) {
    f.arrived = true;
    const payload = entry.resident
      ? { world: residents[entry.meta.id].world, dockSpawn: residents[entry.meta.id].stand }
      : { world: entry.isle.world, dockSpawn: entry.isle.dockSpawn };
    onArrive(f.dest, payload);
  }

  function finishFlight(f, entry) {
    if (!f.arrived) fireArrive(f, entry);
    currentIsland = f.dest;
    entry.lastTouch = performance.now();
    for (const cloud of f.clouds) removeCloud(cloud);
    f.clouds.length = 0;
    flight = null;
    state = 'closed';
    views._endExternalDrive();
    views.setMode('follow');
    ui.setVoyaging(false);
    ui.arrivalCard(entry.meta.name, entry.meta.epithet);
    music.duck();
    pruneLRU();
  }

  function flightUpdate(dt) {
    const f = flight;
    const entry = entries.get(f.dest);
    const ready = entry.resident || entry.state === 'loaded';
    if (!entry.resident && entry.state === 'unloaded') ensureLoaded(f.dest);   // retry
    if (!f.dockKnown && ready) f.dockKnown = arrivalPose(entry, f.p3t, f.l3);
    f.p3.lerp(f.p3t, 1 - Math.exp(-RETARGET_RATE * dt));

    if (f.holding) {
      if (ready) {
        // release: pick the flight back up exactly where the creep left it
        f.holding = false;
        f.uResume = f.ue;
        f.elapsed = f.T * easeInvUpper(f.ue);
        for (const cloud of f.clouds) cloud.out = true;
      } else {
        f.ue += (HOLD_CREEP - f.ue) * (1 - Math.exp(-HOLD_CREEP_RATE * dt));
        f.orbitR += (HOLD_ORBIT_R - f.orbitR) * (1 - Math.exp(-HOLD_R_RATE * dt));
      }
    } else {
      f.elapsed += dt;
      f.ue = easeInOutCubic(clamp01(f.elapsed / f.T));
      if (f.ue >= HOLD_AT && !ready && !f.held) {
        f.holding = true;
        f.held = true;
        f.ue = HOLD_AT;
      }
      if (f.orbitR > 0) f.orbitR *= Math.exp(-HOLD_R_DECAY * dt);
    }
    if (f.orbitR > 0.01) f.orbitA += HOLD_ORBIT_W * dt;

    // weather gathers ahead of a hold; if the island lands early it drifts by
    if (!f.cloudsSpawned && f.ue >= CLOUD_SPAWN_AT && !ready) spawnClouds(f);
    updateClouds(f, dt);

    const cam = player.camera;
    bezier(f, f.ue, v1);
    if (f.orbitR > 0.01) {
      const fade = f.holding ? 1 : clamp01((1 - f.ue) / HOLD_FADE_SPAN);
      v1.x += Math.sin(f.orbitA) * f.orbitR * fade;
      v1.z += Math.cos(f.orbitA) * f.orbitR * fade;
    }
    cam.position.copy(v1);
    v2.lerpVectors(f.look0, f.l3, f.ue);
    cam.lookAt(v2);
    const fov = f.ue < 0.5
      ? mapFov + (FOV_CRUISE - mapFov) * smooth(f.ue / 0.5)
      : FOV_CRUISE + (FOV_DESCENT - FOV_CRUISE) * smooth((f.ue - 0.5) / 0.5);
    setFov(cam, fov);
    scene.fog.density = FOG_VOYAGE;

    // the player teleports in behind the descending camera, world already meshed
    if (!f.arrived && !f.holding && ready && f.T - f.elapsed <= ARRIVE_LEAD_S) {
      fireArrive(f, entry);
    }
    if (!f.holding && f.elapsed >= f.T) finishFlight(f, entry);
  }

  // ── clouds (the weather curtain) ──────────────────────────────────────────

  let cloudTex = null;
  function getCloudTex() {
    if (cloudTex) return cloudTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    cloudTex = new THREE.CanvasTexture(c);
    cloudTex.colorSpace = THREE.SRGBColorSpace;
    return cloudTex;
  }

  function spawnClouds(f) {
    f.cloudsSpawned = true;
    for (let i = 0; i < 3; i++) {
      bezier(f, Math.min(0.98, HOLD_AT + 0.02 + i * 0.06), v1);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getCloudTex(),
        color: CLOUD_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      sprite.position.set(
        v1.x + (Math.random() * 2 - 1) * CLOUD_JITTER_XZ,
        v1.y + (Math.random() * 2 - 1) * CLOUD_JITTER_Y,
        v1.z + (Math.random() * 2 - 1) * CLOUD_JITTER_XZ);
      const s = CLOUD_SCALE * (0.85 + Math.random() * 0.3);
      sprite.scale.set(s, s * 0.62, 1);
      group.add(sprite);
      const heading = Math.random() * Math.PI * 2;
      f.clouds.push({
        sprite,
        vx: Math.cos(heading) * CLOUD_DRIFT,
        vz: Math.sin(heading) * CLOUD_DRIFT,
        out: false,
      });
    }
  }

  function updateClouds(f, dt) {
    for (let i = f.clouds.length - 1; i >= 0; i--) {
      const cloud = f.clouds[i];
      const m = cloud.sprite.material;
      m.opacity += cloud.out
        ? -(CLOUD_OPACITY / CLOUD_OUT_S) * dt
        : (CLOUD_OPACITY / CLOUD_IN_S) * dt;
      m.opacity = Math.min(CLOUD_OPACITY, Math.max(0, m.opacity));
      cloud.sprite.position.x += cloud.vx * dt;
      cloud.sprite.position.z += cloud.vz * dt;
      if (cloud.out && m.opacity <= 0) {
        removeCloud(cloud);
        f.clouds.splice(i, 1);
      }
    }
  }

  function removeCloud(cloud) {
    group.remove(cloud.sprite);
    cloud.sprite.material.dispose();   // texture is shared — material only
  }

  // ── per-frame ─────────────────────────────────────────────────────────────

  function setFov(cam, fov) {
    if (Math.abs(cam.fov - fov) > FOV_EPS) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  function update(dt, t) {
    // impostors bob even when closed — they double as horizon silhouettes
    if (!reducedMotion) {
      for (const entry of entries.values()) {
        if (entry.impostor) {
          entry.impostor.position.y = entry.bobBase +
            Math.sin((t * Math.PI * 2) / BOB_PERIOD + entry.bobPhase) * BOB_AMP;
        }
      }
    }
    // loaded showcase worlds keep animating (glow pulse) wherever the camera is
    for (const entry of entries.values()) {
      if (entry.isle) entry.isle.world.update(dt, t);
    }

    if (state === 'closed') return;
    const cam = player.camera;

    if (state === 'opening') {
      openT += dt;
      const k = easeInOutCubic(clamp01(openT / openS));
      cam.position.lerpVectors(startPos, mapPos, k);
      v1.lerpVectors(startLook, mapLook, k);
      cam.lookAt(v1);
      setFov(cam, startFov + (mapFov - startFov) * k);
      scene.fog.density = startFog + (FOG_VOYAGE - startFog) * k;
      if (openT >= openS) {
        state = 'map';
        select(currentIsland);
      }
      return;
    }

    if (state === 'map') {
      // pinned each frame: player.update keeps easing fov toward its dolly
      // target, so the map pose re-asserts itself after it
      cam.position.copy(mapPos);
      cam.lookAt(mapLook);
      setFov(cam, mapFov);
      scene.fog.density = FOG_VOYAGE;
      return;
    }

    flightUpdate(dt);
  }

  // ── input (map mode only) ─────────────────────────────────────────────────
  // Own listeners on the canvas; main's handlers are gated by voyage.active.

  const canvas = renderer.domElement;
  let downId = -1, downX = 0, downY = 0, downT = 0, downMoved = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'map') return;
    downId = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    downMoved = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'map') return;
    if (e.pointerId === downId &&
        Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_PX) downMoved = true;
    // hover select doubles as the prefetch trigger; empty sky keeps the card
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      const id = pickAt(e.clientX, e.clientY);
      if (id && id !== selectedId) select(id);
    }
  });

  const onUp = (e) => {
    if (state !== 'map' || e.pointerId !== downId) return;
    downId = -1;
    if (downMoved || performance.now() - downT > TAP_MS) return;
    const id = pickAt(e.clientX, e.clientY);
    if (id && id !== selectedId) select(id);
  };
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { downId = -1; });

  return {
    open,
    close,
    update,
    get active() { return state !== 'closed'; },
    get currentIsland() { return currentIsland; },
  };
}
