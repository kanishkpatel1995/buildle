// islands/orchard.js — the hanging orchard: four grass terraces arcing up to
// one Rose Clay blossom tree beside the island's only Cloud White, a tiny
// shrine with a glow lantern burning inside. A spring stair-steps down the
// south faces in three micro-falls to a stone-rimmed catch pond; petals drift
// downwind (NE) off the crown; turf clods hang just off the rim.
//
// Hue band: this island OWNS green — Sage/Olive terrace tops over Sandstone
// retaining walls with Cocoa earth lips. Rose Clay + Honey/Ember are the 10%.
// Sun is SW, so walls warm to Terracotta on SW arcs and hue-shift to Dusty
// Plum on the NE shade arcs — never just darker.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_CLOUD_WHITE = 0;
const C_SANDSTONE = 1;
const C_TERRACOTTA = 2;
const C_ROSE_CLAY = 3;
const C_DUSTY_PLUM = 4;
const C_TWILIGHT = 5;
const C_TEAL = 6;
const C_SAGE = 7;
const C_OLIVE = 8;
const C_HONEY = 9;
const C_EMBER = 10;
const C_COCOA = 12;
const C_SLATE = 13;
const C_GLOW = 15;

const ISLE_R = 25;                        // registry radius; local cells [-25, 24]

// ── terrain: four concentric terraces, eccentric toward the NW summit ───────
// Walk surface of terrace i = top + 1 (4, 8, 12, 16). The base meadow (walk 0)
// is the World's free grass plane. Centers creep NW so the SE shelves widen —
// an amphitheater of arcs facing the dock.
const TERRACES = [
  { cx: -2.5, cz: -2.5, r: 20.5, y0: 0,  top: 3,  wobble: 1.2, salt: 31 },
  { cx: -4,   cz: -4,   r: 15.5, y0: 4,  top: 7,  wobble: 1.0, salt: 32 },
  { cx: -5,   cz: -5,   r: 11.5, y0: 8,  top: 11, wobble: 0.9, salt: 33 },
  { cx: -6,   cz: -6,   r: 7.5,  y0: 12, top: 15, wobble: 0.8, salt: 34 },
];
const LIP_COCOA = 0.75;                   // earth-lip odds on each terrace edge top
const TOP_OLIVE_DITHER = 0.18;            // sun-dried flecks in the terrace turf
const WALL_PLUM_DITHER = 0.4;             // NE shade arcs hue-shift, never darken
const WALL_TERRA_DITHER = 0.3;            // SW sun arcs bake warm
const CHANNEL_TWILIGHT_DITHER = 0.3;      // deep flecks in the teal channel floors

// Exact-mask corridors: channel lips and stair seats must land on known faces,
// so these cells override the wobbled disc test (IN wins over OUT).
const FORCE_IN = [
  [[6, 13], [6, 14], [6, 15], [14, 8], [13, 9]],
  [[3, 7], [3, 8], [3, 9], [10, -2], [10, -1]],
  [[0, 1], [0, 2], [0, 3], [0, 4], [5, -4], [5, -3]],
  [[-2, -1], [-2, -2]],
];
const FORCE_OUT = [
  [[6, 16], [6, 17], [6, 18], [12, 12], [13, 11], [14, 10], [15, 9]],
  [[3, 10], [3, 11], [3, 12], [11, 1], [11, 0], [11, -1], [11, -2]],
  [[0, 5], [0, 6], [0, 7], [6, -1], [6, -2], [6, -3], [6, -4]],
  [[-2, 2], [-2, 1], [-2, 0]],
];

// ── the cascade: carved channels, three lips, one catch pond ────────────────
// Channel cells are carved one block deep (teal floor); each run ends at a
// south-facing lip. Spring rises among boulders at the head on terrace 3.
const CHANNELS = [
  { terrace: 2, cells: [[0, 1], [0, 2], [0, 3], [0, 4]] },
  { terrace: 1, cells: [[0, 5], [0, 6], [1, 6], [1, 7], [2, 7], [2, 8], [3, 8], [3, 9]] },
  { terrace: 0, cells: [[3, 10], [3, 11], [4, 11], [4, 12], [5, 12], [5, 13], [6, 13], [6, 14], [6, 15]] },
];
const FALLS = [                           // lip water → landing floor (south faces, sunlit)
  { x: 0.5, z: 5.38,  lipY: 11.55, baseY: 7 },
  { x: 3.5, z: 10.38, lipY: 7.55,  baseY: 3 },
  { x: 6.5, z: 16.38, lipY: 3.55,  baseY: 0.35 },
];
const FALL_W = 1.15;
const FALL_SINK = 0.4;
const POND = { x: 6.5, z: 18, r: 3.2, wobble: 0.7, salt: 41 };
const POND_LEVEL = 0.72;                  // under the rim stones' tops (1.0)
const POND_RIM_COCOA = 0.35;
const MIST_POND = { x: 6.5, y: 0.85, z: 16.9, r: 1.6, n: 7 };
const MIST_LANDING = { x: 0.5, y: 7.1, z: 5.9, r: 1.0, n: 5 };

// ── the climb: tangential stairs hugging each wall, arcing dock → summit ────
// Column k of a stair rises y base..base+k; the last top sits flush with (or
// one below) the next walk level. 1-block steps — the avatar is the unit.
const STAIRS = [
  { cells: [[12, 12], [13, 11], [14, 10], [15, 9]], base: 0,  salt: 51 },
  { cells: [[11, 1], [11, 0], [11, -1], [11, -2]],  base: 4,  salt: 52 },
  { cells: [[6, -1], [6, -2], [6, -3], [6, -4]],    base: 8,  salt: 53 },
  { cells: [[-2, 2], [-2, 1], [-2, 0]],             base: 12, salt: 54 },
];
const STAIR_TERRA_DITHER = 0.3;

// ── the orchard: clusters of 5 / 3 / 2 with negative space between ──────────
// Sage blob canopies, Olive Gold on the SW sun side, fruit on the shell.
// Honey fruit ONLY on the trio beside the summit — light gathers at the focal.
const TREE_CLUSTERS = [
  { walk: 4,  fruit: C_EMBER, trees: [[-8, 14], [-11, 11], [-5, 16], [-16, 8], [-9, 12]] },
  { walk: 12, fruit: C_HONEY, trees: [[3, -9], [1, -11], [5, -8]] },
  { walk: 0,  fruit: C_EMBER, trees: [[18, 3], [20, 6]] },
];
const CANOPY_FLAT = 1.25;                 // ellipsoid y-squash — orchard-pruned crowns
const FRUIT_ODDS = 0.16;
const OLIVE_ODDS = 0.55;
const CANOPY_PLUM_ODDS = 0.22;

// ── the landmark: blossom tree + shrine on the summit ──────────────────────
const BLOSSOM = { x: -8, z: -7, trunkY0: 16, trunkY1: 19 };
const BLOSSOM_BRANCHES = [[-7, 19, -7], [-9, 19, -8]];
const BLOSSOM_LOBES = [                   // [cx, cy, cz, r] — one big crown, two lobes
  [-7.5, 21.2, -6.5, 3.1],
  [-5.8, 22.4, -8.0, 2.2],
  [-9.4, 22.3, -5.6, 2.0],
];
const BLOSSOM_TERRA_ODDS = 0.3;           // sun-kissed SW petals
const BLOSSOM_PLUM_ODDS = 0.35;           // NE shade petals
const SHRINE = { x0: -3, x1: -1, z0: -9, z1: -7, baseY: 16 };  // plinth 16, walls 17–18, roof 19
const SHRINE_OPENINGS = [[-1, -8], [-2, -7]];  // door cells: east mid + south mid
const SHRINE_GLOW = { x: -2, y: 17, z: -8 };   // the lantern, on the plinth, seen through both doors

// ── details: drifting petals, floating turf clods ───────────────────────────
const PETAL_COUNT = 24;
const PETAL_DIR = { x: 0.707, z: -0.707 };     // downwind = NE
const PETAL_SRC = { x: -7.2, y: 21.6, z: -7.6 };
const PETAL_RUN = 15.5;                   // drift distance across the NE shelves
const PETAL_S = 0.45;                     // half-scale petal squares
const PETAL_T = 0.1;
const PETAL_GROUND = [[-6.2, -5.4], [-4.8, -6.8], [-6.9, -4.1], [-9.8, -8.9], [-5.5, -5.9]];
const CLODS = [                           // calved turf, Cocoa roots underneath
  { x: 20,  z: -15, y: 7,  r: 2.2, salt: 61 },
  { x: 17,  z: -21, y: 10, r: 1.8, salt: 62 },
  { x: -24, z: 13,  y: 5,  r: 1.4, salt: 63 },
];

// ── dock & decor ────────────────────────────────────────────────────────────
const DOCK_SPAWN = { x: 18.5, z: 14.5 };  // local; meadow grass, vista up the arcs
const DOCK_X0 = 19.6, DOCK_X1 = 25.6;
const DOCK_Z0 = 13.3, DOCK_Z1 = 15.7;
const DOCK_DECK_H = 0.14;
const DOCK_PLANK_GAP = 0.95;
const DOCK_POST = 0.22;
const DOCK_POST_DEPTH = -2.0;
const FENCE_POST_W = 0.2, FENCE_POST_H = 0.62;
const FENCE_RAIL = 0.05;
const FENCE_RAIL_Y = [0.28, 0.5];
const FENCE_STEP = 1.4;
const LAND_FENCE = { z: 12.3, x0: 13, x1: 17 };
const PATH_STONES = [                     // [x, z, walkY] — dock → stairs → shrine
  [17, 13, 0], [16, 13, 0], [15, 13, 0], [14, 13, 0], [13, 12, 0],
  [13, 7, 4], [12, 5, 4], [11, 3, 4],
  [9, -2, 8], [8, -1, 8],
  [3, -2, 12], [1, -1, 12], [-1, 1, 12],
  [-2, -2, 16], [-2, -4, 16], [-1, -6, 16],
];
const STONE_W = 0.78, STONE_H = 0.07;
const SPRING_BOULDERS = [                 // [x, y, z, s] — the spring hides among slate
  [-0.6, 12, 0.3, 0.55], [1.2, 12, 1.6, 0.4], [0.9, 12, -0.2, 0.34],
];
const POND_BOULDERS = [[9.6, 0, 16.2, 0.5], [3.2, 0, 20.2, 0.62]];
const SHRINE_BEAM_T = 0.16, SHRINE_BEAM_H = 0.1;
const FINIAL = { x: -1.66, y: 20.06, z: -7.66, s: 0.32, h: 0.28 };
const LABEL_POS = { x: 19.5, y: 2.1, z: 14.5 };
const COCOA_DARK = 0.82;

// ── deterministic helpers ───────────────────────────────────────────────────

// Per-cell hash in [0, 1) — same recipe as world.js. `salt` decorrelates uses.
function hashCell(x, z, salt = 0) {
  let h = (Math.imul(x + salt * 101, 374761393) + Math.imul(z - salt * 53, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function inDisc(x, z, cx, cz, r, wobble, salt) {
  const wob = wobble ? (hashCell(x, z, salt) - 0.5) * wobble : 0;
  return Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r + wob;
}

const cellKey = (x, z) => x + ',' + z;
const setOf = (list) => new Set(list.map(([x, z]) => cellKey(x, z)));
const FORCE_IN_SETS = FORCE_IN.map(setOf);
const FORCE_OUT_SETS = FORCE_OUT.map(setOf);
const CHANNEL_SETS = TERRACES.map((_, i) => {
  const ch = CHANNELS.find((c) => c.terrace === i);
  return ch ? setOf(ch.cells) : new Set();
});

function inTerrace(i, x, z) {
  const k = cellKey(x, z);
  if (FORCE_IN_SETS[i].has(k)) return true;
  if (FORCE_OUT_SETS[i].has(k)) return false;
  const t = TERRACES[i];
  return inDisc(x, z, t.cx, t.cz, t.r, t.wobble, t.salt);
}

function forTerrace(i, fn) {
  const t = TERRACES[i];
  const reach = t.r + t.wobble + 2;
  for (let x = Math.floor(t.cx - reach); x <= Math.ceil(t.cx + reach); x++) {
    for (let z = Math.floor(t.cz - reach); z <= Math.ceil(t.cz + reach); z++) {
      if (inTerrace(i, x, z)) fn(x, z);
    }
  }
}

const isEdge = (i, x, z) =>
  !inTerrace(i, x + 1, z) || !inTerrace(i, x - 1, z) ||
  !inTerrace(i, x, z + 1) || !inTerrace(i, x, z - 1);

const channelAdjacent = (i, x, z) =>
  CHANNEL_SETS[i].has(cellKey(x + 1, z)) || CHANNEL_SETS[i].has(cellKey(x - 1, z)) ||
  CHANNEL_SETS[i].has(cellKey(x, z + 1)) || CHANNEL_SETS[i].has(cellKey(x, z - 1));

const onIsle = (x, z) => Math.hypot(x + 0.5, z + 0.5) <= ISLE_R;
const inPondDisc = (x, z) => inDisc(x, z, POND.x, POND.z, POND.r, POND.wobble, POND.salt);
const pondInterior = (x, z) => inPondDisc(x, z) && !inTerrace(0, x, z);

// Visit every canopy voxel of a squashed blob; `shell` marks the outer skin.
function forBlob(bx, by, bz, r, fn) {
  const ry = r / CANOPY_FLAT;
  for (let x = Math.floor(bx - r); x <= Math.ceil(bx + r); x++) {
    for (let y = Math.floor(by - ry); y <= Math.ceil(by + ry); y++) {
      for (let z = Math.floor(bz - r); z <= Math.ceil(bz + r); z++) {
        const dx = x + 0.5 - bx, dy = (y + 0.5 - by) * CANOPY_FLAT, dz = z + 0.5 - bz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= r * r) fn(x, y, z, d2 >= (r - 1) * (r - 1), dx, dz);
      }
    }
  }
}

export async function build(kit) {
  const { THREE, PALETTE, group, water } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // ── terrain: terraces with retaining walls, lips, carved channels ─────────
  const entries = [];
  const put = (x, y, z, c) => {
    if (x < -ISLE_R || x > ISLE_R - 1 || z < -ISLE_R || z > ISLE_R - 1) return;
    entries.push([x + ox, y, z + oz, c]);
  };

  for (let i = 0; i < TERRACES.length; i++) {
    const t = TERRACES[i];
    forTerrace(i, (x, z) => {
      const carved = CHANNEL_SETS[i].has(cellKey(x, z));
      const edge = isEdge(i, x, z);
      const topY = carved ? t.top - 1 : t.top;
      for (let y = t.y0; y <= topY; y++) {
        let c = C_SANDSTONE;
        if (carved && y === topY) {
          c = hashCell(x, z, 71) < CHANNEL_TWILIGHT_DITHER ? C_TWILIGHT : C_TEAL;
        } else if (y === t.top) {
          if (edge) c = hashCell(x, z, 72) < LIP_COCOA ? C_COCOA : C_SANDSTONE;
          else if (channelAdjacent(i, x, z)) c = C_COCOA;     // earth banks along the water
          else c = hashCell(x, z, 73) < TOP_OLIVE_DITHER ? C_OLIVE : C_SAGE;
        } else if (edge) {
          // retaining wall: plum on the NE shade arc, terracotta on the SW sun arc
          const dx = x + 0.5 - t.cx, dz = z + 0.5 - t.cz;
          if (dx > 0 && dz < 0 && hashCell(x, z, 74 + y) < WALL_PLUM_DITHER) c = C_DUSTY_PLUM;
          else if (dx < 0 && dz > 0 && hashCell(x, z, 75 + y) < WALL_TERRA_DITHER) c = C_TERRACOTTA;
        }
        put(x, y, z, c);
      }
    });
  }

  // stairs — sandstone columns hugging the walls, one block per step
  for (const s of STAIRS) {
    for (let k = 0; k < s.cells.length; k++) {
      const [x, z] = s.cells[k];
      for (let y = s.base; y <= s.base + k; y++) {
        put(x, y, z, hashCell(x, z, s.salt + y) < STAIR_TERRA_DITHER ? C_TERRACOTTA : C_SANDSTONE);
      }
    }
  }

  // ── the orchard trees ──────────────────────────────────────────────────────
  const plantTree = (x, z, walk, fruit, salt) => {
    put(x, walk, z, C_COCOA);
    put(x, walk + 1, z, C_COCOA);
    const a1 = hashCell(x, z, salt) * Math.PI * 2;
    const blobs = [
      [x + 0.5, walk + 3, z + 0.5, 1.7],
      [x + 0.5 + Math.cos(a1) * 1.1, walk + 2.2, z + 0.5 + Math.sin(a1) * 1.1, 1.35],
    ];
    if (hashCell(x, z, salt + 1) < 0.65) {
      const a2 = a1 + 2.4;
      blobs.push([x + 0.5 + Math.cos(a2) * 0.9, walk + 3.9, z + 0.5 + Math.sin(a2) * 0.9, 1.15]);
    }
    for (const [bx, by, bz, r] of blobs) {
      forBlob(bx, by, bz, r, (vx, vy, vz, shell, dx, dz) => {
        const sw = dx * -PETAL_DIR.x - dz * PETAL_DIR.z;   // toward the SW sun
        let c = C_SAGE;
        if (shell && hashCell(vx + vy * 17, vz - vy * 9, 81) < FRUIT_ODDS) c = fruit;
        else if (sw > r * 0.3 && hashCell(vx + vy * 17, vz - vy * 9, 82) < OLIVE_ODDS) c = C_OLIVE;
        else if (sw < -r * 0.3 && hashCell(vx + vy * 17, vz - vy * 9, 83) < CANOPY_PLUM_ODDS) c = C_DUSTY_PLUM;
        put(vx, vy, vz, c);
      });
    }
  };
  for (let ci = 0; ci < TREE_CLUSTERS.length; ci++) {
    const cl = TREE_CLUSTERS[ci];
    for (const [tx, tz] of cl.trees) plantTree(tx, tz, cl.walk, cl.fruit, 90 + ci * 7);
  }

  // ── the landmark: blossom tree + the only white on the island ─────────────
  for (let y = BLOSSOM.trunkY0; y <= BLOSSOM.trunkY1; y++) put(BLOSSOM.x, y, BLOSSOM.z, C_COCOA);
  for (const [bx, by, bz] of BLOSSOM_BRANCHES) put(bx, by, bz, C_COCOA);
  for (const [bx, by, bz, r] of BLOSSOM_LOBES) {
    forBlob(bx, by, bz, r, (vx, vy, vz, shell, dx, dz) => {
      const sw = dx * -PETAL_DIR.x - dz * PETAL_DIR.z;
      let c = C_ROSE_CLAY;
      if (sw > r * 0.25 && hashCell(vx + vy * 17, vz - vy * 9, 84) < BLOSSOM_TERRA_ODDS) c = C_TERRACOTTA;
      else if (sw < -r * 0.25 && hashCell(vx + vy * 17, vz - vy * 9, 85) < BLOSSOM_PLUM_ODDS) c = C_DUSTY_PLUM;
      put(vx, vy, vz, c);
    });
  }
  for (let x = SHRINE.x0; x <= SHRINE.x1; x++) {
    for (let z = SHRINE.z0; z <= SHRINE.z1; z++) {
      put(x, SHRINE.baseY, z, C_CLOUD_WHITE);              // plinth
      put(x, SHRINE.baseY + 3, z, C_CLOUD_WHITE);          // roof
      const perimeter = x === SHRINE.x0 || x === SHRINE.x1 || z === SHRINE.z0 || z === SHRINE.z1;
      const open = SHRINE_OPENINGS.some(([dx, dz]) => dx === x && dz === z);
      if (perimeter && !open) {
        put(x, SHRINE.baseY + 1, z, C_CLOUD_WHITE);
        put(x, SHRINE.baseY + 2, z, C_CLOUD_WHITE);
      }
    }
  }
  put(SHRINE_GLOW.x, SHRINE_GLOW.y, SHRINE_GLOW.z, C_GLOW);  // pulses via the world's glow material

  // ── details: floating turf clods (cocoa roots tapering beneath) ───────────
  for (const cl of CLODS) {
    const layers = [
      { dy: 0, r: cl.r, c: null },                          // turf top, sage/olive dither
      { dy: -1, r: cl.r - 0.7, c: C_COCOA },
      { dy: -2, r: cl.r - 1.4, c: C_COCOA },
    ];
    for (const L of layers) {
      if (L.r < 0.5) continue;
      const reach = Math.ceil(L.r + 1);
      for (let x = cl.x - reach; x <= cl.x + reach; x++) {
        for (let z = cl.z - reach; z <= cl.z + reach; z++) {
          if (!inDisc(x, z, cl.x + 0.5, cl.z + 0.5, L.r, 0.5, cl.salt - L.dy)) continue;
          put(x, cl.y + L.dy, z,
            L.c ?? (hashCell(x, z, cl.salt + 9) < TOP_OLIVE_DITHER ? C_OLIVE : C_SAGE));
        }
      }
    }
  }

  // ── the catch pond: stone rim ring around open water ──────────────────────
  let pMinX = Infinity, pMaxX = -Infinity, pMinZ = Infinity, pMaxZ = -Infinity;
  for (let x = Math.floor(POND.x - POND.r - 2); x <= Math.ceil(POND.x + POND.r + 2); x++) {
    for (let z = Math.floor(POND.z - POND.r - 2); z <= Math.ceil(POND.z + POND.r + 2); z++) {
      if (pondInterior(x, z)) {
        pMinX = Math.min(pMinX, x); pMaxX = Math.max(pMaxX, x);
        pMinZ = Math.min(pMinZ, z); pMaxZ = Math.max(pMaxZ, z);
        continue;
      }
      const nearWater = pondInterior(x + 1, z) || pondInterior(x - 1, z) ||
                        pondInterior(x, z + 1) || pondInterior(x, z - 1);
      if (nearWater && !inTerrace(0, x, z) && onIsle(x, z)) {
        put(x, 0, z, hashCell(x, z, 42) < POND_RIM_COCOA ? C_COCOA : C_SANDSTONE);
      }
    }
  }

  await kit.setBlocksPaced(world, entries);

  // ── water: one pond surface, three lip falls, two mist breaths ────────────
  const pond = water.makeSurface({
    width: pMaxX - pMinX + 1,
    depth: pMaxZ - pMinZ + 1,
    level: POND_LEVEL,
    origin: { x: ox + (pMinX + pMaxX + 1) / 2, z: oz + (pMinZ + pMaxZ + 1) / 2 },
    isLand: (x, z) => !pondInterior(x - ox, z - oz),
  });
  group.add(pond);

  for (const f of FALLS) {
    group.add(water.makeWaterfall({
      top: new THREE.Vector3(ox + f.x, f.lipY, oz + f.z),
      height: f.lipY - f.baseY + FALL_SINK,
      width: FALL_W,
      facing: 0,                          // local +z → world +z: the sunlit south faces
    }));
  }

  const mistN = (n) => (kit.reducedMotion ? Math.ceil(n / 2) : n);
  group.add(water.makeMist({
    position: new THREE.Vector3(ox + MIST_POND.x, MIST_POND.y, oz + MIST_POND.z),
    radius: MIST_POND.r, count: mistN(MIST_POND.n),
  }));
  group.add(water.makeMist({
    position: new THREE.Vector3(ox + MIST_LANDING.x, MIST_LANDING.y, oz + MIST_LANDING.z),
    radius: MIST_LANDING.r, count: mistN(MIST_LANDING.n),
  }));

  // ── decor: dock, fences, stones, boulders, petals, shrine trim ────────────
  const decor = kit.decor;
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(COCOA_DARK);
  const sandstone = color(C_SANDSTONE);
  const slate = color(C_SLATE);
  const rose = color(C_ROSE_CLAY);
  const plum = color(C_DUSTY_PLUM);
  const white = color(C_CLOUD_WHITE);

  // dock deck + stilts (the arrival pier, pointing up the terrace arcs)
  const plankD = DOCK_Z1 - DOCK_Z0;
  for (let i = 0; ; i++) {
    const px = DOCK_X0 + i * DOCK_PLANK_GAP;
    if (px + DOCK_PLANK_GAP * 0.9 > DOCK_X1 + 0.01) break;
    decor.box(ox + px, 0.02, oz + DOCK_Z0, DOCK_PLANK_GAP * 0.9, DOCK_DECK_H, plankD,
      i % 2 ? cocoaDark : cocoa);
  }
  for (const px of [DOCK_X0 + 0.5, DOCK_X1 - 0.7]) {
    for (const pz of [DOCK_Z0 + 0.15, DOCK_Z1 - 0.35]) {
      decor.box(ox + px, DOCK_POST_DEPTH, oz + pz, DOCK_POST, -DOCK_POST_DEPTH + 0.02, DOCK_POST, cocoaDark);
    }
  }
  const fenceRun = (x0, x1, z, baseY) => {
    let lastX = x0;
    for (let x = x0; x <= x1 + 0.01; x += FENCE_STEP) {
      decor.box(ox + x, baseY, oz + z, FENCE_POST_W, FENCE_POST_H, FENCE_POST_W, cocoa);
      lastX = x;
    }
    for (const ry of FENCE_RAIL_Y) {
      decor.box(ox + x0 + FENCE_POST_W, baseY + ry, oz + z + (FENCE_POST_W - FENCE_RAIL) / 2,
        lastX - x0 - FENCE_POST_W, FENCE_RAIL, FENCE_RAIL, cocoaDark);
    }
  };
  fenceRun(DOCK_X0 + 0.2, DOCK_X1 - 0.4, DOCK_Z0 - 0.05, 0.14);
  fenceRun(DOCK_X0 + 0.2, DOCK_X1 - 0.4, DOCK_Z1 - FENCE_POST_W + 0.05, 0.14);
  fenceRun(LAND_FENCE.x0, LAND_FENCE.x1, LAND_FENCE.z, 0);

  // stepping stones: dock → stairs → shrine, the long arcing leading line
  for (const [sx, sz, sy] of PATH_STONES) {
    const jitter = (hashCell(sx, sz, 23) - 0.5) * 0.18;
    decor.box(ox + sx + (1 - STONE_W) / 2 + jitter, sy, oz + sz + (1 - STONE_W) / 2 - jitter,
      STONE_W, STONE_H, STONE_W, sandstone);
  }
  for (const [bx, by, bz, s] of [...SPRING_BOULDERS, ...POND_BOULDERS]) {
    decor.box(ox + bx - s / 2, by, oz + bz - s / 2, s, s * 0.85, s, slate);
  }

  // petals: a few resting by the trunk, the rest streaming downwind off the crown
  for (const [px, pz] of PETAL_GROUND) {
    decor.box(ox + px, 16.02, oz + pz, PETAL_S, PETAL_T, PETAL_S,
      hashCell(Math.round(px * 4), Math.round(pz * 4), 86) < 0.3 ? plum : rose);
  }
  for (let i = 0; i < PETAL_COUNT; i++) {
    const t = (i + 1) / PETAL_COUNT;
    const d = 2.5 + t * PETAL_RUN;
    const px = PETAL_SRC.x + PETAL_DIR.x * d + (hashCell(i, 1, 87) - 0.5) * 3.5;
    const pz = PETAL_SRC.z + PETAL_DIR.z * d + (hashCell(i, 2, 87) - 0.5) * 3.5;
    const py = PETAL_SRC.y - t * 10.5 + (hashCell(i, 3, 87) - 0.5) * 2.2;
    decor.box(ox + px, py, oz + pz, PETAL_S, PETAL_T, PETAL_S,
      hashCell(i, 4, 87) < 0.25 ? plum : rose);
  }

  // shrine roof trim: cocoa beams on all four eaves + a tiny white finial
  decor.box(ox + SHRINE.x0 - 0.12, 19.96, oz + SHRINE.z0 - 0.12, 3.24, SHRINE_BEAM_H, SHRINE_BEAM_T, cocoaDark);
  decor.box(ox + SHRINE.x0 - 0.12, 19.96, oz + SHRINE.z1 + 1 - 0.04, 3.24, SHRINE_BEAM_H, SHRINE_BEAM_T, cocoaDark);
  decor.box(ox + SHRINE.x0 - 0.12, 19.96, oz + SHRINE.z0 - 0.12, SHRINE_BEAM_T, SHRINE_BEAM_H, 3.24, cocoaDark);
  decor.box(ox + SHRINE.x1 + 1 - 0.04, 19.96, oz + SHRINE.z0 - 0.12, SHRINE_BEAM_T, SHRINE_BEAM_H, 3.24, cocoaDark);
  decor.box(ox + FINIAL.x, FINIAL.y, oz + FINIAL.z, FINIAL.s, FINIAL.h, FINIAL.s, white);

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  // ── dock sign ─────────────────────────────────────────────────────────────
  const label = kit.makeLabelSprite('the hanging orchard');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
