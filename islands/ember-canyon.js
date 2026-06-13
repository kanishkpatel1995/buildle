// islands/ember-canyon.js — "the river that leaps into the sky"
//
// Grand Canyon stratigraphy mapped to the Buildle palette, ending in the void
// waterfall. Composition: the dock sits on the NE floor; the leading line runs
// dock → stepping stones → under the natural arch → the spring cleft in the
// Redwall, while the river it points at sweeps back past the viewer and pours
// off the island's broken SE edge into the sky. Lightest values (Cloud White
// caprock, Honey lip stones, the camp's Glow Lantern) live only on that line.
// Hue band owned: Brick Red / Ember Orange. Shadows hue-shift plum/twilight.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_CLOUD = 0;
const C_SANDSTONE = 1;
const C_TERRACOTTA = 2;
const C_ROSE_CLAY = 3;
const C_DUSTY_PLUM = 4;
const C_TWILIGHT = 5;
const C_SAGE = 7;
const C_OLIVE = 8;
const C_HONEY = 9;
const C_EMBER = 10;
const C_BRICK_RED = 11;
const C_COCOA = 12;
const C_SLATE = 13;
const C_INK = 14;
const C_GLOW = 15;

// ── geology: one strata table shared by every mass ──────────────────────────
// off = radius offset at the band's bottom/top (talus bands slope, hard bands
// stand sheer); wob = per-band silhouette wobble (band-coherent, so hard
// layers stay vertical and soft layers crumble).
const STRATA = [
  { y0: 0, y1: 0, c: C_INK, o0: 2.0, o1: 2.0, wob: 1.5 },         // ink shadow ring
  { y0: 1, y1: 2, c: C_COCOA, o0: 1.4, o1: 0.8, wob: 1.2 },       // cocoa talus
  { y0: 3, y1: 3, c: C_DUSTY_PLUM, o0: 0.5, o1: 0.5, wob: 0.8 },  // thin plum band
  { y0: 4, y1: 4, c: C_SAGE, o0: 0.2, o1: 0.2, wob: 0.8 },        // thin sage band
  { y0: 5, y1: 13, c: C_BRICK_RED, o0: 0, o1: 0, wob: 0.6 },      // the Redwall — sheer
  { y0: 14, y1: 15, c: C_ROSE_CLAY, o0: -0.4, o1: -0.7, wob: 0.8 }, // rose bench
  { y0: 16, y1: 19, c: C_TERRACOTTA, o0: -1.2, o1: -3.6, wob: 1.3 }, // 45° terracotta talus
  { y0: 20, y1: 24, c: C_SANDSTONE, o0: -4.2, o1: -4.2, wob: 0.6 }, // sandstone cliff — sheer
  { y0: 25, y1: 26, c: C_CLOUD, o0: -4.6, o1: -5.4, wob: 0.9 },   // caprock (spring mesa only)
];
const BAND = []; // y → { c, off, wob, salt }
for (let i = 0; i < STRATA.length; i++) {
  const b = STRATA[i];
  for (let y = b.y0; y <= b.y1; y++) {
    const t = b.y1 > b.y0 ? (y - b.y0) / (b.y1 - b.y0) : 0;
    BAND[y] = { c: b.c, off: b.o0 + (b.o1 - b.o0) * t, wob: b.wob, salt: i };
  }
}

// ── masses (the silhouette) ─────────────────────────────────────────────────
const MASK_R = 32.6;                       // masses never overhang the island base
const MESA = { cx: -15, cz: -5, r: 16.5, top: 24, salt: 1 };  // the Redwall plateau (big)
const BENCH = { cx: -7, cz: 13, r: 11, top: 15, salt: 2 };    // rose-bench lobe (medium)
const CAPROCK = { cx: -17, cz: -4, r: 6.5, y0: 25, y1: 26, salt: 3 }; // Cloud White mesa
const SHELL = 1.7;                         // interior cells deeper than this are skipped
const CARVE_GUARD = 2;                     // …unless a carve passes within this (Chebyshev)
const RIM_DEPTH = 1.7;                     // "rim" for shade/accent painting
const BAND_BLEND = 0.33;                   // odds a band's bottom row keeps the color below
const VARNISH = 0.12;                      // cocoa desert-varnish streak columns (Redwall)
const EMBER_LICK = 0.15;                   // ember-orange licks in the Redwall rim
const TERRA_EMBER = 0.10;                  // ember dither in the terracotta talus
const SHADE_DITHER = 0.36;                 // NE rim plum/slate hue-shift odds
const SUN_BLEACH = 0.12;                   // sandstone dither on SW terracotta faces
const CAP_HONEY = 0.18;                    // honey kisses on the caprock's SW rim (focal)
const BENCH_SAGE = 0.10;                   // sparse sage turf on the rose bench top
const MESA_OLIVE = 0.06;                   // olive flecks on the plateau top

// ── the slot canyon (cuts the bench lobe E→W, open-roofed) ──────────────────
const SLOT = [ // [x, z0] spine, two cells wide (z0, z0+1)
  [4, 14], [3, 14], [2, 14], [1, 15], [0, 15], [-1, 15], [-2, 14], [-3, 14],
  [-4, 13], [-5, 13], [-6, 14], [-7, 14], [-8, 15], [-9, 15], [-10, 14],
  [-11, 14], [-12, 13], [-13, 13], [-14, 14], [-15, 14], [-16, 15], [-17, 15],
  [-18, 14], [-19, 14],
];
const SLOT_TOP = 15;                       // carved through the bench's full height
const SLOT_CHAMBER_X0 = -10, SLOT_CHAMBER_X1 = -6; // widened mid chamber
const SLOT_FLARE_X = 3;                    // entrance flares one cell wider from here east

// ── the spring cleft, pool, river, and the void lip ─────────────────────────
const CLEFT = { x0: -4, x1: 3, z0: 0, z1: 1, y0: 5, y1: 24 }; // dark slit in the Redwall
const POOL = { x: 4.5, z: 0.5, r: 3.4, wob: 0.8, salt: 21 };   // spring pool at its foot
const RIVER = [ // [x, z0] course, two cells wide — pool → SE rim
  [7, 0], [8, 0], [9, 0], [10, 0], [11, 1], [12, 1], [13, 1], [14, 2], [15, 2],
  [16, 3], [17, 3], [18, 4], [19, 5], [20, 5], [21, 6], [22, 7], [23, 8],
  [24, 9], [25, 10], [26, 11], [27, 12], [28, 12], [29, 13],
];
const WATER_LEVEL = 0.62;                  // banks top at 1.0, bed at base ground 0
const SPRING_FALL = { x: 1.4, z: 1.0, top: 11, width: 1.9 };   // silk out of the cleft
const VOID_FALL = { x: 29.95, z: 14.0, width: 2.15, facing: 1.13, drop: 13.6 };
const SPRING_MIST = { x: 3.4, y: 0.8, z: 1.0, radius: 1.4, count: 5 };
const VOID_MIST = { x: 31.2, y: -4.0, z: 15.0, radius: 2.6, count: 10 };
const LIP_HONEY = [[28, 12], [29, 12], [28, 15]]; // sun-struck stones at the broken edge

// ── the switchback trail (the leading line up the bench's north face) ───────
// Arcs around BENCH: angle in degrees (0° = +x, negative sweeps north/west),
// climbing y0→y1; ledges sit 0.4 inside the band face with a protruding lip.
const TRAIL_LEGS = [
  { a0: -10, a1: -64, y0: 1, y1: 8 },      // trailhead → hairpin over the pool
  { a0: -64, a1: -22, y0: 8, y1: 15 },     // hairpin → the rose bench top
];
const TRAIL_STEP_DEG = 2;
const TRAIL_INSET = 0.4;
const TRAIL_HEADROOM = 4;
const TRAIL_TERRA = 0.25;                  // worn terracotta treads in the sandstone path

// ── landmark: the natural arch (frames the spring falls from the dock) ──────
const ARCH_X0 = 9, ARCH_X1 = 10;
const ARCH_SPANS = [ // [z, yBottom, yTop] — 0-bottom spans are the legs
  [-6, 0, 10], [-5, 0, 10], [-4, 7, 10], [-3, 8, 10], [-2, 9, 11], [-1, 9, 11],
  [0, 9, 11], [1, 8, 10], [2, 7, 10], [3, 0, 10], [4, 0, 10],
];
const ARCH_FEET = [ // taper chunks at the legs: [x, z, yTop]
  [8, -6, 2], [11, -5, 1], [8, 4, 2], [11, 3, 1],
];

// ── details: hoodoos, floating debris, scrub, talus, shadow wash ────────────
const HOODOOS = [ // [x, z, top] — 3-clump on the shadow floor + 2 by the slot
  [17, -13, 8], [20, -11, 6], [15, -10, 5], [6, 20, 5], [9, 22, 4],
];
const DEBRIS = [ // [x0, z0, y0, size] — broken-edge chunks adrift over the void
  [31, 17, 3, 2], [27, 20, 7, 3], [30, 19, 11, 2], [-30, 18, 6, 2],
];
const DEBRIS_RAGGED = 0.2;                 // odds a debris corner cell is missing
const SCRUB = [ // [cx, cz, r] sage patches on the floor — clumps of 3 / 2
  [14, 18, 2.6], [22, 4, 2.2], [12, -20, 2.4], [-23, 17, 2.0], [25, -3, 1.8],
];
const SCRUB_FILL = 0.5;
const SCRUB_BUSH = 0.28;                   // odds a scrub cell grows a 1-block bush
const TALUS_IN = 1.5, TALUS_OUT = 4.5;     // scree ring offsets around each mass foot
const TALUS_DENSITY = 0.12;
const SHADOW_ZONE = { x0: -12, x1: 14, z0: -26, z1: -6 }; // the plateau's long NE shadow
const SHADOW_PLUM = 0.28, SHADOW_SLATE = 0.12;
const WASH_SAND = 0.8;                     // dry-wash sandstone odds beside the river
const FLOOR_ROSE = 0.12, FLOOR_COCOA = 0.08, FLOOR_SAND = 0.06;

// ── the abandoned camp (half-scale, at the trailhead) ───────────────────────
const CAMP = {
  tent: { x: 8.6, z: 10.2 },
  bedroll: { x: 7.6, z: 9.2 },
  crate: { x: 10.8, z: 11.3 },
  fire: { x: 10.4, z: 10.0 },
  kettle: { x: 10.0, z: 10.55 },
  lantern: { x: 9.4, z: 9.0 },
};
const FIRE_STONES = [[0.42, 0], [0.13, 0.4], [-0.34, 0.25], [-0.34, -0.25], [0.13, -0.4]];
const CAIRNS = [ // [x, z, baseY] — trailhead, hairpin ledge, bench top
  [5.4, 11.6, 1.02], [-2.6, 4.2, 9.02], [2.4, 9.6, 16.02],
];
const FLOOR_TOP = 1.0;                     // the paved floor's walking surface

// ── dock, path, overlook ────────────────────────────────────────────────────
const DOCK_SPAWN = { x: 27.5, z: -8.5 };   // local; on paved floor inside the mask
const DOCK_X0 = 28.4, DOCK_X1 = 34.4;      // deck runs east off the rim, over the void
const DOCK_Z0 = -9.7, DOCK_Z1 = -7.3;
const DOCK_DECK_H = 0.14;
const DOCK_PLANK_GAP = 0.95;
const DOCK_POST = 0.22;
const DOCK_POST_DEPTH = -2.0;
const FENCE_POST_W = 0.2, FENCE_POST_H = 0.62;
const FENCE_RAIL = 0.05;
const FENCE_RAIL_Y = [0.28, 0.5];
const FENCE_STEP = 1.4;
const PATH_STONES = [ // dock → trailhead, tracing the hero diagonal
  [25.5, -7.5], [24, -7], [22.5, -6.5], [21, -6], [19.5, -5.5], [18, -5],
  [16.5, -4.5], [15, -4], [13.5, -3], [12.5, -1.5], [11.5, 0],
  [10.5, 3.5], [9.5, 5], [8.5, 6.5], [7.5, 8], [6.5, 9.5], [5.5, 10.5],
];
const FORD_STONES = [[11.2, 1.3], [10.9, 2.4]]; // taller stones crossing the river
const STONE_W = 0.78, STONE_H = 0.07;
const FORD_H = 1.05;                       // from the riverbed, proud of the water
const RIVER_PEBBLES = [ // [x, z, size] half-scale slate/cocoa along the banks
  [8.2, -1.2, 0.45], [13.4, 0.2, 0.34], [16.2, 2.2, 0.4], [20.3, 4.3, 0.3],
  [24.2, 8.4, 0.42], [27.0, 11.2, 0.32],
];
const ROPE_POSTS_X = [26.4, 27.6, 28.8];   // overlook rope at the broken edge
const ROPE_Z = 11.2;
const DEBRIS_MOTES = [[30.2, 5.4, 18.3, 0.4], [28.6, 9.6, 21.2, 0.3]];
const HOODOO_CAP = { pad: 0.2, h: 0.22 };  // overhanging cap slabs (sub-voxel)
const LABEL_POS = { x: 29.0, y: 3.4, z: -8.5 };
const LANTERN_POST_W = 0.16, LANTERN_POST_H = 1.0;
const LANTERN_HEAD = 0.28, LANTERN_HEAD_Y = 1.75;
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

function forDisc(cx, cz, r, wobble, salt, fn) {
  const reach = r + wobble + 1;
  for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
    for (let z = Math.floor(cz - reach); z <= Math.ceil(cz + reach); z++) {
      if (inDisc(x, z, cx, cz, r, wobble, salt)) fn(x, z);
    }
  }
}

const inMask = (x, z) => Math.hypot(x + 0.5, z + 0.5) <= MASK_R;
const colK = (x, z) => x + ',' + z;
const rad = (deg) => (deg * Math.PI) / 180;

export async function build(kit) {
  const { THREE, PALETTE, group, water } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // Local cell map ("x,y,z" → palette index): masses write, carves delete,
  // details overwrite, then everything is emitted once in global coords.
  const cells = new Map();
  const ck = (x, y, z) => x + ',' + y + ',' + z;
  const setCell = (x, y, z, c) => cells.set(ck(x, y, z), c);

  // ── carve footprints (known before the masses fill around them) ──────────
  const waterCols = new Set();
  forDisc(POOL.x, POOL.z, POOL.r, POOL.wob, POOL.salt, (x, z) => waterCols.add(colK(x, z)));
  for (const [x, z0] of RIVER) {
    waterCols.add(colK(x, z0));
    waterCols.add(colK(x, z0 + 1));
  }
  const slotCols = new Set();
  for (const [x, z0] of SLOT) {
    slotCols.add(colK(x, z0));
    slotCols.add(colK(x, z0 + 1));
    if (x >= SLOT_CHAMBER_X0 && x <= SLOT_CHAMBER_X1) slotCols.add(colK(x, z0 - 1));
    if (x >= SLOT_FLARE_X) slotCols.add(colK(x, z0 - 1));
  }
  const inCleft = (x, z, y) =>
    x >= CLEFT.x0 && x <= CLEFT.x1 && z >= CLEFT.z0 && z <= CLEFT.z1 &&
    y >= CLEFT.y0 && y <= CLEFT.y1;
  // Columns where a carve passes — the interior-skip must keep shell near them.
  const carvedCols = new Set([...waterCols, ...slotCols]);
  for (let x = CLEFT.x0; x <= CLEFT.x1; x++) {
    for (let z = CLEFT.z0; z <= CLEFT.z1; z++) carvedCols.add(colK(x, z));
  }
  const nearCarve = (x, z) => {
    for (let dx = -CARVE_GUARD; dx <= CARVE_GUARD; dx++) {
      for (let dz = -CARVE_GUARD; dz <= CARVE_GUARD; dz++) {
        if (carvedCols.has(colK(x + dx, z + dz))) return true;
      }
    }
    return false;
  };

  // ── terrain: the strata masses ────────────────────────────────────────────
  const bandR = (mass, y, x, z) => {
    const b = BAND[y];
    return mass.r + b.off + (hashCell(x, z, mass.salt * 37 + b.salt) - 0.5) * b.wob;
  };

  const paintMass = (mass, x, y, z, dist, r) => {
    const b = BAND[y];
    let c = b.c;
    const rim = dist > r - RIM_DEPTH;
    if (y > 0 && BAND[y - 1].salt !== b.salt && hashCell(x, z, 7 + y) < BAND_BLEND) {
      c = BAND[y - 1].c;                   // soften the horizontal band steps
    } else if (b.c === C_BRICK_RED && rim) {
      if (hashCell(x, z, 31) < VARNISH) c = C_COCOA;          // varnish streak columns
      else if (hashCell(x, z, 33 + y) < EMBER_LICK) c = C_EMBER;
    } else if (b.c === C_TERRACOTTA && rim && hashCell(x, z, 35 + y) < TERRA_EMBER) {
      c = C_EMBER;
    }
    const dx = x + 0.5 - mass.cx, dz = z + 0.5 - mass.cz;
    if (rim && dx > 0 && dz < 0 && hashCell(x, z, 11 + b.salt) < SHADE_DITHER) {
      c = y <= 2 ? C_SLATE : C_DUSTY_PLUM; // NE faces hue-shift — never just darker
    } else if (rim && dx < 0 && dz > 0 && b.c === C_TERRACOTTA &&
               hashCell(x, z, 15 + y) < SUN_BLEACH) {
      c = C_SANDSTONE;                     // sun-bleached SW talus
    }
    if (mass === BENCH && y === BENCH.top && hashCell(x, z, 41) < BENCH_SAGE) c = C_SAGE;
    if (mass === MESA && y === MESA.top && hashCell(x, z, 43) < MESA_OLIVE) c = C_OLIVE;
    return c;
  };

  const buildMass = (mass) => {
    const reach = Math.ceil(mass.r + 3.5);
    for (let x = mass.cx - reach; x <= mass.cx + reach; x++) {
      for (let z = mass.cz - reach; z <= mass.cz + reach; z++) {
        if (!inMask(x, z) || waterCols.has(colK(x, z))) continue;
        const slotted = slotCols.has(colK(x, z));
        const dist = Math.hypot(x + 0.5 - mass.cx, z + 0.5 - mass.cz);
        const keepShell = nearCarve(x, z);
        for (let y = 0; y <= mass.top; y++) {
          if (slotted && y <= SLOT_TOP) continue;
          if (inCleft(x, z, y)) continue;
          const r = bandR(mass, y, x, z);
          if (dist > r) continue;
          if (!keepShell && y < mass.top &&
              dist <= r - SHELL && dist <= bandR(mass, y + 1, x, z) - SHELL) {
            continue;                      // buried interior — skip
          }
          setCell(x, y, z, paintMass(mass, x, y, z, dist, r));
        }
      }
    }
  };
  buildMass(MESA);
  buildMass(BENCH);

  // Cloud White caprock — the spring mesa, the island's only white (focal).
  for (let y = CAPROCK.y0; y <= CAPROCK.y1; y++) {
    const r = CAPROCK.r - (y - CAPROCK.y0) * 1.1;
    forDisc(CAPROCK.cx, CAPROCK.cz, r, BAND[y].wob, CAPROCK.salt + y, (x, z) => {
      let c = C_CLOUD;
      const dx = x + 0.5 - CAPROCK.cx, dz = z + 0.5 - CAPROCK.cz;
      const rim = Math.hypot(dx, dz) > r - RIM_DEPTH;
      if (rim && dx < 0 && dz > 0 && hashCell(x, z, 45) < CAP_HONEY) c = C_HONEY;
      else if (rim && dx > 0 && dz < 0 && hashCell(x, z, 47) < SHADE_DITHER) c = C_DUSTY_PLUM;
      setCell(x, y, z, c);
    });
  }

  // ── carve paint: slot + cleft walls go cool (plum/twilight, never darker) ─
  for (const col of slotCols) {
    const [sx, sz] = col.split(',').map(Number);
    for (const [nx, nz] of [[sx + 1, sz], [sx - 1, sz], [sx, sz + 1], [sx, sz - 1]]) {
      for (let y = 1; y <= SLOT_TOP; y++) {
        const k = ck(nx, y, nz);
        if (!cells.has(k)) continue;
        const h = hashCell(nx, nz, 51 + y);
        if (y <= 4) cells.set(k, h < 0.5 ? C_SLATE : C_TWILIGHT);
        else if (y <= 9 && h < 0.55) cells.set(k, C_DUSTY_PLUM);
        else if (y <= 12 && h < 0.3) cells.set(k, C_DUSTY_PLUM);
        else if (y >= 13 && h < 0.4) cells.set(k, C_ROSE_CLAY);
      }
    }
  }
  for (let x = CLEFT.x0 - 1; x <= CLEFT.x1; x++) {
    for (const z of [CLEFT.z0 - 1, CLEFT.z1 + 1]) {
      for (let y = CLEFT.y0; y <= 17; y++) {
        const k = ck(x, y, z);
        if (!cells.has(k)) continue;
        const h = hashCell(x, z, 55 + y);
        cells.set(k, y < 10 ? (h < 0.5 ? C_TWILIGHT : C_DUSTY_PLUM)
                            : (h < 0.55 ? C_DUSTY_PLUM : C_BRICK_RED));
      }
    }
  }

  // ── the switchback trail: carved sandstone ledges with a protruding lip ──
  const ledge = (x, y, z) => {
    setCell(x, y, z, hashCell(x, z, 61) < TRAIL_TERRA ? C_TERRACOTTA : C_SANDSTONE);
    for (let dy = 1; dy <= TRAIL_HEADROOM; dy++) cells.delete(ck(x, y + dy, z));
  };
  for (const leg of TRAIL_LEGS) {
    const steps = Math.max(1, Math.round(Math.abs(leg.a1 - leg.a0) / TRAIL_STEP_DEG));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = rad(leg.a0 + (leg.a1 - leg.a0) * t);
      const y = Math.min(leg.y1, leg.y0 + Math.floor(t * (leg.y1 - leg.y0 + 0.999)));
      const r0 = BENCH.r + BAND[y].off - TRAIL_INSET;
      const x0 = Math.floor(BENCH.cx + Math.cos(a) * r0);
      const z0 = Math.floor(BENCH.cz + Math.sin(a) * r0);
      const x1 = Math.floor(BENCH.cx + Math.cos(a) * (r0 + 1));
      const z1 = Math.floor(BENCH.cz + Math.sin(a) * (r0 + 1));
      ledge(x0, y, z0);
      if (x1 !== x0 || z1 !== z0) ledge(x1, y, z1); // the lip — reads from the dock
    }
  }

  // ── the canyon floor: paved, painted, and washed ──────────────────────────
  const nearRiver = (x, z) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (waterCols.has(colK(x + dx, z + dz))) return true;
      }
    }
    return false;
  };
  const inScrub = (x, z) => {
    for (const [cx, cz, r] of SCRUB) {
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r) return true;
    }
    return false;
  };
  const floorColor = (x, z) => {
    const h = hashCell(x, z, 71);
    if (slotCols.has(colK(x, z))) return h < 0.3 ? C_COCOA : C_SANDSTONE; // dry slot wash
    if (nearRiver(x, z) && hashCell(x, z, 73) < WASH_SAND) {
      return h < 0.18 ? C_ROSE_CLAY : C_SANDSTONE;                       // the dry wash
    }
    if (inScrub(x, z) && hashCell(x, z, 75) < SCRUB_FILL) {
      return h < 0.3 ? C_OLIVE : C_SAGE;
    }
    if (x >= SHADOW_ZONE.x0 && x <= SHADOW_ZONE.x1 &&
        z >= SHADOW_ZONE.z0 && z <= SHADOW_ZONE.z1) {
      if (h < SHADOW_PLUM) return C_DUSTY_PLUM;                          // the long NE shadow
      if (h < SHADOW_PLUM + SHADOW_SLATE) return C_SLATE;
    }
    if (h < FLOOR_ROSE) return C_ROSE_CLAY;
    if (h < FLOOR_ROSE + FLOOR_COCOA) return C_COCOA;
    if (h < FLOOR_ROSE + FLOOR_COCOA + FLOOR_SAND) return C_SANDSTONE;
    return C_TERRACOTTA;
  };
  for (let x = -33; x <= 32; x++) {
    for (let z = -33; z <= 32; z++) {
      if (!inMask(x, z) || waterCols.has(colK(x, z))) continue;
      if (cells.has(ck(x, 0, z))) continue;
      setCell(x, 0, z, floorColor(x, z));
      if (inScrub(x, z) && hashCell(x, z, 77) < SCRUB_BUSH && !cells.has(ck(x, 1, z))) {
        setCell(x, 1, z, hashCell(x, z, 79) < 0.35 ? C_OLIVE : C_SAGE);  // low bushes
      }
    }
  }

  // Scree at the mass feet — clumps thin with distance, plum on the NE side.
  for (const mass of [MESA, BENCH]) {
    const reach = Math.ceil(mass.r + TALUS_OUT + 1);
    for (let x = mass.cx - reach; x <= mass.cx + reach; x++) {
      for (let z = mass.cz - reach; z <= mass.cz + reach; z++) {
        const d = Math.hypot(x + 0.5 - mass.cx, z + 0.5 - mass.cz) - mass.r;
        if (d < TALUS_IN || d > TALUS_OUT) continue;
        if (hashCell(x, z, 81 + mass.salt) > TALUS_DENSITY) continue;
        if (!inMask(x, z) || waterCols.has(colK(x, z))) continue;
        if (cells.has(ck(x, 1, z)) || !cells.has(ck(x, 0, z))) continue;
        const dx = x + 0.5 - mass.cx, dz = z + 0.5 - mass.cz;
        const shaded = dx > 0 && dz < 0 && hashCell(x, z, 83) < SHADE_DITHER;
        setCell(x, 1, z, shaded ? C_DUSTY_PLUM
          : hashCell(x, z, 85) < 0.3 ? C_COCOA : C_BRICK_RED);
      }
    }
  }

  // ── landmark: the natural arch ────────────────────────────────────────────
  for (let x = ARCH_X0; x <= ARCH_X1; x++) {
    for (const [z, yb, yt] of ARCH_SPANS) {
      for (let y = yb; y <= yt; y++) {
        let c = C_TERRACOTTA;
        if (y <= 1) c = C_ROSE_CLAY;
        else if (y >= yt - 1 && yt >= 10) c = C_SANDSTONE;
        else if (y === yb && yb > 0) c = C_DUSTY_PLUM;       // shaded under-span
        else if (hashCell(x + y, z, 87) < 0.14) c = C_EMBER;
        setCell(x, y, z, c);
      }
    }
  }
  for (const [x, z, yt] of ARCH_FEET) {
    for (let y = 0; y <= yt; y++) setCell(x, y, z, y <= 1 ? C_ROSE_CLAY : C_TERRACOTTA);
  }

  // ── hoodoos: banded totems echoing the strata ─────────────────────────────
  for (const [hx, hz, top] of HOODOOS) {
    for (let y = 0; y <= top; y++) {
      let c = C_BRICK_RED;
      if (y === 0) c = C_INK;
      else if (y === 1) c = C_COCOA;
      else if (y === top) c = C_SLATE;                       // the hard capstone
      else if (y >= top - 1) c = C_TERRACOTTA;
      else if (y === 5) c = C_ROSE_CLAY;
      else if (hashCell(hx, hz, 91 + y) < 0.22) c = C_EMBER;
      setCell(hx, y, hz, c);
    }
  }

  // ── floating debris off the broken edge ──────────────────────────────────
  for (const [dx0, dz0, dy0, s] of DEBRIS) {
    for (let x = dx0; x < dx0 + s; x++) {
      for (let z = dz0; z < dz0 + s; z++) {
        for (let y = dy0; y < dy0 + s; y++) {
          const corner = (x === dx0 || x === dx0 + s - 1) &&
                         (z === dz0 || z === dz0 + s - 1) &&
                         (y === dy0 || y === dy0 + s - 1);
          if (corner && hashCell(x + y, z - y, 93) < DEBRIS_RAGGED) continue;
          const t = (y - dy0) / s;
          setCell(x, y, z, t < 0.34 ? C_INK : t < 0.7 ? C_BRICK_RED
            : hashCell(x, z, 95) < 0.5 ? C_TERRACOTTA : C_SANDSTONE);
        }
      }
    }
  }

  // Honey at the lip — the sun catches the broken edge (focal light only).
  for (const [x, z] of LIP_HONEY) setCell(x, 0, z, C_HONEY);

  // ── emit (global coords, one paced pass) ──────────────────────────────────
  const entries = [];
  for (const [k, c] of cells) {
    const [x, y, z] = k.split(',').map(Number);
    if (x < -33 || x > 32 || z < -33 || z > 32 || y < 0 || y > 31) continue;
    entries.push([x + ox, y, z + oz, c]);
  }
  await kit.setBlocksPaced(world, entries);

  // ── water: pool + river surface, the spring silk, the void fall, mist ────
  let wMinX = Infinity, wMaxX = -Infinity, wMinZ = Infinity, wMaxZ = -Infinity;
  for (const col of waterCols) {
    const [x, z] = col.split(',').map(Number);
    wMinX = Math.min(wMinX, x); wMaxX = Math.max(wMaxX, x);
    wMinZ = Math.min(wMinZ, z); wMaxZ = Math.max(wMaxZ, z);
  }
  const river = water.makeSurface({
    width: wMaxX - wMinX + 1,
    depth: wMaxZ - wMinZ + 1,
    level: WATER_LEVEL,
    origin: { x: ox + (wMinX + wMaxX + 1) / 2, z: oz + (wMinZ + wMaxZ + 1) / 2 },
    isLand: (x, z) => !waterCols.has(colK(x - ox, z - oz)),
  });
  group.add(river);

  const springFall = water.makeWaterfall({
    top: new THREE.Vector3(ox + SPRING_FALL.x, SPRING_FALL.top, oz + SPRING_FALL.z),
    height: SPRING_FALL.top + 0.45,        // base tucks under the pool surface
    width: SPRING_FALL.width,
    facing: Math.PI / 2,                   // out of the cleft, toward the dock
  });
  group.add(springFall);

  const voidFall = water.makeWaterfall({
    top: new THREE.Vector3(ox + VOID_FALL.x, WATER_LEVEL, oz + VOID_FALL.z),
    height: VOID_FALL.drop,                // past the skirt, shredding into the sky
    width: VOID_FALL.width,
    facing: VOID_FALL.facing,
  });
  group.add(voidFall);

  group.add(water.makeMist({
    position: new THREE.Vector3(ox + SPRING_MIST.x, SPRING_MIST.y, oz + SPRING_MIST.z),
    radius: SPRING_MIST.radius,
    count: SPRING_MIST.count,
  }));
  group.add(water.makeMist({
    position: new THREE.Vector3(ox + VOID_MIST.x, VOID_MIST.y, oz + VOID_MIST.z),
    radius: VOID_MIST.radius,
    count: VOID_MIST.count,
  }));

  // ── decor: dock, path, overlook, camp, jewelry (one vertex-colored mesh) ──
  const decor = kit.decor;
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(COCOA_DARK);
  const sandstone = color(C_SANDSTONE);
  const cloud = color(C_CLOUD);
  const slate = color(C_SLATE);
  const rose = color(C_ROSE_CLAY);
  const terracotta = color(C_TERRACOTTA);
  const ink = color(C_INK);

  // dock deck on the paved floor, planks alternating shade
  const plankD = DOCK_Z1 - DOCK_Z0;
  for (let i = 0; ; i++) {
    const px = DOCK_X0 + i * DOCK_PLANK_GAP;
    if (px + DOCK_PLANK_GAP * 0.9 > DOCK_X1 + 0.01) break;
    decor.box(ox + px, FLOOR_TOP + 0.02, oz + DOCK_Z0, DOCK_PLANK_GAP * 0.9, DOCK_DECK_H,
      plankD, i % 2 ? cocoaDark : cocoa);
  }
  for (const px of [DOCK_X0 + 0.5, DOCK_X1 - 0.7]) {
    for (const pz of [DOCK_Z0 + 0.15, DOCK_Z1 - 0.35]) {
      decor.box(ox + px, DOCK_POST_DEPTH, oz + pz, DOCK_POST,
        FLOOR_TOP - DOCK_POST_DEPTH + 0.04, DOCK_POST, cocoaDark);
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
  fenceRun(DOCK_X0 + 0.2, DOCK_X1 - 0.4, DOCK_Z0 - 0.05, FLOOR_TOP + 0.14);
  fenceRun(DOCK_X0 + 0.2, DOCK_X1 - 0.4, DOCK_Z1 - FENCE_POST_W + 0.05, FLOOR_TOP + 0.14);

  // the overlook rope at the broken edge — someone stood here once
  for (const px of ROPE_POSTS_X) {
    decor.box(ox + px, FLOOR_TOP, oz + ROPE_Z, FENCE_POST_W, FENCE_POST_H, FENCE_POST_W, cocoa);
  }
  decor.box(ox + ROPE_POSTS_X[0] + FENCE_POST_W, FLOOR_TOP + 0.46,
    oz + ROPE_Z + (FENCE_POST_W - FENCE_RAIL) / 2,
    ROPE_POSTS_X[2] - ROPE_POSTS_X[0] - FENCE_POST_W, FENCE_RAIL, FENCE_RAIL, slate);

  // stepping stones along the hero diagonal, fording the river beside the arch
  for (const [sx, sz] of PATH_STONES) {
    const jitter = (hashCell(Math.round(sx * 2), Math.round(sz * 2), 23) - 0.5) * 0.18;
    decor.box(ox + sx - STONE_W / 2 + jitter, FLOOR_TOP, oz + sz - STONE_W / 2 - jitter,
      STONE_W, STONE_H, STONE_W, sandstone);
  }
  for (const [fx, fz] of FORD_STONES) {
    decor.box(ox + fx - 0.35, 0, oz + fz - 0.35, 0.7, FORD_H, 0.7, slate);
  }
  for (const [px, pz, s] of RIVER_PEBBLES) {
    decor.box(ox + px - s / 2, FLOOR_TOP, oz + pz - s / 2, s, s * 0.7, s,
      hashCell(Math.round(px), Math.round(pz), 25) < 0.5 ? slate : cocoaDark);
  }

  // hoodoo caps — overhanging slabs, the sub-voxel silhouette finish
  for (const [hx, hz, top] of HOODOOS) {
    decor.box(ox + hx - HOODOO_CAP.pad, top + 1, oz + hz - HOODOO_CAP.pad,
      1 + HOODOO_CAP.pad * 2, HOODOO_CAP.h, 1 + HOODOO_CAP.pad * 2, slate);
  }

  // the abandoned camp: half-scale tent, bedroll, crate, firepit, kettle
  const T = CAMP.tent;
  decor.box(ox + T.x, FLOOR_TOP + 0.02, oz + T.z, 1.6, 0.5, 1.3, sandstone);
  decor.box(ox + T.x + 0.3, FLOOR_TOP + 0.52, oz + T.z + 0.15, 1.0, 0.35, 1.0, cloud);
  decor.box(ox + T.x - 0.05, FLOOR_TOP + 0.87, oz + T.z + 0.6, 1.7, 0.08, 0.1, cocoa);
  decor.box(ox + T.x + 1.58, FLOOR_TOP + 0.06, oz + T.z + 0.35, 0.06, 0.42, 0.6, ink);
  decor.box(ox + CAMP.bedroll.x, FLOOR_TOP + 0.02, oz + CAMP.bedroll.z, 0.55, 0.14, 1.15, rose);
  decor.box(ox + CAMP.bedroll.x + 0.08, FLOOR_TOP + 0.16, oz + CAMP.bedroll.z + 0.08,
    0.4, 0.1, 0.3, sandstone);
  decor.box(ox + CAMP.crate.x, FLOOR_TOP + 0.02, oz + CAMP.crate.z, 0.55, 0.5, 0.55, cocoa);
  decor.box(ox + CAMP.crate.x - 0.04, FLOOR_TOP + 0.52, oz + CAMP.crate.z - 0.04,
    0.63, 0.07, 0.63, cocoaDark);
  decor.box(ox + CAMP.fire.x - 0.22, FLOOR_TOP + 0.02, oz + CAMP.fire.z - 0.22,
    0.44, 0.03, 0.44, ink);
  for (const [fx, fz] of FIRE_STONES) {
    decor.box(ox + CAMP.fire.x + fx - 0.1, FLOOR_TOP + 0.02, oz + CAMP.fire.z + fz - 0.1,
      0.2, 0.16, 0.2, slate);
  }
  decor.box(ox + CAMP.kettle.x, FLOOR_TOP + 0.02, oz + CAMP.kettle.z, 0.2, 0.18, 0.2, slate);
  decor.box(ox + CAMP.lantern.x, FLOOR_TOP + 0.02, oz + CAMP.lantern.z,
    LANTERN_POST_W, LANTERN_POST_H, LANTERN_POST_W, cocoa);
  decor.box(ox + CAMP.lantern.x - 0.06, FLOOR_TOP + LANTERN_HEAD_Y + LANTERN_HEAD,
    oz + CAMP.lantern.z - 0.06, LANTERN_POST_W + 0.12, 0.07, LANTERN_POST_W + 0.12, cocoaDark);

  // wayfinding cairns: trailhead, the hairpin over the pool, the bench top
  for (const [cx, cz, baseY] of CAIRNS) {
    decor.box(ox + cx - 0.25, baseY, oz + cz - 0.25, 0.5, 0.3, 0.5, sandstone);
    decor.box(ox + cx - 0.17, baseY + 0.3, oz + cz - 0.17, 0.34, 0.24, 0.34, terracotta);
    decor.box(ox + cx - 0.1, baseY + 0.54, oz + cz - 0.1, 0.2, 0.18, 0.2, slate);
  }

  // drifting motes beside the debris chunks
  for (const [mx, my, mz, s] of DEBRIS_MOTES) {
    decor.box(ox + mx, my, oz + mz, s, s * 0.85, s, terracotta);
  }

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  // the camp's glow lantern + embers — the warm point the dusk hangs on
  const glow = new kit.GeoBuilder();
  glow.box(ox + CAMP.lantern.x - (LANTERN_HEAD - LANTERN_POST_W) / 2,
    FLOOR_TOP + LANTERN_HEAD_Y, oz + CAMP.lantern.z - (LANTERN_HEAD - LANTERN_POST_W) / 2,
    LANTERN_HEAD, LANTERN_HEAD, LANTERN_HEAD, color(C_GLOW));
  glow.box(ox + CAMP.fire.x - 0.07, FLOOR_TOP + 0.04, oz + CAMP.fire.z - 0.07,
    0.14, 0.1, 0.14, color(C_EMBER));
  glow.box(ox + CAMP.fire.x + 0.06, FLOOR_TOP + 0.04, oz + CAMP.fire.z + 0.08,
    0.1, 0.07, 0.1, color(C_EMBER));
  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: '#FFE8A8', emissiveIntensity: 0.55,
  }));
  glowMesh.castShadow = true;
  glowMesh.receiveShadow = true;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // ── dock sign ─────────────────────────────────────────────────────────────
  const label = kit.makeLabelSprite('ember canyon');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
