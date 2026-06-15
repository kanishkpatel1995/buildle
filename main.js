// Buildle — main.js
// Bootstrap, environment, input, wiring, loop (CONTRACT §8).

import * as THREE from 'three';
import { World, PALETTE, GLOW_INDEX, WORLD_MIN, WORLD_MAX, WORLD_HEIGHT, PLACE_RANGE, plazaPondCells } from './world.js';
import { water } from './water.js';
import { Player } from './player.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { music } from './music.js';
import { lofi } from './lofi.js';
import { Views } from './views.js';
import { capture } from './capture.js';
import { Gardener } from './bot.js';
import { ISLANDS, getIsland, loadShowcase, bakeImpostor } from './islands.js';
import { createVoyage } from './voyage.js';
import { createFoundry } from './foundry.js';
import { createPresence } from './presence.js';
import { createSync } from './sync.js';
import { getToday } from './prompts.js';
import { storageAvailable, loadWorld, saveWorld, loadPlayer, savePlayer } from './storage.js';

// ── tunables ────────────────────────────────────────────────────────────────

const FOG_COLOR = '#E8A87C';
const FOG_DENSITY = 0.0135;                   // the MAX/near density — zooming out eases it down
const FOG_COMP_NEAR = 35;                     // full density inside this camera-to-player distance
const FOG_DENSITY_MIN = 0.0026;               // far-zoom floor — islands stay readable at dist 90+
const FOG_COMP_RATE = 4;                      // density easing rate (1/s)

const POND_SURFACE_Y = -0.12;                 // living water sits just above the painted recess

const SKY_RADIUS = 500;
const SKY_ZENITH = '#3D2C5A';                 // deep dusk plum
const SKY_MID = '#C96F8E';                    // warm rose
const SKY_HORIZON = '#F2B077';                // peach gold

const SUN_LIGHT_COLOR = '#FFD9A0';
const SUN_LIGHT_INTENSITY = 2.0;
const SUN_LIGHT_POS = new THREE.Vector3(-50, 21, 27);    // SW, ≈20° above horizon — frontlights the spawn view
const SUN_SPRITE_COLOR = '#FFE8C2';
const SUN_SPRITE_DIST = 440;

const HEMI_SKY = '#9C7BB8';
const HEMI_GROUND = '#5A4A6B';
const HEMI_INTENSITY = 1.45;                  // generous cool fill — shadows read plum, never black

const CLOUD_COLOR = '#F7E2D0';                // near-white peach
const CLOUD_COUNT = 6;
const CLOUD_WRAP_R2 = 140 * 140;
const CLOUD_Y_MIN = -17, CLOUD_Y_SPAN = 10;
const CLOUD_DRIFT_MIN = 0.5, CLOUD_DRIFT_SPAN = 0.6;     // u/s

const SILHOUETTE_PLUM = '#3D2C5A';

const BANNER_Y = 8.1;
const BANNER_Z = -16;                         // north of center — floats beyond the plaza trees from spawn
const BANNER_BOB = 0.25;
const BANNER_SCALE_X = 20, BANNER_SCALE_Y = 10;

const DRAG_PX = 4;                            // desktop click-vs-drag threshold
const TAP_MS = 300, TAP_PX = 8;               // touch tap limits
const LONG_PRESS_MS = 450;
const JOYSTICK_RADIUS = 56;
const JOYSTICK_DEADZONE = 0.12;
const PINCH_ZOOM_SCALE = 3;                   // px of pinch → player.zoom delta

// The gardener's island — a smaller floating isle to the north-east where the
// bot builds something new every day. Stand cell local (0, 12) per the mask.
const GARDEN_ORIGIN = { x: 70, z: -70 };
const GARDEN_SIZE = 26, GARDEN_RADIUS = 13;
const GARDEN_STAND = { x: 70.5, z: -57.5 };
const GARDEN_CENTER = new THREE.Vector3(70.5, 2, -69.5);
const PLAZA_STAND = { x: 1, z: 16 };

const DEFAULT_COLOR = 2;                      // terracotta — warm first swatch
const SAVE_DEBOUNCE_MS = 400;
const MILESTONES = new Set([5, 10, 30]);
const CONFETTI_COLORS = ['#EBB44E', '#C96F7B', '#4E9B9B', '#8E6A9E'];
const DT_MAX = 0.05;
const FADE_MS = 600;

// ── boot ────────────────────────────────────────────────────────────────────

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let TODAY = getToday();

const profile = loadPlayer();
const defaultName = 'wanderer-' + String(Math.floor(Math.random() * 900) + 100);
if (profile.bodyColor < 1 || profile.bodyColor > 14) {
  // random body color per visitor — skip cloud white (head) and glow lantern
  profile.bodyColor = 1 + Math.floor(Math.random() * 14);
  savePlayer(profile);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth || 1, window.innerHeight || 1);   // real size arrives via onResize

const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_HORIZON);
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

// ── environment ─────────────────────────────────────────────────────────────

// Merges axis-aligned boxes [w,h,d,x,y,z] into one BufferGeometry (no addons).
function mergedBoxes(parts) {
  const geos = parts.map(([w, h, d, x, y, z]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  });
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  return merged;
}

// Sky: gradient dome, three stops mixed by normalized direction height.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(SKY_RADIUS, 32, 24),
  new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(SKY_ZENITH) },
      midColor: { value: new THREE.Color(SKY_MID) },
      bottomColor: { value: new THREE.Color(SKY_HORIZON) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.26, max(h, 0.0)));
        col = mix(col, topColor, smoothstep(0.18, 0.62, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  })
);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

// Sun: layered additive sprites along the light direction.
function makeRadialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [offset, alpha] of stops) grad.addColorStop(offset, `rgba(255,255,255,${alpha})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sunDir = SUN_LIGHT_POS.clone().normalize();
function makeSunSprite(tex, scale, opacity, color) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sprite.scale.set(scale, scale, 1);
  sprite.position.copy(sunDir).multiplyScalar(SUN_SPRITE_DIST);
  scene.add(sprite);
  return sprite;
}
const discTex = makeRadialTexture([[0, 1], [0.42, 1], [0.58, 0.7], [1, 0]]);
const glowTex = makeRadialTexture([[0, 0.85], [0.35, 0.4], [1, 0]]);
makeSunSprite(discTex, 58, 0.95, SUN_SPRITE_COLOR);
makeSunSprite(glowTex, 150, 0.45, SUN_SPRITE_COLOR);
const sunOuterGlow = makeSunSprite(glowTex, 290, 0.22, SKY_HORIZON);

// Lights: warm low sun vs cool lavender ambient — the magic-hour contrast.
const sunLight = new THREE.DirectionalLight(SUN_LIGHT_COLOR, SUN_LIGHT_INTENSITY);
sunLight.position.copy(SUN_LIGHT_POS);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -55;
sunLight.shadow.camera.right = 55;
sunLight.shadow.camera.top = 55;
sunLight.shadow.camera.bottom = -55;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 200;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.02;
scene.add(sunLight, sunLight.target);
scene.add(new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY));

// The shadow camera only spans ±55, sized for one island. Islands sit hundreds
// of units apart, so the sun (and its shadow frustum) re-centers on whichever
// island you're standing on — the whole archipelago can't fit one shadow map
// without going mushy. Direction is preserved (a pure translation of light +
// target), so the golden-hour angle is identical everywhere.
function centerSunOn(ox, oz) {
  sunLight.position.set(SUN_LIGHT_POS.x + ox, SUN_LIGHT_POS.y, SUN_LIGHT_POS.z + oz);
  sunLight.target.position.set(ox, 0, oz);
  sunLight.target.updateMatrixWorld();
}

// Clouds: flat voxel slabs drifting slowly below the island.
const CLOUD_SHAPES = [
  [[7, 1, 4.5, 0, 0, 0], [4, 1, 3, 4.5, 0.35, 1], [5, 1, 3.2, -4, 0.3, -0.8], [3, 1, 2.4, 1.2, 0.6, -2.6]],
  [[8, 1, 5, 0, 0, 0], [4.5, 1, 3, -5, 0.4, 1.4], [3.5, 1, 2.6, 4.6, 0.3, -1.6]],
  [[6, 1, 4, 0, 0, 0], [3, 1, 2.4, 3.8, 0.4, 0.8], [4, 1, 2.8, -3.6, 0.35, -1.2], [2.4, 1, 2, 0.6, 0.7, 2.6]],
];
const cloudMat = new THREE.MeshLambertMaterial({ color: CLOUD_COLOR });
const cloudGeos = CLOUD_SHAPES.map(mergedBoxes);
const clouds = [];
for (let i = 0; i < CLOUD_COUNT; i++) {
  const cloud = new THREE.Mesh(cloudGeos[i % cloudGeos.length], cloudMat);
  const angle = (i / CLOUD_COUNT) * Math.PI * 2 + Math.random() * 0.9;
  const radius = 55 + Math.random() * 75;
  cloud.position.set(Math.cos(angle) * radius, CLOUD_Y_MIN + Math.random() * CLOUD_Y_SPAN, Math.sin(angle) * radius);
  const s = 1.1 + Math.random() * 1.1;
  cloud.scale.set(s, 0.9, s);
  cloud.rotation.y = Math.random() * Math.PI;
  const drift = CLOUD_DRIFT_MIN + Math.random() * CLOUD_DRIFT_SPAN;
  const heading = Math.random() * Math.PI * 2;
  cloud.userData.vx = Math.cos(heading) * drift;
  cloud.userData.vz = Math.sin(heading) * drift;
  clouds.push(cloud);
  scene.add(cloud);
}

// Distant island silhouettes, plum pre-mixed toward the fog color for depth.
const SILHOUETTE_PARTS = [
  [17, 3, 14, 0, 0, 0],
  [12, 3, 10, 0.8, -3, 0.5],
  [8, 2.6, 6.5, 0, -5.6, 0],
  [4.5, 2.4, 3.6, -0.6, -8, 0.4],
  [2, 2, 1.8, 0.4, -10, 0],
  [4, 2, 3.4, 2.5, 2.4, 1],
  [2.2, 3, 2, -3.5, 2.8, -2],
];
const silhouetteGeo = mergedBoxes(SILHOUETTE_PARTS);
const fogColor3 = new THREE.Color(FOG_COLOR);
// Painted scenery for ground-level haze only: the voyage's fog lift would
// expose them as flat boards beside the real islands, so they dissolve as the
// density drops below the ground floor (see the fade in tick()).
const SILHOUETTE_FADE_LO = 0.001;             // gone at the voyage map density
const silhouettes = [];
for (const { pos, scale, mix, rot } of [
  // (the third silhouette became the gardener's real island at (70, -70))
  { pos: [-95, 4, -88], scale: 1.6, mix: 0.5, rot: 0.7 },
  { pos: [34, 9, -132], scale: 2.0, mix: 0.66, rot: 4.1 },
]) {
  const island = new THREE.Mesh(silhouetteGeo, new THREE.MeshBasicMaterial({
    color: new THREE.Color(SILHOUETTE_PLUM).lerp(fogColor3, mix),
    fog: false,
    transparent: true,
  }));
  island.position.set(pos[0], pos[1], pos[2]);
  island.scale.setScalar(scale);
  island.rotation.y = rot;
  island.matrixAutoUpdate = false;
  island.updateMatrix();
  scene.add(island);
  silhouettes.push(island);
}

// Prompt banner: the signature element, floating above the plaza center.
const bannerCanvas = document.createElement('canvas');
bannerCanvas.width = 1024;
bannerCanvas.height = 512;
const bannerCtx = bannerCanvas.getContext('2d');
const bannerTex = new THREE.CanvasTexture(bannerCanvas);
bannerTex.colorSpace = THREE.SRGBColorSpace;
const banner = new THREE.Sprite(new THREE.SpriteMaterial({
  map: bannerTex, transparent: true, depthWrite: false, fog: false,
}));
banner.position.set(0, BANNER_Y, BANNER_Z);
banner.scale.set(BANNER_SCALE_X, BANNER_SCALE_Y, 1);
scene.add(banner);
let bannerBaseY = BANNER_Y;   // portrait screens sink the banner below the taller pill

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const probe = line ? line + ' ' + word : word;
    if (line && ctx.measureText(probe).width > maxWidth) { lines.push(line); line = word; }
    else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

function drawBanner() {
  const ctx = bannerCtx;
  ctx.clearRect(0, 0, 1024, 512);
  // soft plum scrim hugging the text band so white type reads against the bright sky
  ctx.save();
  ctx.translate(512, 256);
  ctx.scale(1, 0.52);
  const scrim = ctx.createRadialGradient(0, 0, 40, 0, 0, 470);
  scrim.addColorStop(0, 'rgba(61, 44, 90, 0.38)');
  scrim.addColorStop(0.6, 'rgba(61, 44, 90, 0.18)');
  scrim.addColorStop(1, 'rgba(61, 44, 90, 0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(-512, -512, 1024, 1024);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(43, 30, 66, 0.8)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  let size = 88;
  let lines;
  for (;;) {
    ctx.font = `600 ${size}px Fredoka, sans-serif`;
    lines = wrapText(ctx, TODAY.prompt, 920);
    if (lines.length <= 2 || size <= 56) break;
    size -= 8;
  }
  if (lines.length > 2) lines.length = 2;
  const lineHeight = size * 1.16;
  const firstY = 215 - (lines.length - 1) * lineHeight * 0.5;
  for (let pass = 0; pass < 2; pass++) {   // second pass thickens the glyphs against the glow
    lines.forEach((line, i) => ctx.fillText(line, 512, firstY + i * lineHeight));
  }
  ctx.font = '500 50px Fredoka, sans-serif';
  ctx.globalAlpha = 0.92;
  ctx.fillText(`day ${TODAY.day}`, 512, 215 + lines.length * lineHeight * 0.5 + 52);
  ctx.globalAlpha = 1;
  bannerTex.needsUpdate = true;
}
drawBanner();
document.fonts.ready.then(drawBanner);   // crisp Fredoka once the webfont lands

// Sessions straddling UTC midnight flip prompt, banner, and streak together,
// so the postcard can never contradict itself.
function refreshDay() {
  const now = getToday();
  if (now.day === TODAY.day) return;
  TODAY = now;
  drawBanner();
  ui.setPrompt(TODAY.prompt, TODAY.day);
  ui.setStreak(displayedStreak());
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDay();
});

function updateEnvironment(dt, t) {
  if (reducedMotion) return;
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.vx * dt;
    cloud.position.z += cloud.userData.vz * dt;
    if (cloud.position.x * cloud.position.x + cloud.position.z * cloud.position.z > CLOUD_WRAP_R2) {
      // re-enter mirrored across the origin; fog hides the seam
      cloud.position.x *= -0.97;
      cloud.position.z *= -0.97;
    }
  }
  banner.position.y = bannerBaseY + BANNER_BOB * Math.sin(t * 0.8);
  sunOuterGlow.material.opacity = 0.22 + 0.025 * Math.sin(t * 0.7);
}

// ── world & player ──────────────────────────────────────────────────────────

const world = new World(scene, { reducedMotion });
world.load(loadWorld());

// The plaza pond gains a living water surface, floated over the bounding rect
// of the pond cells; everything outside the footprint counts as land so the
// foam rings hug the painted shoreline.
{
  const pondCells = plazaPondCells();
  const pondSet = new Set(pondCells.map(([x, z]) => x + ',' + z));
  let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity;
  for (const [x, z] of pondCells) {
    if (x < px0) px0 = x;
    if (x > px1) px1 = x;
    if (z < pz0) pz0 = z;
    if (z > pz1) pz1 = z;
  }
  scene.add(water.makeSurface({
    width: px1 - px0 + 1,
    depth: pz1 - pz0 + 1,
    level: POND_SURFACE_Y,
    origin: { x: (px0 + px1 + 1) / 2, z: (pz0 + pz1 + 1) / 2 },
    isLand: (x, z) => !pondSet.has(x + ',' + z),
  }));
}

// The gardener's island: unseeded, unbuildable, watched over by the bot.
const botWorld = new World(scene, {
  reducedMotion,
  origin: GARDEN_ORIGIN,
  size: GARDEN_SIZE,
  radius: GARDEN_RADIUS,
  buildable: false,
  seeded: false,
});
botWorld.load(null);
const gardener = new Gardener(scene, botWorld, { reducedMotion });
gardener.onPlace = (y, c) => music.notePlaced(y, c, true);

// The foundry's build animator owns its own World (the summoned builds land on
// the plinth at the foundry island's origin); the island ground itself loads
// via the voyage like any showcase island.
const foundry = createFoundry({ scene, reducedMotion });

// Live wanderers — gated: if the presence room is unreachable the game stays
// solo. getState reports the player's ground pose; a = 1 while moving.
const presence = createPresence({ scene, reducedMotion });
function presenceState() {
  return {
    p: [player.position.x, player._physY, player.position.z],
    y: player._yaw,
    a: (player._inX !== 0 || player._inZ !== 0) ? 1 : 0,
  };
}
function joinPresence(island) {
  ui.chatReset();   // each island has its own room — start the feed fresh
  presence.connect(island, {
    name: profile.name || defaultName,
    body: profile.bodyColor,
    getState: presenceState,
  });
}

let activeWorld = world;

const player = new Player(scene, world, {
  name: profile.name || defaultName,
  bodyColorIndex: profile.bodyColor,
  reducedMotion,
});
player.onFootstep = (alt) => audio.step(alt);

const views = new Views(player, { reducedMotion });

// Shared-plaza sync — dormant until an API base is configured (sync.js).
// Remote placements ring softly through the song of the day.
const DENIED_TOASTS = {
  budget: 'out of blocks for a moment — they regrow',
  protected: "the gardens can't be built on",
  occupied: 'someone built there first',
  missing: 'someone already cleared that',
};
const sync = createSync({
  world,
  getName: () => profile.name || defaultName,
  onRemoteEdit: (y, c) => music.notePlaced(y, c, true),
  onDenied: (reason) => { if (DENIED_TOASTS[reason]) ui.toast(DENIED_TOASTS[reason]); },
  onDay: () => refreshDay(),
  onStatus: () => {},
});
sync.start();
joinPresence('plaza');   // the starting island — others on the plaza appear

// ── the foundry: pick a model, speak, watch it build ─────────────────────────
const API_BASE = (localStorage.getItem('buildle_api_v1') || 'https://buildle-api.buildle.workers.dev').replace(/\/+$/, '');
const FALLBACK_MODELS = [{ id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', blurb: 'quick and clever' }];
let foundryModels = FALLBACK_MODELS;

// Where a summoned build rises: a little plot in front of where the player
// faces, far enough that the follow camera frames it.
const PAD_AHEAD = 16;
const PAD_VIEW_DIST = 34;   // ease the follow camera back this far to frame the build
const _padAnchor = { x: 0, z: 0, yaw: 0 };
function anchorBesidePlayer() {
  const fx = Math.sin(player._yaw), fz = Math.cos(player._yaw);   // the way the player faces
  _padAnchor.x = player.position.x + fx * PAD_AHEAD;
  _padAnchor.z = player.position.z + fz * PAD_AHEAD;
  _padAnchor.yaw = player._yaw + Math.PI;   // builder stands on the player's side, facing the build
  return _padAnchor;
}

// Where an AI build lands as REAL blocks: centred on a spot ahead of the player,
// clamped so the 24-wide build stays inside the plaza bounds.
const BUILD_AHEAD = 8;
function buildAnchorAhead() {
  const fx = Math.sin(player._yaw), fz = Math.cos(player._yaw);
  let ox = Math.round(player.position.x + fx * BUILD_AHEAD);
  let oz = Math.round(player.position.z + fz * BUILD_AHEAD);
  ox = Math.min(WORLD_MAX - 11, Math.max(WORLD_MIN + 12, ox));
  oz = Math.min(WORLD_MAX - 11, Math.max(WORLD_MIN + 12, oz));
  return { ox, oz };
}

// Grow committed world-blocks into the live world block-by-block (the "rising"
// effect), bottom-up + outward, paced like the foundry. forcePlace renders them
// locally; the server already holds them and our own delta echoes are skipped,
// so there's no double-placement.
let growQueue = null, growIdx = 0, growAccum = 0, growRate = 140, growPlaced = 0, growResolve = null;
const GROW_RATE = 140, GROW_MIN_DUR = 2, GROW_MAX_DUR = 6, GROW_MAX_PER_TICK = 64;
function growBuildInWorld(blocks) {
  if (growResolve) { const r = growResolve; growResolve = null; r(); }   // settle any orphan
  const valid = (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.length >= 4);
  if (!valid.length) return Promise.resolve();
  let cx = 0, cz = 0;
  for (const b of valid) { cx += b[0]; cz += b[2]; }
  cx /= valid.length; cz /= valid.length;
  valid.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    const da = (a[0] - cx) * (a[0] - cx) + (a[2] - cz) * (a[2] - cz);
    const db = (b[0] - cx) * (b[0] - cx) + (b[2] - cz) * (b[2] - cz);
    return da - db;
  });
  growQueue = valid; growIdx = 0; growPlaced = 0; growAccum = 0;
  const dur = Math.min(GROW_MAX_DUR, Math.max(GROW_MIN_DUR, valid.length / GROW_RATE));
  growRate = valid.length / dur;
  return new Promise((res) => { growResolve = res; });
}
function updateGrow(dt) {
  if (!growQueue) return;
  let budget;
  if (reducedMotion) {
    budget = growQueue.length - growIdx;
  } else {
    growAccum += growRate * dt;
    budget = growAccum | 0;
    if (budget > GROW_MAX_PER_TICK) budget = GROW_MAX_PER_TICK;
    growAccum -= budget;
  }
  for (let i = 0; i < budget && growIdx < growQueue.length; i++) {
    const b = growQueue[growIdx++];
    if (world.forcePlace(b[0], b[1], b[2], b[3])) {
      growPlaced++;
      if (growPlaced % 10 === 0) audio.place();
      if (growPlaced % 6 === 0) music.notePlaced(b[1], b[3], false);
    }
  }
  if (growIdx >= growQueue.length) {
    growQueue = null;
    if (growResolve) { const r = growResolve; growResolve = null; r(); }
  }
}

// The Commons (live chat) is available on any island during normal play. The
// 💬 button and the in-rail toggles open/close it; it rides the per-island
// presence socket, so what you say is seen by everyone here. Closed while the
// voyage / a capture owns the screen.
function onChatToggle() {
  if (voyage.active || capture.busy) return;
  ensureAudioAndMusic();   // opening chat counts as a gesture — wake the music
  ui.toggleChat();
}

// Plain chat / actions / note announcements → the room. Best-effort: it needs
// the presence socket (chat is inherently a multiplayer thing).
let chatOfflineHinted = false;
function onChatSend(text, kind) {
  if (!presence.connected) {
    if (!chatOfflineHinted) { chatOfflineHinted = true; ui.chatSys('chat needs a connection — reconnecting…'); }
    return;
  }
  chatOfflineHinted = false;
  presence.say(text, kind || 'chat');
}

// /build, typed into the same chat box. On the plaza the build lands as REAL,
// permanent blocks at your feet (synced to everyone, deletable); elsewhere it
// falls back to the ephemeral preview pad beside you.
async function onChatBuild(model, prompt) {
  ui.setChatBuildBusy(true);
  ui.chatSys('the builder is dreaming…');
  music.duck();
  // Permanent builds need the buildable plaza and a synced identity. On the
  // plaza, give a freshly-loaded session up to ~2s to finish authenticating so
  // the first build commits for keeps instead of falling back to a preview.
  const onPlaza = activeWorld === world && world.buildable;
  let auth = sync.getAuth ? sync.getAuth() : null;
  for (let i = 0; onPlaza && !auth && i < 8; i++) {
    await new Promise((r) => setTimeout(r, 250));
    auth = sync.getAuth ? sync.getAuth() : null;
  }
  const canCommit = onPlaza && !!auth;
  const anchor = canCommit ? buildAnchorAhead() : null;
  let data;
  try {
    const reqBody = { model, prompt };
    if (auth) { reqBody.playerId = auth.playerId; reqBody.token = auth.token; }   // gate needs identity
    if (canCommit) {
      reqBody.commit = true;
      reqBody.ox = anchor.ox;
      reqBody.oz = anchor.oz;
    }
    const res = await fetch(API_BASE + '/api/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    data = await res.json();
  } catch {
    ui.chatSys('the foundry is resting — try again');
    ui.setChatBuildBusy(false);
    return;
  }
  if (!data || data.error || !Array.isArray(data.blocks)) {
    ui.chatSys((data && data.error) || 'the builder got confused — try rephrasing');
    ui.setChatBuildBusy(false);
    return;
  }
  ui.chatSys(`placing ${data.count} blocks…`);
  player._dist = Math.max(player._dist, PAD_VIEW_DIST);   // ease the camera back to frame it
  const label = (foundryModels.find((m) => m.id === data.model) || {}).label || 'the builder';
  if (data.committed) {
    // real, permanent build — rises in the shared world, yours to keep
    await growBuildInWorld(data.blocks);
    bumpStreak();
    ui.chatSys(`“${data.name}” — built by ${label} · it's real now (erase to remove)`);
    presence.say(`built “${data.name}” · ${label}`, 'build');
  } else {
    // preview only (off the plaza, or the spot was taken) — the pad beside you
    await foundry.summon(data.blocks, anchorBesidePlayer());
    ui.chatSys(`“${data.name}” — a preview; build on the plaza to keep it`);
    presence.say(`dreamed up “${data.name}” · ${label}`, 'build');
  }
  ui.setChatBuildBusy(false);
}

// Load the model lineup from the API (falls back to a single model offline),
// then wire up the chat — one input that talks AND builds.
fetch(API_BASE + '/api/models')
  .then((r) => r.json())
  .then((d) => { if (d && Array.isArray(d.models) && d.models.length) foundryModels = d.models; })
  .catch(() => {})
  .finally(() => {
    ui.initChat({
      models: foundryModels,
      expanded: window.matchMedia('(min-width: 760px)').matches,
      onSend: onChatSend,
      onBuild: onChatBuild,
      onReport: (mid) => presence.report(mid),
      onExpand: () => ensureAudioAndMusic(),
    });
  });

// Stream the room's chat into the feed; the presence socket carries it all.
presence.onChat = (m) => ui.chatPush(m);
presence.onChatLog = (msgs) => ui.chatLog(msgs);
presence.onChatHide = (mid) => ui.chatHide(mid);
presence.onChatSys = (text) => ui.chatSys(text);

// Audio + both soundtracks (golden-hour ambient + lo-fi) wake on the first user
// gesture. Whichever mode is chosen plays; the other waits, silent.
function ensureAudioAndMusic() {
  audio.ensure();
  const ctx = audio.getRawContext();
  if (ctx && !music.started) {
    music.start(ctx);
    lofi.start(ctx);
    const dest = audio.getRecordDest();
    if (dest) { music.connectRecorder(dest); lofi.connectRecorder(dest); }
    music.setMuted(profile.muted);
    lofi.setMuted(profile.muted);
    applyMusicMode(profile.musicMode);
  }
}

// The director: 'ambient' steps the lo-fi engine aside, 'lofi' suspends the
// ambient bus and rolls the beat. Idempotent — safe before audio has started.
function applyMusicMode(modeName) {
  const lofiOn = modeName === 'lofi';
  if (music.started) music.setSuspended(lofiOn);
  if (lofi.started) lofi.setActive(lofiOn);
  ui.setMusicMode(modeName);
}

function toggleMusicMode() {
  ensureAudioAndMusic();
  profile.musicMode = profile.musicMode === 'lofi' ? 'ambient' : 'lofi';
  savePlayer(profile);
  applyMusicMode(profile.musicMode);
  ui.toast(profile.musicMode === 'lofi' ? 'lo-fi beats — to build to 🎧' : 'golden-hour ambient');
  audio.ui();
}

// ── input ───────────────────────────────────────────────────────────────────

const PALETTE_COLORS = PALETTE.map((p) => new THREE.Color(p.hex));
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

let selectedColor = DEFAULT_COLOR;
let mode = 'color';                 // 'color' | 'message'
let messageUsed = false;            // one message block per session

// ── sky mode (build in the air) + brush size ──
const SKY_Y_MIN = 1;                // lowest floating plane (keep above ground)
const SKY_Y_MAX = WORLD_HEIGHT - 1; // ceiling (31)
const SKY_REACH = 12;               // relaxed planar reach while building up high
let skyMode = false;
let buildY = 4;                     // the floating build-plane's height (just above head — the
                                    // follow camera can aim down onto it on the first try)
let brushSize = 1;                  // 1 single · 2 → 2×2×2 · 3 → rounded 3×3 blob

// Brush footprints, anchored at the clicked cell and grown +x/+y/+z. The 3-brush
// drops its 8 corners for a rounded, cloud-like blob (19 cells, kinder on the
// shared budget than a full 27-cube).
const BRUSH_1 = [[0, 0, 0]];
const BRUSH_2 = [];
for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) BRUSH_2.push([dx, dy, dz]);
const BRUSH_3 = [];
for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (let dz = 0; dz < 3; dz++) {
  const corner = (dx === 0 || dx === 2) && (dy === 0 || dy === 2) && (dz === 0 || dz === 2);
  if (!corner) BRUSH_3.push([dx, dy, dz]);
}
function brushOffsets() { return brushSize === 3 ? BRUSH_3 : brushSize === 2 ? BRUSH_2 : BRUSH_1; }
let modalOpen = false;              // movement keys pause behind modal overlays
let lastPointerType = 'mouse';
let pointerInside = false;
let contextLost = false;

const keys = new Set();
let viewW = window.innerWidth || 1;   // last sane viewport width (see onResize)
const mouse = { down: false, dragging: false, button: 0, x: 0, y: 0, x0: 0, y0: 0, lx: 0, ly: 0 };
const pointers = new Map();         // touch pointerId → gesture state
let joystickId = -1;
let pinchDist = 0;
const _looks = [];

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _cellCenter = new THREE.Vector3();

// Ghost preview: shared translucent cube + white edges, snapped to the place cell.
const ghostBox = new THREE.BoxGeometry(1.002, 1.002, 1.002);
const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false });
const ghost = new THREE.Group();
ghost.add(new THREE.Mesh(ghostBox, ghostMat));
ghost.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(ghostBox),
  new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, depthWrite: false })
));
ghost.visible = false;
scene.add(ghost);
const ERASE_GHOST_COLOR = new THREE.Color('#B5483E');   // brick red — "remove here"

// Sky mode: a maths plane the cursor ray meets (free — never blocks face-picking)
// plus a faint golden disc that shows where that plane floats and how far you can
// reach. The disc tracks the player at the chosen height; placement snaps to it.
const _buildPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -buildY);
const _skyHit = new THREE.Vector3();
const skyDisc = new THREE.Group();
{
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(SKY_REACH, 56),
    new THREE.MeshBasicMaterial({ color: '#FFE8A8', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SKY_REACH - 0.22, SKY_REACH, 56),
    new THREE.MeshBasicMaterial({ color: '#FFE8A8', transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
  fill.rotation.x = ring.rotation.x = -Math.PI / 2;
  skyDisc.add(fill, ring);
}
skyDisc.renderOrder = 2;   // composite over terrain (still depth-tested by closer geometry)
skyDisc.visible = false;
scene.add(skyDisc);

function setBuildY(y) {
  buildY = Math.min(SKY_Y_MAX, Math.max(SKY_Y_MIN, y | 0));
  _buildPlane.constant = -buildY;
  ui.setBuildY(buildY);
}

function adjustBuildY(delta) {
  if (!skyMode) return;
  setBuildY(buildY + delta);
  audio.ui();
}

// The cell under the cursor on the floating build-plane (sky mode), or null if
// the ray runs parallel/away. y is always the plane height.
function skyCell(clientX, clientY) {
  _ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  _raycaster.setFromCamera(_ndc, player.camera);
  if (!_raycaster.ray.intersectPlane(_buildPlane, _skyHit)) return null;
  return { x: Math.floor(_skyHit.x), y: buildY, z: Math.floor(_skyHit.z) };
}

// Relaxed reach for air-building: planar distance from the player to the cell.
function withinSkyReach(cell) {
  const c = player.getCenter();
  return Math.hypot(cell.x + 0.5 - c.x, cell.z + 0.5 - c.z) <= SKY_REACH;
}

function toggleSky() {
  skyMode = !skyMode;
  ui.setSkyActive(skyMode);
  if (skyMode && views.mode !== 'follow') setViewMode('follow');
  audio.ui();
}

// Place the active brush footprint around an anchor cell. Brush 1 = a single
// block (identical to the original placement). Returns the count actually placed.
function placeBrushAt(cx, cy, cz, colorIndex) {
  let placed = 0;
  for (const [dx, dy, dz] of brushOffsets()) {
    const x = cx + dx, y = cy + dy, z = cz + dz;
    if (y < 0 || y >= WORLD_HEIGHT) continue;
    if (!world.canPlace(x, y, z) || player.overlapsCell(x, y, z)) continue;
    if (world.place(x, y, z, colorIndex)) {
      sync.sendPlace(x, y, z, colorIndex);
      music.notePlaced(y, colorIndex);
      placed++;
    }
  }
  if (placed) {
    audio.place();
    music.duck();
    bumpStreak();
  }
  return placed;
}

function pickAt(clientX, clientY) {
  _ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  _raycaster.setFromCamera(_ndc, player.camera);
  return activeWorld.pick(_raycaster, player.getCenter());
}

const inBounds = (x, y, z) =>
  x >= WORLD_MIN && x <= WORLD_MAX && z >= WORLD_MIN && z <= WORLD_MAX && y >= 0 && y < WORLD_HEIGHT;

async function attemptPlace(clientX, clientY) {
  if (views.mode !== 'follow' || voyage.active) return;
  // Eraser armed: a tap/click removes instead of placing (right-click and
  // long-press still remove regardless of the selected tool).
  if (mode === 'erase') { attemptRemove(clientX, clientY); return; }
  // Sky mode swaps face-picking for the floating build-plane; a click on an
  // existing block (to open a note / remove) still works via the normal pick.
  let hit;
  if (skyMode) {
    hit = pickAt(clientX, clientY);
    if (hit && hit.block && hit.block.m) {
      audio.open();
      ui.showNote({ text: hit.block.m, author: hit.block.n || 'a wanderer' });
      return;
    }
    const c = skyCell(clientX, clientY);
    if (!c) return;
    hit = { placeCell: c, removeCell: null, block: null, inRange: withinSkyReach(c) };
  } else {
    hit = pickAt(clientX, clientY);
    if (!hit) return;
    if (hit.block && hit.block.m) {
      // a block with a note opens it instead of building
      audio.open();
      ui.showNote({ text: hit.block.m, author: hit.block.n || 'a wanderer' });
      return;
    }
  }
  if (!activeWorld.buildable) {
    ui.toast(`${getIsland(voyage.currentIsland).name} — look, don't touch`);
    return;
  }
  if (!hit.placeCell) return;
  if (!hit.inRange) { ui.toast(skyMode ? 'too far — stand nearer where you want it' : 'too far away — walk closer'); return; }
  const { x, y, z } = hit.placeCell;
  if (!world.canPlace(x, y, z)) {
    if (inBounds(x, y, z) && !world.get(x, y, z)) ui.toast("the gardens can't be built on");
    return;
  }
  if (player.overlapsCell(x, y, z)) { ui.toast("you're standing there"); return; }
  if (mode === 'message') {
    modalOpen = true;
    keys.clear();
    player.setMoveInput(0, 0);
    const text = await ui.showComposer();
    modalOpen = false;
    if (!text || !text.trim()) return;
    // the player may have wandered while the composer was up — re-check reach
    const stillInRange = skyMode
      ? withinSkyReach({ x, y, z })
      : player.getCenter().distanceTo(_cellCenter.set(x + 0.5, y + 0.5, z + 0.5)) <= PLACE_RANGE;
    if (!stillInRange) { ui.toast('too far away — walk closer'); return; }
    const noteText = text.trim().slice(0, 140);
    if (world.place(x, y, z, GLOW_INDEX, { m: noteText, n: profile.name })) {
      sync.sendPlace(x, y, z, GLOW_INDEX, { m: noteText });
      presence.say('left a note', 'note');   // the room hears it (the words stay on the block)
      audio.place();
      music.duck();
      music.notePlaced(y, GLOW_INDEX);
      messageUsed = true;
      ui.setMessageUsed(true);
      mode = 'color';
      ui.selectSwatch(selectedColor);
      bumpStreak();
    }
  } else {
    placeBrushAt(x, y, z, selectedColor);
  }
}

function attemptRemove(clientX, clientY) {
  if (views.mode !== 'follow' || voyage.active) return;
  const hit = pickAt(clientX, clientY);
  if (!hit || !hit.removeCell) return;
  if (!activeWorld.buildable) {
    ui.toast(`${getIsland(voyage.currentIsland).name} — look, don't touch`);
    return;
  }
  if (!hit.inRange) { ui.toast('too far away — walk closer'); return; }
  const { x, y, z } = hit.removeCell;
  if (!world.canRemove(x, y, z)) { ui.toast("that one's part of the island"); return; }
  const prev = world.get(x, y, z);
  if (world.remove(x, y, z)) {
    sync.sendRemove(x, y, z, prev && { c: prev.c, m: prev.m, n: prev.n });
    audio.remove();
    music.duck();
  }
}

function selectColor(i) {
  selectedColor = i;
  mode = 'color';
  ui.selectSwatch(i);
  audio.ui();
}

function selectMessageMode() {
  if (messageUsed) return;
  mode = 'message';
  ui.selectSwatch('message');
  audio.ui();
}

function selectEraseMode() {
  mode = 'erase';
  ui.selectErase();
  audio.ui();
}

function collectLooks() {
  _looks.length = 0;
  for (const p of pointers.values()) if (p.role === 'look') _looks.push(p);
  return _looks;
}

function touchDown(e) {
  const p = {
    role: 'look', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY,
    t0: performance.now(), travel: 0, consumed: false, timer: 0, shown: false,
  };
  if (joystickId === -1 && e.clientX < viewW / 2 && views.mode === 'follow' && !voyage.active) {
    // left half claims the joystick role, but taps and long-presses still
    // work there — the stick only takes over once the finger really drags
    p.role = 'stick';
    joystickId = e.pointerId;
  }
  pointers.set(e.pointerId, p);
  if (p.role === 'look') {
    const looks = collectLooks();
    if (looks.length >= 2) {
      // pinch begins: neither pointer may tap or long-press anymore
      for (const q of looks) {
        if (q.timer) { clearTimeout(q.timer); q.timer = 0; }
        q.consumed = true;
      }
      pinchDist = Math.hypot(looks[0].lx - looks[1].lx, looks[0].ly - looks[1].ly);
      return;
    }
  }
  p.timer = setTimeout(() => {
    p.timer = 0;
    p.consumed = true;
    attemptRemove(p.lx, p.ly);
  }, LONG_PRESS_MS);
}

function onPointerDown(e) {
  lastPointerType = e.pointerType;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer may already be gone */ }
  if (e.pointerType === 'touch') { touchDown(e); return; }
  mouse.down = true;
  mouse.dragging = false;
  mouse.button = e.button;
  mouse.x0 = e.clientX; mouse.y0 = e.clientY;
  mouse.lx = e.clientX; mouse.ly = e.clientY;
}

function onPointerMove(e) {
  if (e.pointerType !== 'touch') {
    lastPointerType = e.pointerType;
    pointerInside = true;
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!mouse.down) return;
    const dx = e.clientX - mouse.lx, dy = e.clientY - mouse.ly;
    mouse.lx = e.clientX; mouse.ly = e.clientY;
    if (!mouse.dragging && Math.hypot(e.clientX - mouse.x0, e.clientY - mouse.y0) > DRAG_PX) mouse.dragging = true;
    if (mouse.dragging && mouse.button === 0) {
      if (views.mode !== 'follow') views.orbit(dx, dy);
      else player.orbit(dx, dy);
    }
    return;
  }
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
  p.travel += Math.abs(dx) + Math.abs(dy);
  p.lx = e.clientX; p.ly = e.clientY;
  if (p.travel > TAP_PX && p.timer) { clearTimeout(p.timer); p.timer = 0; }
  if (p.role === 'stick') {
    if (!p.shown) {
      if (p.travel <= TAP_PX) return;   // still a potential tap — no stick yet
      p.shown = true;
      ui.joystickShow(p.x0, p.y0);
    }
    let jx = e.clientX - p.x0, jy = e.clientY - p.y0;
    const len = Math.hypot(jx, jy);
    if (len > JOYSTICK_RADIUS) { jx *= JOYSTICK_RADIUS / len; jy *= JOYSTICK_RADIUS / len; }
    ui.joystickMove(jx, jy);
    const mx = jx / JOYSTICK_RADIUS, mz = jy / JOYSTICK_RADIUS;
    if (Math.hypot(mx, mz) < JOYSTICK_DEADZONE) player.setMoveInput(0, 0);
    else player.setMoveInput(mx, mz);
    return;
  }
  const looks = collectLooks();
  if (looks.length >= 2) {
    const d = Math.hypot(looks[0].lx - looks[1].lx, looks[0].ly - looks[1].ly);
    if (pinchDist > 0) {
      if (views.mode !== 'follow') views.zoom((pinchDist - d) * PINCH_ZOOM_SCALE);
      else player.zoom((pinchDist - d) * PINCH_ZOOM_SCALE);
    }
    pinchDist = d;
  } else if (views.mode !== 'follow') {
    views.orbit(dx, dy);
  } else {
    player.orbit(dx, dy);
  }
}

function onPointerUp(e) {
  if (e.pointerType !== 'touch') {
    if (!mouse.down) return;
    const wasDrag = mouse.dragging;
    const button = mouse.button;
    mouse.down = false;
    mouse.dragging = false;
    if (e.type === 'pointercancel' || wasDrag) return;
    if (button === 0) {
      if (e.shiftKey) attemptRemove(e.clientX, e.clientY);
      else attemptPlace(e.clientX, e.clientY);
    } else if (button === 2) {
      attemptRemove(e.clientX, e.clientY);
    }
    return;
  }
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (p.timer) clearTimeout(p.timer);
  if (p.role === 'stick') {
    joystickId = -1;
    ui.joystickHide();
    player.setMoveInput(0, 0);
    // a left-half touch that never became a drag is just a tap — build with it
    if (e.type !== 'pointercancel' && !p.consumed &&
        performance.now() - p.t0 < TAP_MS && p.travel <= TAP_PX) {
      attemptPlace(p.lx, p.ly);
    }
    return;
  }
  pinchDist = 0;
  if (e.type === 'pointercancel' || p.consumed) return;
  if (performance.now() - p.t0 < TAP_MS && p.travel <= TAP_PX) attemptPlace(p.lx, p.ly);
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('pointerleave', () => { pointerInside = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // In sky mode the wheel raises/lowers the build-plane (Shift = ×4); pinch
  // still zooms. Otherwise the wheel zooms as before.
  if (skyMode && views.mode === 'follow' && !voyage.active) {
    adjustBuildY((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 4 : 1));
    return;
  }
  if (views.mode !== 'follow') views.zoom(e.deltaY);
  else player.zoom(e.deltaY);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (modalOpen) return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t && t.isContentEditable)) return;
  const key = e.key.toLowerCase();
  if (key === 'escape') {
    if (voyage.active) voyage.close();
    else setViewMode('follow');
    return;
  }
  if (MOVE_KEYS.has(key)) {
    keys.add(key);
    if (key.startsWith('arrow')) e.preventDefault();
    return;
  }
  if (key >= '1' && key <= '9') { selectColor(Number(key) - 1); return; }
  if (key === 'm') { selectMessageMode(); return; }
  if (key === 'e') { selectEraseMode(); return; }
  if (key === 'p') { setViewMode(views.mode === 'photo' ? 'follow' : 'photo'); return; }
  if (key === 'o') setViewMode(views.mode === 'sky' ? 'follow' : 'sky');
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function updateGhost(t) {
  let visible = false;
  if (lastPointerType !== 'touch' && pointerInside && !(mouse.down && mouse.dragging) && !contextLost &&
      views.mode === 'follow' && !voyage.active && activeWorld.buildable) {
    if (mode === 'erase') {
      // a red ghost over the block under the cursor that's removable
      const hit = pickAt(mouse.x, mouse.y);
      if (hit && hit.removeCell && hit.inRange &&
          world.canRemove(hit.removeCell.x, hit.removeCell.y, hit.removeCell.z)) {
        const { x, y, z } = hit.removeCell;
        ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
        ghostMat.color.copy(ERASE_GHOST_COLOR);
        ghostMat.opacity = reducedMotion ? 0.45 : 0.4 + 0.12 * Math.sin(t * 4);
        visible = true;
      }
    } else {
      // sky mode previews on the floating plane; ground mode on a block face
      const cell = skyMode ? skyCell(mouse.x, mouse.y) : null;
      const hit = skyMode
        ? (cell && withinSkyReach(cell) ? { placeCell: cell, inRange: true, block: null } : null)
        : pickAt(mouse.x, mouse.y);
      if (hit && hit.placeCell && hit.inRange && !(hit.block && hit.block.m)) {
        const { x, y, z } = hit.placeCell;
        if (world.canPlace(x, y, z) && !player.overlapsCell(x, y, z)) {
          ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
          ghostMat.color.copy(PALETTE_COLORS[mode === 'message' ? GLOW_INDEX : selectedColor]);
          ghostMat.opacity = reducedMotion ? 0.4 : 0.34 + 0.1 * Math.sin(t * 3);
          visible = true;
        }
      }
    }
  }
  ghost.visible = visible;
}

// The sky-mode disc floats at the build height, centred on the player, only
// while sky mode is on and the island is buildable.
function updateSkyDisc() {
  const on = skyMode && views.mode === 'follow' && !voyage.active && activeWorld.buildable;
  skyDisc.visible = on;
  if (on) {
    const c = player.getCenter();
    skyDisc.position.set(c.x, buildY + 0.02, c.z);
  }
}

// ── wiring ──────────────────────────────────────────────────────────────────

let saveTimer = 0;
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  saveWorld(world.serialize());
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}
world.onChange = scheduleSave;
window.addEventListener('pagehide', () => {
  if (saveTimer) flushSave();
  sync.flush();
  presence.disconnect();
});

function displayedStreak() {
  if (!storageAvailable) return 0;
  return profile.lastBuildDay >= TODAY.day - 1 ? profile.streak : 0;
}

function bumpStreak() {
  refreshDay();
  const day = TODAY.day;
  if (profile.lastBuildDay === day) return;
  profile.streak = profile.lastBuildDay === day - 1 ? profile.streak + 1 : 1;
  profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
  profile.lastBuildDay = day;
  savePlayer(profile);
  ui.setStreak(displayedStreak());
  if (MILESTONES.has(profile.streak)) {
    ui.celebrate(profile.streak);
    audio.milestone();
    for (const hex of CONFETTI_COLORS) world.spawnBurst(player.getCenter(), hex, 10);
  }
}

async function shareFlow() {
  refreshDay();
  const card = await ui.makeShareCard(renderer, scene, player.camera, {
    day: TODAY.day,
    prompt: TODAY.prompt,
    name: profile.name,
    streak: displayedStreak(),
  });
  const file = new File([card.blob], card.filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: card.shareText });
    } catch {
      // user closed the share sheet — nothing to do
    }
  } else {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(card.blob);
    link.download = card.filename;
    link.click();
    URL.revokeObjectURL(link.href);
    try {
      await navigator.clipboard.writeText(card.shareText);
      ui.toast('copied to clipboard');
    } catch {
      ui.toast('saved your postcard');
    }
  }
}

function setViewMode(modeName) {
  if (capture.busy || voyage.active) return;
  if (modeName === views.mode) return;
  views.setMode(modeName);
  ui.setPhotoMode(modeName === 'photo');
  ui.setHudHidden(modeName === 'photo');
  if (modeName !== 'follow') {
    keys.clear();
    player.setMoveInput(0, 0);
  }
  audio.ui();
}

function openViewsMenu() {
  if (capture.busy || voyage.active) return;
  const items = [];
  if (views.mode !== 'photo') items.push({ label: 'photo mode', onPick: () => setViewMode('photo') });
  if (views.mode !== 'sky') items.push({ label: 'sky view', onPick: () => setViewMode('sky') });
  if (views.mode !== 'follow') items.push({ label: 'back to walking', onPick: () => setViewMode('follow') });
  ui.openViewsMenu(items);
}

// The voyage: the compass lifts the camera to map altitude; the archipelago
// itself is the map. Arrival teleports the player in behind the descending
// camera, exactly the way the old travel() glide did.
const voyage = createVoyage({
  scene, renderer, player, views, ui,
  islands: { ISLANDS, getIsland, loadShowcase, bakeImpostor },
  residents: {
    plaza: { world, stand: PLAZA_STAND },
    gardeners: { world: botWorld, stand: GARDEN_STAND },
  },
  reducedMotion,
  onArrive: (id, { world: destWorld, dockSpawn }) => {
    activeWorld = destWorld;
    player.setWorld(destWorld);
    player.position.set(dockSpawn.x, 0, dockSpawn.z);
    player._physY = 0;
    player._velY = 0;
    // swing the follow rig behind the arrival shot so the handback glide
    // keeps the composed dock vista instead of whipping to a stale azimuth
    const o = getIsland(id).origin;
    if (dockSpawn.x !== o.x || dockSpawn.z !== o.z) {
      player._camYaw = Math.atan2(dockSpawn.x - o.x, dockSpawn.z - o.z);
    }
    // Leaving an island dismisses any build you summoned there (it's a personal
    // pad beside you, not a fixture). The whisper chat itself stays available.
    foundry.hide();
    // Re-light: bring the sun's shadow frustum to this island so it's lit, not
    // stuck in the plaza's dim ambient.
    const o2 = getIsland(id).origin;
    centerSunOn(o2.x, o2.z);
    // Rejoin the new island's presence room (connect closes the old socket).
    joinPresence(id);
  },
});

function compassFlow() {
  if (capture.busy || modalOpen) return;
  audio.ui();
  if (voyage.active) {
    voyage.close();
    return;
  }
  if (views.mode !== 'follow') setViewMode('follow');
  if (ui.chatExpanded) ui.toggleChat(false);   // leave the voyage with a clean, deterministic HUD
  voyage.open();
}

function openShareMenu() {
  if (capture.busy || voyage.active) return;
  const items = [{ label: 'postcard', onPick: () => { audio.ui(); shareFlow(); } }];
  if (capture.isSupported()) {
    items.push({ label: 'clip · 8s', onPick: () => { audio.ui(); clipFlow(); } });
  }
  ui.openShareMenu(items);
}

async function clipFlow() {
  if (capture.busy || voyage.active) return;
  refreshDay();
  ensureAudioAndMusic();
  const onGarden = activeWorld === botWorld;
  const result = await capture.recordClip({
    renderer, scene, player, views, ui, audio,
    meta: {
      day: TODAY.day,
      prompt: TODAY.prompt,
      name: profile.name,
      streak: displayedStreak(),
      center: onGarden ? GARDEN_CENTER : undefined,
    },
  });
  ui.setPhotoMode(false);
  ui.setHudHidden(false);
  if (!result) {
    ui.toast("couldn't film just now — try the postcard");
    return;
  }
  const shareText = `buildle day ${TODAY.day} · "${TODAY.prompt}"` +
    (displayedStreak() > 0 ? ` · 🔥${displayedStreak()}` : '') + ' · buildle.zonivan.com';
  const file = new File([result.blob], result.filename, { type: result.mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: shareText });
    } catch {
      // user closed the share sheet — nothing to do
    }
  } else {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.blob);
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(link.href);
    try {
      await navigator.clipboard.writeText(shareText);
      ui.toast('saved your clip');
    } catch {
      ui.toast('saved your clip');
    }
  }
}

async function helpFlow() {
  const fallback = profile.name || defaultName;
  modalOpen = true;
  keys.clear();
  player.setMoveInput(0, 0);
  const name = await ui.showHelp(fallback);
  modalOpen = false;
  profile.name = (name && name.trim()) || fallback;
  profile.helpSeen = true;
  savePlayer(profile);
  player.setName(profile.name);
  sync.setName(profile.name);
  ensureAudioAndMusic();   // the overlay dismissal is a user gesture
}

audio.setMuted(profile.muted);
window.addEventListener('pointerdown', () => ensureAudioAndMusic(), { once: true });

ui.init({
  onSelectColor: selectColor,
  onSelectMessage: selectMessageMode,
  onSelectErase: selectEraseMode,
  onShare: openShareMenu,
  onToggleSound: () => {
    audio.setMuted(!audio.muted);
    music.setMuted(audio.muted);
    lofi.setMuted(audio.muted);
    profile.muted = audio.muted;
    savePlayer(profile);
    audio.ui();
    return audio.muted;
  },
  onHelp: () => { audio.ui(); helpFlow(); },
  onViews: openViewsMenu,
  onCompass: compassFlow,
  onExitView: () => setViewMode('follow'),
  onChat: onChatToggle,
  onSky: toggleSky,
  onBuildY: (d) => adjustBuildY(d),
  onBrush: (n) => { brushSize = n | 0; },
  onMusicMode: toggleMusicMode,
});
ui.setPrompt(TODAY.prompt, TODAY.day);
ui.setStreak(displayedStreak());
ui.selectSwatch(selectedColor);
ui.selectBrush(brushSize);
ui.setBuildY(buildY);
ui.setMusicMode(profile.musicMode);

if (!profile.helpSeen || !storageAvailable) helpFlow();

// ── loop ────────────────────────────────────────────────────────────────────

function onResize() {
  if (capture.busy) return;   // capture owns the renderer size; it re-fits afterwards
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 2 || h < 2) return;   // hidden/backgrounded tabs can report 0–1px — keep the last sane size
  viewW = w;
  renderer.setSize(w, h);
  player.camera.aspect = w / h;
  player.camera.updateProjectionMatrix();
  // narrow screens get a proportionally smaller, lower banner so the prompt
  // fits the frustum and clears the (taller, wrapped) HUD pill
  const bannerFit = Math.min(1, Math.max(0.52, (w / h) / 1.55));
  banner.scale.set(BANNER_SCALE_X * bannerFit, BANNER_SCALE_Y * bannerFit, 1);
  bannerBaseY = (w / h) < 0.9 ? BANNER_Y - 1.3 : BANNER_Y;
  banner.position.y = bannerBaseY;
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => {
  onResize();
  setTimeout(onResize, 300);   // some mobile browsers settle dimensions late
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) onResize();   // a hidden-tab boot may have seen 1px dims
});
onResize();

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  ui.showContextLost();
});

function fadeOut() {
  const fade = document.getElementById('fade');
  if (!fade) return;
  fade.style.transition = `opacity ${FADE_MS}ms ease`;
  fade.style.pointerEvents = 'none';
  requestAnimationFrame(() => { fade.style.opacity = '0'; });
  setTimeout(() => { fade.style.display = 'none'; }, FADE_MS + 100);
}

const clock = new THREE.Clock();
let firstFrame = true;
let cloudsHiddenFor = false;   // tracks the last voyage state we synced clouds to
let dayCheckT = 0;
let lastChatCount = -1;        // only repaint the chat header when it changes

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), DT_MAX);
  const t = clock.elapsedTime;
  dayCheckT += dt;
  if (dayCheckT > 5) { dayCheckT = 0; refreshDay(); }
  if (joystickId === -1) {
    if (views.mode === 'follow' && !voyage.active) {
      const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const kz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      player.setMoveInput(kx, kz);
    } else {
      player.setMoveInput(0, 0);
    }
  }
  world.update(dt, t);
  botWorld.update(dt, t);
  gardener.update(dt, t);
  foundry.update(dt, t);
  updateGrow(dt);   // pace any AI build rising into the live world
  presence.update(dt, t);
  if (presence.count !== lastChatCount) { lastChatCount = presence.count; ui.setChatCount(presence.count); }
  player.update(dt, t);
  views.update(dt, t);
  voyage.update(dt, t);   // after player/views so its camera + fov writes win
  // The plaza's drift-clouds are ground-level atmosphere; from the voyage map
  // altitude they read as flat slabs, so hide them while the voyage owns the
  // camera (toggle only on transitions).
  if (voyage.active !== cloudsHiddenFor) {
    cloudsHiddenFor = voyage.active;
    for (const cloud of clouds) cloud.visible = !voyage.active;
  }
  // Painted horizon dissolves as the fog thins below every ground-level state.
  const silAlpha = Math.min(1, Math.max(0,
    (scene.fog.density - SILHOUETTE_FADE_LO) / (FOG_DENSITY_MIN - SILHOUETTE_FADE_LO)));
  for (const s of silhouettes) {
    s.material.opacity = silAlpha;
    s.visible = silAlpha > 0.02;
  }
  water.update(dt);
  updateEnvironment(dt, t);
  updateGhost(t);
  updateSkyDisc();
  // Distance-compensated fog: the camera pulling away from the player eases
  // the density down, so a zoomed-out island never drowns in the haze.
  // The voyage owns the fog while it is active (the ascent lifts it).
  if (!voyage.active) {
    const fogDist = player.camera.position.distanceTo(player.position);
    const fogTarget = Math.min(FOG_DENSITY, Math.max(FOG_DENSITY_MIN,
      FOG_DENSITY * (FOG_COMP_NEAR / Math.max(fogDist, FOG_COMP_NEAR))));
    scene.fog.density += (fogTarget - scene.fog.density) * (1 - Math.exp(-FOG_COMP_RATE * dt));
  }
  if (!contextLost) renderer.render(scene, player.camera);
  if (firstFrame) {
    firstFrame = false;
    fadeOut();
  }
}
requestAnimationFrame(tick);
