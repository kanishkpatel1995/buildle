// islands.js — the archipelago: registry metadata, the island-author kit, the
// lazy showcase loader, and the billboard impostor baker (CONTRACT-W1 §2).
//
// Island modules live in islands/<id>.js and export `build(kit)`. They add
// every mesh they make to `kit.group` (already in the scene), create their
// World through `kit.makeWorld()`, and return `{ dockSpawn }` in GLOBAL
// coordinates. islands/test-isle.js is the reference implementation.

import * as THREE from 'three';
import { World, GeoBuilder, PALETTE } from './world.js';
import { water } from './water.js';

// ── tunables ────────────────────────────────────────────────────────────────

const DEFAULT_MS_PER_FRAME = 6;       // paced chunk meshing budget per frame

// Impostor bake (W3 voyage billboards; W1 exercises it behind the dev flag).
const IMPOSTOR_SIZE = 512;
const IMPOSTOR_ELEV = (8 * Math.PI) / 180;  // horizon-level camera elevation
const IMPOSTOR_DIST_R = 2.6;          // camera distance = island radius × this
const IMPOSTOR_FOV = 42;              // frames radius×2.6 with a little sky
// The bake happens in a bare temp scene, so it carries its own copy of the
// golden-hour light rig (values mirror main.js — keep them in step).
const BAKE_SUN_COLOR = '#FFD9A0';
const BAKE_SUN_INTENSITY = 2.0;
const BAKE_SUN_OFFSET = new THREE.Vector3(-50, 21, 27);
const BAKE_HEMI_SKY = '#9C7BB8';
const BAKE_HEMI_GROUND = '#5A4A6B';
const BAKE_HEMI_INTENSITY = 1.45;

// Label sprites (player.js label style: Nunito 600, cloud-white, soft shadow).
const LABEL_CANVAS_W = 512;
const LABEL_CANVAS_H = 128;
const LABEL_FONT_PX = 56;             // 28px at the canvas's 2× resolution
const LABEL_MIN_FONT_PX = 22;
const LABEL_MAX_TEXT_W = 460;
const LABEL_FILL = '#F7F1E8';
const LABEL_SHADOW = 'rgba(43, 45, 58, 0.55)';
const LABEL_SCALE_X = 2.2;            // a touch larger than the player tag —
const LABEL_SCALE_Y = 0.55;           // island signage reads from the dock

// ── registry ────────────────────────────────────────────────────────────────

export const ISLANDS = [
  // metadata only — loading is lazy. All origins on the SAME y=0 ground plane.
  { id: 'plaza',     name: 'the plaza',            epithet: 'one prompt, one world',            origin: { x: 0, z: 0 },     radius: 33, kind: 'plaza' },
  { id: 'gardeners', name: "the gardener's isle",  epithet: 'something new grows every day',    origin: { x: 70, z: -70 },  radius: 13, kind: 'gardener' },
  { id: 'test-isle', name: 'the proving ground',   epithet: 'where new worlds are rehearsed',   origin: { x: -110, z: 60 }, radius: 17, kind: 'showcase', dev: true },
  { id: 'ember-canyon', name: 'ember canyon',           epithet: 'the river that leaps into the sky',     origin: { x: -150, z: -30 },  radius: 33, kind: 'showcase' },
  { id: 'lowtide',      name: 'lowtide',                epithet: 'where the tide forgot to return',       origin: { x: 90, z: 110 },    radius: 27, kind: 'showcase' },
  { id: 'wicklight',    name: 'wicklight harbor',       epithet: 'every boat is remembered',              origin: { x: -20, z: 150 },   radius: 25, kind: 'showcase' },
  { id: 'orchard',      name: 'the hanging orchard',    epithet: 'it has always been harvest evening',    origin: { x: -120, z: -120 }, radius: 25, kind: 'showcase' },
  { id: 'astronomers',  name: "the astronomer's reach", epithet: 'watching for a night that never comes', origin: { x: 40, z: -170 },   radius: 21, kind: 'showcase' },
];

export function getIsland(id) {
  for (const island of ISLANDS) {
    if (island.id === id) return island;
  }
  return null;
}

// ── cached lambert factory ──────────────────────────────────────────────────
// One material per (color, opts) pair, shared across every island that asks —
// these are never disposed when an island unloads.

const lambertCache = new Map();
const cachedMaterials = new Set();

function lambert(color, opts = {}) {
  const key = String(color) + '|' + JSON.stringify(opts, Object.keys(opts).sort());
  let mat = lambertCache.get(key);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color, ...opts });
    lambertCache.set(key, mat);
    cachedMaterials.add(mat);
  }
  return mat;
}

// ── label sprites ───────────────────────────────────────────────────────────

function makeLabelSprite(text) {
  const label = String(text ?? '').trim();
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_W;
  canvas.height = LABEL_CANVAS_H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, LABEL_CANVAS_W, LABEL_CANVAS_H);
    let size = LABEL_FONT_PX;
    ctx.font = `600 ${size}px Nunito, sans-serif`;
    const w = ctx.measureText(label).width;
    if (w > LABEL_MAX_TEXT_W) {
      size = Math.max(LABEL_MIN_FONT_PX, Math.floor((size * LABEL_MAX_TEXT_W) / w));
      ctx.font = `600 ${size}px Nunito, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = LABEL_SHADOW;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = LABEL_FILL;
    ctx.fillText(label, LABEL_CANVAS_W / 2, LABEL_CANVAS_H / 2 + 2);
    tex.needsUpdate = true;
  };
  draw();
  if (document.fonts) document.fonts.ready.then(draw);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sprite.scale.set(LABEL_SCALE_X, LABEL_SCALE_Y, 1);
  return sprite;
}

// ── showcase loader ─────────────────────────────────────────────────────────
// Native dynamic import — static-host friendly, no bundler. The island's
// World is parented to the returned group (not the scene directly) so
// dispose() can sweep every mesh the island ever made in one traversal.

export async function loadShowcase(id, scene, { reducedMotion = false, msPerFrame = DEFAULT_MS_PER_FRAME } = {}) {
  const meta = getIsland(id);
  if (!meta) throw new Error('unknown island: ' + id);
  const mod = await import('./islands/' + meta.id + '.js');

  const group = new THREE.Group();
  group.name = 'island:' + meta.id;
  scene.add(group);

  let world = null;
  const kit = {
    THREE,
    PALETTE,
    group,                 // add every island mesh here — it is already in the scene
    reducedMotion,
    GeoBuilder,            // for extra builders beyond kit.decor (e.g. emissive parts)
    makeWorld(opts = {}) {
      world = new World(group, {
        reducedMotion,
        origin: meta.origin,
        size: meta.radius * 2,
        radius: meta.radius,
        buildable: false,
        seeded: false,
        ...opts,
      });
      world.load(null);
      return world;
    },
    setBlocksPaced: (w, entries, ms = msPerFrame) => w.setBlocksBulkPaced(entries, ms),
    decor: new GeoBuilder(),
    water,
    makeLabelSprite,
    lambert,
  };

  const built = await mod.build(kit);
  const dockSpawn = built && built.dockSpawn
    ? built.dockSpawn
    : { x: meta.origin.x, z: meta.origin.z };

  return {
    id: meta.id,
    meta,
    world,
    group,
    dockSpawn,
    dispose() {
      disposeIsland(scene, group);
      // The World's envelope material is built eagerly but only ever attached
      // to sprites when a block carries a note — showcase islands never have
      // any, so the traversal above can't reach it. Sweep it directly.
      if (world && world._envelopeMat) {
        if (world._envelopeMat.map) world._envelopeMat.map.dispose();
        world._envelopeMat.dispose();
      }
    },
  };
}

// Waters first (water.dispose unregisters mist groups from the shared clock
// and detaches them), then one sweep over whatever remains. Skips: shared
// empty chunk geometry (zero vertices), the cached lambert materials, and the
// three.js-global sprite plane geometry.
function disposeIsland(scene, group) {
  const waters = [];
  group.traverse((node) => {
    if (typeof node.name === 'string' && node.name.startsWith('water-')) waters.push(node);
  });
  for (const w of waters) water.dispose(w);

  const disposed = new Set();
  group.traverse((node) => {
    if (node.isSprite) {
      if (!disposed.has(node.material)) {
        disposed.add(node.material);
        if (node.material.map) node.material.map.dispose();
        node.material.dispose();
      }
      return;
    }
    if (node.isInstancedMesh) node.dispose();
    const geo = node.geometry;
    if (geo && geo.attributes.position && geo.attributes.position.count > 0 && !disposed.has(geo)) {
      disposed.add(geo);
      geo.dispose();
    }
    const mat = node.material;
    if (mat && !cachedMaterials.has(mat) && !disposed.has(mat)) {
      disposed.add(mat);
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
  });
  scene.remove(group);
}

// ── impostor baker ──────────────────────────────────────────────────────────
// Renders the loaded island once from a horizon-level camera into a 512² RT,
// copies the pixels into a canvas texture (sRGB-encoded by hand — render
// targets come back linear), and returns a normally-fogged sprite scaled to
// the island's real world dimensions. The RT is disposed before returning.

let _srgbLut = null;
function srgbLut() {
  if (_srgbLut) return _srgbLut;
  _srgbLut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    _srgbLut[i] = Math.round(s * 255);
  }
  return _srgbLut;
}

export function bakeImpostor(renderer, scene, island) {
  const meta = island.meta || getIsland(island.id);
  const group = island.group;

  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());

  // Horizon-level camera looking at the island from the plaza's direction —
  // the angle a voyager actually sees the billboard from.
  const dist = meta.radius * IMPOSTOR_DIST_R;
  const az = new THREE.Vector2(-meta.origin.x, -meta.origin.z);
  if (az.lengthSq() < 1) az.set(1, 0);
  az.normalize();
  const camera = new THREE.PerspectiveCamera(IMPOSTOR_FOV, 1, 0.1, dist + meta.radius * 4);
  camera.position.set(
    center.x + az.x * dist * Math.cos(IMPOSTOR_ELEV),
    center.y + dist * Math.sin(IMPOSTOR_ELEV),
    center.z + az.y * dist * Math.cos(IMPOSTOR_ELEV)
  );
  camera.lookAt(center);

  // Bare temp scene with its own golden-hour rig; the group visits, renders,
  // and goes straight home. No fog here — the live sprite gets fogged instead.
  const bakeScene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(BAKE_SUN_COLOR, BAKE_SUN_INTENSITY);
  sun.position.copy(center).add(BAKE_SUN_OFFSET);
  sun.target.position.copy(center);
  bakeScene.add(sun, sun.target);
  bakeScene.add(new THREE.HemisphereLight(BAKE_HEMI_SKY, BAKE_HEMI_GROUND, BAKE_HEMI_INTENSITY));
  bakeScene.add(group);

  const rt = new THREE.WebGLRenderTarget(IMPOSTOR_SIZE, IMPOSTOR_SIZE, { depthBuffer: true });
  const prevTarget = renderer.getRenderTarget();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);
  const prevClearAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt);
  renderer.render(bakeScene, camera);

  const pixels = new Uint8Array(IMPOSTOR_SIZE * IMPOSTOR_SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, IMPOSTOR_SIZE, IMPOSTOR_SIZE, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClearColor, prevClearAlpha);
  scene.add(group);
  rt.dispose();

  // GL rows are bottom-up; flip while sRGB-encoding the color channels.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = IMPOSTOR_SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(IMPOSTOR_SIZE, IMPOSTOR_SIZE);
  const lut = srgbLut();
  for (let y = 0; y < IMPOSTOR_SIZE; y++) {
    const src = (IMPOSTOR_SIZE - 1 - y) * IMPOSTOR_SIZE * 4;
    const dst = y * IMPOSTOR_SIZE * 4;
    for (let x = 0; x < IMPOSTOR_SIZE * 4; x += 4) {
      img.data[dst + x] = lut[pixels[src + x]];
      img.data[dst + x + 1] = lut[pixels[src + x + 1]];
      img.data[dst + x + 2] = lut[pixels[src + x + 2]];
      img.data[dst + x + 3] = pixels[src + x + 3];
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,     // ACES was applied during the bake — never twice
  }));
  sprite.name = 'impostor:' + meta.id;
  // Scale so the island inside the texture appears at its real world size:
  // the camera's view plane at the target covered 2·d·tan(fov/2) units.
  const span = 2 * dist * Math.tan((IMPOSTOR_FOV * Math.PI) / 360);
  sprite.scale.set(span, span, 1);
  sprite.position.set(meta.origin.x, center.y, meta.origin.z);
  return sprite;
}
