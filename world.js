// world.js — voxel data, chunked culled meshing, the floating island, seed
// content, and the small physical joys (pop-ins, particles, envelopes).

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palette & bounds (CONTRACT §4)

export const PALETTE = [
  { name: 'Cloud White', hex: '#F7F1E8' },
  { name: 'Sandstone', hex: '#E8C99B' },
  { name: 'Terracotta', hex: '#D98E73' },
  { name: 'Rose Clay', hex: '#C96F7B' },
  { name: 'Dusty Plum', hex: '#8E6A9E' },
  { name: 'Twilight Blue', hex: '#5B6EA8' },
  { name: 'Teal Lagoon', hex: '#4E9B9B' },
  { name: 'Sage', hex: '#9BB88A' },
  { name: 'Olive Gold', hex: '#C2B25A' },
  { name: 'Honey', hex: '#EBB44E' },
  { name: 'Ember Orange', hex: '#E07B39' },
  { name: 'Brick Red', hex: '#B5483E' },
  { name: 'Cocoa', hex: '#6E4B3A' },
  { name: 'Slate', hex: '#4A4E5E' },
  { name: 'Ink', hex: '#2B2D3A' },
  { name: 'Glow Lantern', hex: '#FFE8A8' },
];
export const GLOW_INDEX = 15;
export const WORLD_MIN = -32;
export const WORLD_MAX = 31;
export const WORLD_HEIGHT = 32;

// ---------------------------------------------------------------------------
// Tunables

const ISLAND_RADIUS = 33; // ground mask: hypot(x + 0.5, z + 0.5) <= 33
const CHUNK_SIZE = 16; // columns per chunk side
const CHUNKS_PER_SIDE = 4; // 4×4 chunk grid covers the 64×64 island

const GRASS_HEX = '#A8B86E';
const EARTH_HEX = '#8A6B52';
const ROCK_HEX = '#6B5B73';
const WATER_HEX = '#4E9B9B';
const PATH_HEX = '#E8C99B';
const GRASS_JITTER = 0.04; // ±4% per-cell lightness on grass tops
const POND_RECESS = 0.18; // water surface sits this far below the grass
const SKIRT_BOTTOM = -1.8; // earth band under the island rim

// Per-face shade factors — fake ambient occlusion, the hand-shaded look.
const SHADE = { top: 1.0, bottom: 0.85, x: 0.92, z: 0.96 };

const GLOW_EMISSIVE = '#FFE8A8';
const GLOW_PULSE_BASE = 0.55;
const GLOW_PULSE_AMP = 0.3;
const GLOW_PULSE_SPEED = 2.2;

const POP_IN_S = 0.18; // place: scale 0.6 → 1.0 with back-ease
const POP_OUT_S = 0.12; // remove: quick scale-out
const POP_POOL_SIZE = 12;

const PARTICLE_CAP = 256;
const PARTICLE_SIZE = 0.12;
const PARTICLE_GRAVITY = 16;
const BURST_PLACE = 7;
const BURST_REMOVE = 4;

const ENVELOPE_RISE = 1.9; // sprite height above the block's base (0.9 above its top)
const ENVELOPE_SCALE = 0.55;
const ENVELOPE_BOB = 0.07;
const ENVELOPE_BOB_SPEED = 1.7;

export const PLACE_RANGE = 6.0;

// ---------------------------------------------------------------------------
// Small helpers

export function isGround(x, z) {
  return (
    x >= WORLD_MIN && x <= WORLD_MAX &&
    z >= WORLD_MIN && z <= WORLD_MAX &&
    Math.hypot(x + 0.5, z + 0.5) <= ISLAND_RADIUS
  );
}

const key = (x, y, z) => `${x},${y},${z}`;
const colKey = (x, z) => `${x},${z}`;

function chunkIndex(x, z) {
  return ((z - WORLD_MIN) >> 4) * CHUNKS_PER_SIDE + ((x - WORLD_MIN) >> 4);
}

// Deterministic per-cell hash in [0, 1) — grass jitter, rock wobble, canopy accents.
function hash2(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function easeOutBack(t) {
  const s = 1.70158;
  const u = t - 1;
  return 1 + u * u * ((s + 1) * u + s);
}

// ---------------------------------------------------------------------------
// Geometry building

// Unit-cube faces: outward normal, shade factor, CCW corners (triangles 0,1,2 / 0,2,3).
const FACES = [
  { n: [1, 0, 0], shade: SHADE.x, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], shade: SHADE.x, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], shade: SHADE.top, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], shade: SHADE.bottom, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], shade: SHADE.z, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], shade: SHADE.z, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const FACE_PX = FACES[0];
const FACE_NX = FACES[1];
const FACE_PY = FACES[2];
const FACE_NY = FACES[3];
const FACE_PZ = FACES[4];
const FACE_NZ = FACES[5];

// Accumulates shaded vertex-colored quads, then bakes one indexed BufferGeometry.
class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.idx = [];
  }
  face(f, x, y, z, sx, sy, sz, color) {
    const base = this.pos.length / 3;
    const r = color.r * f.shade;
    const g = color.g * f.shade;
    const b = color.b * f.shade;
    for (let i = 0; i < 4; i++) {
      const c = f.c[i];
      this.pos.push(x + c[0] * sx, y + c[1] * sy, z + c[2] * sz);
      this.nrm.push(f.n[0], f.n[1], f.n[2]);
      this.col.push(r, g, b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(x, y, z, sx, sy, sz, color) {
    for (const f of FACES) this.face(f, x, y, z, sx, sy, sz, color);
  }
  build() {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(
      this.pos.length / 3 > 65535
        ? new THREE.Uint32BufferAttribute(this.idx, 1)
        : new THREE.Uint16BufferAttribute(this.idx, 1)
    );
    g.computeBoundingSphere();
    return g;
  }
}

// Shared stand-in for empty chunks: no triangles, pre-set bounds, never disposed.
const EMPTY_GEO = new THREE.BufferGeometry();
EMPTY_GEO.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
EMPTY_GEO.boundingSphere = new THREE.Sphere();
EMPTY_GEO.boundingBox = new THREE.Box3();

const PALETTE_LINEAR = PALETTE.map((p) => new THREE.Color(p.hex));
const C_GRASS = new THREE.Color(GRASS_HEX);
const C_EARTH = new THREE.Color(EARTH_HEX);
const C_ROCK = new THREE.Color(ROCK_HEX);
const C_WATER = new THREE.Color(WATER_HEX);
const C_PATH = new THREE.Color(PATH_HEX);

const _jc = new THREE.Color(); // scratch — GeoBuilder.face copies components immediately
function jitterColor(base, x, z, amount) {
  const f = 1 + (hash2(x, z) * 2 - 1) * amount;
  return _jc.copy(base).multiplyScalar(f);
}

// ---------------------------------------------------------------------------
// Hand-authored seed content (CONTRACT §4, BRIEF §8). Protection sets are
// derived from these constants on every load — never persisted. Everything is
// composed to read well from the spawn at (1, 0, 16) looking north.

// Pond: organic recessed blob north-east of the plaza.
const POND_CENTER = [5.5, -4.5];
const POND_RADIUS = 3.3;
const POND_WOBBLE = 0.9; // per-cell radius wobble keeps the shoreline organic

// Plaza: small sandstone circle at world center where the path arrives.
const PLAZA_RADIUS = 2.8;

// Path spine: [z, xLeft] rows, two cells wide, winding in from the south rim.
const PATH_SPINE = [
  [31, 1], [30, 1], [29, 1], [28, 2], [27, 2], [26, 2], [25, 3], [24, 3],
  [23, 3], [22, 2], [21, 2], [20, 1], [19, 1], [18, 0], [17, 0], [16, 0],
  [15, -1], [14, -1], [13, -1], [12, 0], [11, 0], [10, 0], [9, 1], [8, 1],
  [7, 1], [6, 1], [5, 0], [4, 0], [3, 0],
];
// One-wide spur west along z = 7 to the half-built house's doorway.
const PATH_SPUR = { z: 7, x0: -8, x1: 0 };

const PATH_SET = (() => {
  const s = new Set();
  for (const [z, x0] of PATH_SPINE) {
    s.add(colKey(x0, z));
    s.add(colKey(x0 + 1, z));
  }
  for (let x = PATH_SPUR.x0; x <= PATH_SPUR.x1; x++) s.add(colKey(x, PATH_SPUR.z));
  const r = Math.ceil(PLAZA_RADIUS) + 1;
  for (let x = -r; x <= r; x++) {
    for (let z = -r; z <= r; z++) {
      if (Math.hypot(x + 0.5, z + 0.5) <= PLAZA_RADIUS) s.add(colKey(x, z));
    }
  }
  return s;
})();

function inPond(x, z) {
  if (!isGround(x, z)) return false;
  const dx = x + 0.5 - POND_CENTER[0];
  const dz = z + 0.5 - POND_CENTER[1];
  return Math.hypot(dx, dz) <= POND_RADIUS + (hash2(x, z) - 0.5) * POND_WOBBLE;
}

function forEachPondCell(fn) {
  const r = POND_RADIUS + POND_WOBBLE;
  const x0 = Math.floor(POND_CENTER[0] - r);
  const x1 = Math.ceil(POND_CENTER[0] + r);
  const z0 = Math.floor(POND_CENTER[1] - r);
  const z1 = Math.ceil(POND_CENTER[1] + r);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (inPond(x, z)) fn(x, z);
    }
  }
}

// Trees: [trunkX, trunkZ, trunkHeight, canopyTemplate, mirrorX]
const TREES = [
  [-6, -3, 4, 0, 1],
  [8, 2, 3, 1, 1],
  [-3, -12, 4, 0, -1],
  [13, -8, 3, 1, -1],
  [-16, -7, 4, 0, 1],
];

// Canopy offsets [dx, dy, dz], dy relative to the topmost trunk block.
const CANOPIES = [
  [ // full and billowy, asymmetric collar
    [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [-1, 0, -1], [1, 0, 1],
    [-1, 1, -1], [0, 1, -1], [1, 1, -1], [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, 1, 1], [0, 1, 1], [1, 1, 1], [2, 1, 0], [-2, 1, 0], [0, 1, 2], [2, 1, -1],
    [0, 2, 0], [1, 2, 0], [-1, 2, 0], [0, 2, -1], [0, 2, 1], [1, 2, 1],
    [0, 3, 0],
  ],
  [ // smaller, leaning
    [-1, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 0, -1],
    [0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, -1], [0, 1, 1], [1, 1, 1], [2, 1, 1],
    [0, 2, 0], [0, 2, 1],
  ],
];

function forEachTreeBlock(fn) {
  for (const [tx, tz, h, template, mirror] of TREES) {
    for (let y = 0; y < h; y++) fn(tx, y, tz, 12); // Cocoa trunk
    for (const [dx, dy, dz] of CANOPIES[template]) {
      const x = tx + dx * mirror;
      const y = h - 1 + dy;
      const z = tz + dz;
      fn(x, y, z, hash2(x + y * 53, z - y * 29) < 0.28 ? 8 : 7); // Olive accents in Sage
    }
  }
}

// Half-built terracotta house near (-11, 7). Doorway faces the plaza (east),
// the back wall is nearly done, the front is gap-toothed and abandoned.
const HOUSE_BLOCKS = [
  // north wall (z = 5) — the "finished" end
  [-14, 0, 5], [-14, 1, 5], [-14, 2, 5],
  [-13, 0, 5], [-13, 1, 5], [-13, 2, 5],
  [-12, 0, 5], [-12, 1, 5],
  [-11, 0, 5], [-11, 1, 5],
  [-10, 0, 5],
  [-9, 0, 5], [-9, 1, 5],
  // west wall (x = -14) with a window gap at (-14, 1, 7)
  [-14, 0, 6], [-14, 1, 6], [-14, 2, 6],
  [-14, 0, 7], [-14, 2, 7],
  [-14, 0, 8], [-14, 1, 8], [-14, 2, 8],
  [-14, 0, 9], [-14, 1, 9], [-14, 2, 9],
  // south wall (z = 9) — gap-toothed, facing the spawn path
  [-13, 0, 9], [-13, 1, 9],
  [-12, 0, 9],
  [-10, 0, 9],
  [-9, 0, 9], [-9, 1, 9],
  // east wall (x = -9) with the doorway at z = 7
  [-9, 0, 6], [-9, 1, 6],
  [-9, 0, 8],
  // a pile of bricks the builder never got to
  [-12, 0, 11], [-12, 1, 11], [-11, 0, 11], [-11, 0, 12],
];
const HOUSE_MESSAGE = { x: -9, y: 2, z: 9, m: 'finish my house? - day 1', n: 'the builder' };

// Scattered builds: [x, y, z, colorIndex]
const SCATTER_BLOCKS = [
  // flower patch west of the path
  [-4, 0, 3, 3], [-3, 0, 4, 9], [-5, 0, 4, 0], [-4, 0, 5, 4], [-2, 0, 3, 3],
  // tiny bench facing the pond
  [10, 0, -5, 12], [10, 0, -3, 12], [10, 1, -5, 1], [10, 1, -4, 1], [10, 1, -3, 1],
  // wayfinding cairn beside the path — warm stones, one slate cap
  [7, 0, 22, 1], [7, 1, 22, 13], [8, 0, 23, 1],
];

// Tapering rock underside: shrinking inset layers, centers drifting so the
// island leans a little, per-cell wobble for a ragged silhouette.
const ROCK_LAYERS = [
  { r: 26, cx: 1.5, cz: -1, y0: -4.2, y1: -1.8, wobble: 2.2 },
  { r: 18, cx: 2.5, cz: -2, y0: -6.6, y1: -4.2, wobble: 1.8 },
  { r: 11, cx: 3, cz: -2.5, y0: -9.0, y1: -6.6, wobble: 1.4 },
  { r: 5.5, cx: 3, cz: -3, y0: -11.2, y1: -9.0, wobble: 0.8 },
];

function inRockLayer(i, x, z) {
  const L = ROCK_LAYERS[i];
  if (!L) return false;
  const wob = (hash2(x + i * 131, z - i * 57) - 0.5) * L.wobble;
  return Math.hypot(x + 0.5 - L.cx, z + 0.5 - L.cz) <= L.r + wob;
}

// A few hanging rock chunks drifting just below the underside: [x, y, z, size]
const HANGING_ROCKS = [
  [-21, -6.2, 4, 1.6],
  [14, -7.4, -18, 2.2],
  [22, -5.2, 10, 1.2],
  [-7, -13.4, -2, 1.8],
  [5, -10.6, 8, 1.0],
];

// ---------------------------------------------------------------------------

export class World {
  constructor(scene, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.blocks = new Map();
    this.onChange = null;
    this.protectedColumns = new Set();
    this.protectedBlocks = new Set();

    this._chunkKeys = Array.from(
      { length: CHUNKS_PER_SIDE * CHUNKS_PER_SIDE },
      () => new Set()
    );
    this._hidden = new Set(); // cells excluded from chunk geometry while popping in

    this._blockMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this._glowMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: GLOW_EMISSIVE,
      emissiveIntensity: GLOW_PULSE_BASE,
    });

    this._pickables = [];
    this._chunks = [];
    for (let i = 0; i < CHUNKS_PER_SIDE * CHUNKS_PER_SIDE; i++) {
      const solid = new THREE.Mesh(EMPTY_GEO, this._blockMat);
      const glow = new THREE.Mesh(EMPTY_GEO, this._glowMat);
      for (const mesh of [solid, glow]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        scene.add(mesh);
        this._pickables.push(mesh);
      }
      this._chunks.push({ solid, glow });
    }

    this._buildIsland();
    this._initParticles();
    this._initPops();
    this._initEnvelopes();

    this._tmpVec = new THREE.Vector3();
    this._tmpColor = new THREE.Color();
    this._tmpMat = new THREE.Matrix4();
    this._hits = [];
    this._cellA = { x: 0, y: 0, z: 0 };
    this._cellB = { x: 0, y: 0, z: 0 };
    this._pickResult = { placeCell: null, removeCell: null, block: null, inRange: false };
  }

  // -- data -----------------------------------------------------------------

  load(saved) {
    this._cancelAllPops();
    this.blocks.clear();
    for (const set of this._chunkKeys) set.clear();
    this._hidden.clear();
    if (saved && typeof saved === 'object') {
      for (const [k, v] of Object.entries(saved)) {
        if (!v || typeof v.c !== 'number') continue;
        const parts = k.split(',');
        if (parts.length !== 3) continue;
        const x = +parts[0], y = +parts[1], z = +parts[2];
        if (!this._inBounds(x, y, z)) continue;
        const entry = { c: Math.min(15, Math.max(0, v.c | 0)) };
        if (typeof v.m === 'string' && v.m) entry.m = v.m.slice(0, 140);
        if (typeof v.n === 'string' && v.n) entry.n = v.n;
        this.blocks.set(key(x, y, z), entry);
      }
    }
    if (this.blocks.size === 0) this._seedWorld();
    this._buildProtection();
    for (const k of this.blocks.keys()) {
      const i = k.indexOf(',');
      const j = k.lastIndexOf(',');
      this._chunkKeys[chunkIndex(+k.slice(0, i), +k.slice(j + 1))].add(k);
    }
    for (let ci = 0; ci < this._chunks.length; ci++) this._rebuildChunk(ci);
    this._rebuildEnvelopes();
  }

  serialize() {
    const out = {};
    for (const [k, v] of this.blocks) {
      const entry = { c: v.c };
      if (v.m) entry.m = v.m;
      if (v.n) entry.n = v.n;
      out[k] = entry;
    }
    return out;
  }

  get(x, y, z) {
    return this.blocks.get(key(x, y, z));
  }

  isSolid(x, y, z) {
    return this.blocks.has(key(x, y, z)) || (y === -1 && isGround(x, z));
  }

  canPlace(x, y, z) {
    return (
      this._inBounds(x, y, z) &&
      !this.blocks.has(key(x, y, z)) &&
      !this.protectedColumns.has(colKey(x, z))
    );
  }

  canRemove(x, y, z) {
    const k = key(x, y, z);
    return this.blocks.has(k) && !this.protectedBlocks.has(k);
  }

  place(x, y, z, colorIndex, extra = {}) {
    if (!this.canPlace(x, y, z)) return false;
    const c = Math.min(15, Math.max(0, colorIndex | 0));
    const entry = { c };
    if (typeof extra.m === 'string' && extra.m) entry.m = extra.m.slice(0, 140);
    if (typeof extra.n === 'string' && extra.n) entry.n = extra.n;
    const k = key(x, y, z);
    this.blocks.set(k, entry);
    this._chunkKeys[chunkIndex(x, z)].add(k);
    this._killPopAt(x, y, z);
    if (!this.reducedMotion) this._startPop(k, x, y, z, c, 'in');
    this._rebuildCellChunks(x, y, z);
    if (entry.m) this._addEnvelope(k, x, y, z);
    this.spawnBurst(this._tmpVec.set(x + 0.5, y + 0.5, z + 0.5), PALETTE[c].hex, BURST_PLACE);
    if (this.onChange) this.onChange();
    return true;
  }

  remove(x, y, z) {
    if (!this.canRemove(x, y, z)) return false;
    const k = key(x, y, z);
    const entry = this.blocks.get(k);
    this.blocks.delete(k);
    this._chunkKeys[chunkIndex(x, z)].delete(k);
    this._killPopAt(x, y, z);
    if (!this.reducedMotion) this._startPop(null, x, y, z, entry.c, 'out');
    this._rebuildCellChunks(x, y, z);
    this._removeEnvelope(k);
    this.spawnBurst(this._tmpVec.set(x + 0.5, y + 0.5, z + 0.5), PALETTE[entry.c].hex, BURST_REMOVE);
    if (this.onChange) this.onChange();
    return true;
  }

  pick(raycaster, playerCenter) {
    this._hits.length = 0;
    raycaster.intersectObjects(this._pickables, false, this._hits);
    const hit = this._hits[0];
    if (!hit || !hit.face) return null;
    const res = this._pickResult; // reused — callers must not retain it
    res.placeCell = null;
    res.removeCell = null;
    res.block = null;
    res.inRange = false;
    const p = hit.point;
    // Chunk/island meshes are untransformed and pop cubes only translate and
    // uniform-scale, so face normals stay world-axis-aligned.
    const n = hit.face.normal;
    const px = Math.floor(p.x + n.x * 0.5);
    const py = Math.floor(p.y + n.y * 0.5);
    const pz = Math.floor(p.z + n.z * 0.5);
    if (this._inBounds(px, py, pz) && !this.blocks.has(key(px, py, pz))) {
      this._cellA.x = px;
      this._cellA.y = py;
      this._cellA.z = pz;
      res.placeCell = this._cellA;
    }
    if (hit.object !== this._islandTop) {
      const rx = Math.floor(p.x - n.x * 0.5);
      const ry = Math.floor(p.y - n.y * 0.5);
      const rz = Math.floor(p.z - n.z * 0.5);
      const rk = key(rx, ry, rz);
      if (this.blocks.has(rk)) {
        this._cellB.x = rx;
        this._cellB.y = ry;
        this._cellB.z = rz;
        res.removeCell = this._cellB;
        res.block = this.blocks.get(rk);
      }
    }
    if (!res.placeCell && !res.removeCell) return null;
    const cell = res.placeCell || res.removeCell;
    res.inRange =
      playerCenter.distanceTo(this._tmpVec.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5)) <=
      PLACE_RANGE;
    return res;
  }

  update(dt, t) {
    if (!this.reducedMotion) {
      this._glowMat.emissiveIntensity = GLOW_PULSE_BASE + GLOW_PULSE_AMP * Math.sin(t * GLOW_PULSE_SPEED);
      for (const sprite of this._envelopes.values()) {
        const u = sprite.userData;
        sprite.position.y = u.baseY + Math.sin(t * ENVELOPE_BOB_SPEED + u.phase) * ENVELOPE_BOB;
      }
    }
    this._updatePops(dt);
    this._updateParticles(dt);
  }

  _inBounds(x, y, z) {
    return (
      Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
      x >= WORLD_MIN && x <= WORLD_MAX &&
      z >= WORLD_MIN && z <= WORLD_MAX &&
      y >= 0 && y < WORLD_HEIGHT
    );
  }

  // -- seeding & protection ---------------------------------------------------

  _seedWorld() {
    forEachTreeBlock((x, y, z, c) => this.blocks.set(key(x, y, z), { c }));
    for (const [x, y, z] of HOUSE_BLOCKS) this.blocks.set(key(x, y, z), { c: 2 });
    this.blocks.set(key(HOUSE_MESSAGE.x, HOUSE_MESSAGE.y, HOUSE_MESSAGE.z), {
      c: GLOW_INDEX,
      m: HOUSE_MESSAGE.m,
      n: HOUSE_MESSAGE.n,
    });
    for (const [x, y, z, c] of SCATTER_BLOCKS) this.blocks.set(key(x, y, z), { c });
  }

  _buildProtection() {
    this.protectedColumns.clear();
    this.protectedBlocks.clear();
    for (const ck of PATH_SET) this.protectedColumns.add(ck);
    forEachPondCell((x, z) => this.protectedColumns.add(colKey(x, z)));
    for (const [tx, tz] of TREES) this.protectedColumns.add(colKey(tx, tz));
    forEachTreeBlock((x, y, z) => this.protectedBlocks.add(key(x, y, z)));
    this.protectedBlocks.add(key(HOUSE_MESSAGE.x, HOUSE_MESSAGE.y, HOUSE_MESSAGE.z));
  }

  // -- chunk meshing ----------------------------------------------------------

  _rebuildChunk(ci) {
    const solid = new GeoBuilder();
    const glow = new GeoBuilder();
    for (const k of this._chunkKeys[ci]) {
      if (this._hidden.has(k)) continue;
      const data = this.blocks.get(k);
      const parts = k.split(',');
      const x = +parts[0], y = +parts[1], z = +parts[2];
      const builder = data.c === GLOW_INDEX ? glow : solid;
      const color = PALETTE_LINEAR[data.c];
      for (const f of FACES) {
        if (this._cullSolid(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
        builder.face(f, x, y, z, 1, 1, 1, color);
      }
    }
    const chunk = this._chunks[ci];
    this._setChunkGeometry(chunk.solid, solid.build());
    this._setChunkGeometry(chunk.glow, glow.build());
  }

  _cullSolid(x, y, z) {
    if (y === -1) return isGround(x, z);
    const k = key(x, y, z);
    return this.blocks.has(k) && !this._hidden.has(k);
  }

  _setChunkGeometry(mesh, geo) {
    if (mesh.geometry !== EMPTY_GEO) mesh.geometry.dispose();
    mesh.geometry = geo || EMPTY_GEO;
    mesh.visible = geo !== null;
  }

  // Rebuild the touched chunk, plus the face-adjacent neighbor on a border.
  _rebuildCellChunks(x, y, z) {
    this._rebuildChunk(chunkIndex(x, z));
    const lx = (x - WORLD_MIN) & (CHUNK_SIZE - 1);
    const lz = (z - WORLD_MIN) & (CHUNK_SIZE - 1);
    if (lx === 0 && x > WORLD_MIN) this._rebuildChunk(chunkIndex(x - 1, z));
    if (lx === CHUNK_SIZE - 1 && x < WORLD_MAX) this._rebuildChunk(chunkIndex(x + 1, z));
    if (lz === 0 && z > WORLD_MIN) this._rebuildChunk(chunkIndex(x, z - 1));
    if (lz === CHUNK_SIZE - 1 && z < WORLD_MAX) this._rebuildChunk(chunkIndex(x, z + 1));
  }

  // -- the island (static, built once) ----------------------------------------

  _buildIsland() {
    const top = new GeoBuilder();
    const under = new GeoBuilder();
    const skirtH = -SKIRT_BOTTOM;
    for (let x = WORLD_MIN; x <= WORLD_MAX; x++) {
      for (let z = WORLD_MIN; z <= WORLD_MAX; z++) {
        if (!isGround(x, z)) continue;
        const pond = inPond(x, z);
        if (pond) {
          top.face(FACE_PY, x, -1 - POND_RECESS, z, 1, 1, 1, jitterColor(C_WATER, x, z, 0.05));
          // earth lip where the water meets higher ground
          if (isGround(x + 1, z) && !inPond(x + 1, z))
            top.face(FACE_NX, x + 1, -POND_RECESS, z, 1, POND_RECESS, 1, jitterColor(C_EARTH, x + 1, z, 0.05));
          if (isGround(x - 1, z) && !inPond(x - 1, z))
            top.face(FACE_PX, x - 1, -POND_RECESS, z, 1, POND_RECESS, 1, jitterColor(C_EARTH, x - 1, z, 0.05));
          if (isGround(x, z + 1) && !inPond(x, z + 1))
            top.face(FACE_NZ, x, -POND_RECESS, z + 1, 1, POND_RECESS, 1, jitterColor(C_EARTH, x, z + 1, 0.05));
          if (isGround(x, z - 1) && !inPond(x, z - 1))
            top.face(FACE_PZ, x, -POND_RECESS, z - 1, 1, POND_RECESS, 1, jitterColor(C_EARTH, x, z - 1, 0.05));
        } else if (PATH_SET.has(colKey(x, z))) {
          top.face(FACE_PY, x, -1, z, 1, 1, 1, jitterColor(C_PATH, x, z, 0.04));
        } else {
          top.face(FACE_PY, x, -1, z, 1, 1, 1, jitterColor(C_GRASS, x, z, GRASS_JITTER));
        }
        // earth skirt around the rim
        const earth = jitterColor(C_EARTH, x, z, 0.06);
        if (!isGround(x + 1, z)) under.face(FACE_PX, x, SKIRT_BOTTOM, z, 1, skirtH, 1, earth);
        if (!isGround(x - 1, z)) under.face(FACE_NX, x, SKIRT_BOTTOM, z, 1, skirtH, 1, earth);
        if (!isGround(x, z + 1)) under.face(FACE_PZ, x, SKIRT_BOTTOM, z, 1, skirtH, 1, earth);
        if (!isGround(x, z - 1)) under.face(FACE_NZ, x, SKIRT_BOTTOM, z, 1, skirtH, 1, earth);
      }
    }
    for (let i = 0; i < ROCK_LAYERS.length; i++) {
      const L = ROCK_LAYERS[i];
      const h = L.y1 - L.y0;
      const x0 = Math.floor(L.cx - L.r - 2);
      const x1 = Math.ceil(L.cx + L.r + 2);
      const z0 = Math.floor(L.cz - L.r - 2);
      const z1 = Math.ceil(L.cz + L.r + 2);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (!inRockLayer(i, x, z)) continue;
          const rock = jitterColor(C_ROCK, x + i * 37, z - i * 61, 0.07);
          if (!inRockLayer(i, x + 1, z)) under.face(FACE_PX, x, L.y0, z, 1, h, 1, rock);
          if (!inRockLayer(i, x - 1, z)) under.face(FACE_NX, x, L.y0, z, 1, h, 1, rock);
          if (!inRockLayer(i, x, z + 1)) under.face(FACE_PZ, x, L.y0, z, 1, h, 1, rock);
          if (!inRockLayer(i, x, z - 1)) under.face(FACE_NZ, x, L.y0, z, 1, h, 1, rock);
          if (!inRockLayer(i + 1, x, z)) under.face(FACE_NY, x, L.y0, z, 1, 1, 1, rock);
        }
      }
    }
    for (const [x, y, z, s] of HANGING_ROCKS) {
      under.box(x - s / 2, y - s / 2, z - s / 2, s, s, s,
        jitterColor(C_ROCK, Math.round(x), Math.round(z), 0.08));
    }
    this._islandTop = new THREE.Mesh(top.build(), this._blockMat);
    this._islandTop.receiveShadow = true;
    this._islandTop.matrixAutoUpdate = false;
    this.scene.add(this._islandTop);
    this._pickables.push(this._islandTop);
    const underside = new THREE.Mesh(under.build(), this._blockMat);
    underside.receiveShadow = true;
    underside.matrixAutoUpdate = false;
    this.scene.add(underside);
  }

  // -- pop-in / scale-out animations -------------------------------------------
  // While a placed block pops in, its cell is excluded from the chunk geometry
  // and a pooled solo cube animates in its stead — no double draw, no flicker.

  _initPops() {
    this._popGeo = new THREE.BoxGeometry(1, 1, 1);
    this._popFree = [];
    this._pops = [];
    for (let i = 0; i < POP_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this._popGeo, new THREE.MeshLambertMaterial());
      mesh.visible = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this._popFree.push(mesh);
    }
  }

  _startPop(k, x, y, z, colorIndex, mode) {
    if (this._popFree.length === 0) this._finishPop(this._pops[0]); // recycle the oldest
    const mesh = this._popFree.pop();
    const mat = mesh.material;
    mat.color.copy(PALETTE_LINEAR[colorIndex]);
    if (colorIndex === GLOW_INDEX) {
      mat.emissive.set(GLOW_EMISSIVE);
      mat.emissiveIntensity = 0.7;
    } else {
      mat.emissive.set(0x000000);
    }
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.scale.setScalar(mode === 'in' ? 0.6 : 1);
    mesh.visible = true;
    if (mode === 'in') {
      this._hidden.add(k);
      // The popping cube stands in for its (hidden) cell in the chunk mesh,
      // so it must be raycastable too — rapid stacking clicks land on it.
      this._pickables.push(mesh);
    }
    this._pops.push({
      mesh, key: k, x, y, z, mode,
      age: 0,
      dur: mode === 'in' ? POP_IN_S : POP_OUT_S,
    });
  }

  _finishPop(pop, rebuild = true) {
    const i = this._pops.indexOf(pop);
    if (i !== -1) this._pops.splice(i, 1);
    pop.mesh.visible = false;
    this._popFree.push(pop.mesh);
    if (pop.mode === 'in') {
      this._hidden.delete(pop.key);
      const pi = this._pickables.indexOf(pop.mesh);
      if (pi !== -1) this._pickables.splice(pi, 1);
      if (rebuild) this._rebuildCellChunks(pop.x, pop.y, pop.z);
    }
  }

  _killPopAt(x, y, z) {
    for (let i = this._pops.length - 1; i >= 0; i--) {
      const p = this._pops[i];
      if (p.x === x && p.y === y && p.z === z) this._finishPop(p, false);
    }
  }

  _cancelAllPops() {
    for (let i = this._pops ? this._pops.length - 1 : -1; i >= 0; i--) {
      this._finishPop(this._pops[i], false);
    }
  }

  _updatePops(dt) {
    for (let i = this._pops.length - 1; i >= 0; i--) {
      const p = this._pops[i];
      p.age += dt;
      const k = Math.min(p.age / p.dur, 1);
      if (p.mode === 'in') p.mesh.scale.setScalar(0.6 + 0.4 * easeOutBack(k));
      else p.mesh.scale.setScalar(Math.max(1 - k * k, 0.001));
      if (k >= 1) this._finishPop(p);
    }
  }

  // -- particles (pooled, palette-colored squares) ------------------------------

  _initParticles() {
    const geo = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), PARTICLE_CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, white);
    }
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);
    this._particleMesh = mesh;
    this._particles = {
      pos: new Float32Array(PARTICLE_CAP * 3),
      vel: new Float32Array(PARTICLE_CAP * 3),
      life: new Float32Array(PARTICLE_CAP),
      maxLife: new Float32Array(PARTICLE_CAP),
    };
    this._particleAlive = false;
  }

  spawnBurst(worldPos, hexColor, count) {
    if (this.reducedMotion) return;
    this._tmpColor.set(hexColor);
    const P = this._particles;
    let spawned = 0;
    for (let i = 0; i < PARTICLE_CAP && spawned < count; i++) {
      if (P.life[i] > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 2.2;
      P.pos[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.4;
      P.pos[i * 3 + 1] = worldPos.y + (Math.random() - 0.5) * 0.4;
      P.pos[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * 0.4;
      P.vel[i * 3] = Math.cos(a) * speed;
      P.vel[i * 3 + 1] = 2.2 + Math.random() * 2.6;
      P.vel[i * 3 + 2] = Math.sin(a) * speed;
      P.life[i] = P.maxLife[i] = 0.45 + Math.random() * 0.3;
      this._particleMesh.setColorAt(i, this._tmpColor);
      spawned++;
    }
    if (spawned > 0) {
      this._particleMesh.instanceColor.needsUpdate = true;
      this._particleAlive = true;
    }
  }

  _updateParticles(dt) {
    if (!this._particleAlive) return;
    const P = this._particles;
    const m = this._tmpMat;
    const mesh = this._particleMesh;
    let alive = false;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      if (P.life[i] <= 0) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, m);
        continue;
      }
      alive = true;
      P.vel[i * 3 + 1] -= PARTICLE_GRAVITY * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt;
      P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      const s = P.life[i] / P.maxLife[i];
      m.makeScale(s, s, s);
      m.setPosition(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this._particleAlive = alive;
  }

  // -- message envelopes ---------------------------------------------------------

  _initEnvelopes() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F7F1E8';
    ctx.strokeStyle = '#6E4B3A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 18, 44, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, 22);
    ctx.lineTo(32, 38);
    ctx.lineTo(52, 22);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._envelopeMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    this._envelopes = new Map();
  }

  _addEnvelope(k, x, y, z) {
    if (this._envelopes.has(k)) return;
    const sprite = new THREE.Sprite(this._envelopeMat);
    sprite.scale.set(ENVELOPE_SCALE, ENVELOPE_SCALE, 1);
    sprite.position.set(x + 0.5, y + ENVELOPE_RISE, z + 0.5);
    sprite.userData.baseY = y + ENVELOPE_RISE;
    sprite.userData.phase = hash2(x, z) * Math.PI * 2;
    this.scene.add(sprite);
    this._envelopes.set(k, sprite);
  }

  _removeEnvelope(k) {
    const sprite = this._envelopes.get(k);
    if (!sprite) return;
    this.scene.remove(sprite);
    this._envelopes.delete(k);
  }

  _rebuildEnvelopes() {
    for (const sprite of this._envelopes.values()) this.scene.remove(sprite);
    this._envelopes.clear();
    for (const [k, v] of this.blocks) {
      if (!v.m) continue;
      const parts = k.split(',');
      this._addEnvelope(k, +parts[0], +parts[1], +parts[2]);
    }
  }
}
