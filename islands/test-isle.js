// islands/test-isle.js — the proving ground (dev-only, behind the localStorage
// flag). The REFERENCE island: every W2 island should read like this file.
//
// How to author an island:
//   1. All layout in LOCAL cell coordinates; add world.origin when emitting.
//   2. Deterministic everywhere — coordinate hashes, never random numbers.
//   3. Terrain = block entries fed once through kit.setBlocksPaced.
//   4. Everything finer than a block (fences, planks, lanterns) is decor:
//      GeoBuilder boxes at any scale, baked into one or two meshes.
//   5. Composition: one focal point (here, the rim waterfall), the lightest
//      values only there, shadows hue-shifted plum — never just darker.
//   6. Return { dockSpawn } in GLOBAL coordinates, on real walkable ground.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_SANDSTONE = 1;
const C_TERRACOTTA = 2;
const C_ROSE_CLAY = 3;
const C_DUSTY_PLUM = 4;
const C_TEAL = 6;
const C_SAGE = 7;
const C_OLIVE = 8;
const C_BRICK_RED = 11;
const C_COCOA = 12;
const C_SLATE = 13;
const C_GLOW = 15;

// ── the mesa: three strata bands + a sage cap ───────────────────────────────
const MESA_X = -4, MESA_Z = -2;           // mesa center — west, so the dock faces it
const STRATA = [
  { y0: 0, y1: 3, r: 9.6, c: C_BRICK_RED,  wobble: 1.6 },
  { y0: 4, y1: 6, r: 7.2, c: C_TERRACOTTA, wobble: 1.3 },
  { y0: 7, y1: 8, r: 5.4, c: C_ROSE_CLAY,  wobble: 1.0 },
];
const CAP = { y: 9, r: 4.9, c: C_SAGE, wobble: 0.8 };
const BAND_DITHER = 0.35;                 // odds a band's bottom row keeps the color below
const CAP_OLIVE_DITHER = 0.22;            // sun-dried accents in the turf
const SHADE_DITHER = 0.4;                 // plum hue-shift odds on the shaded rim
const SHADE_RIM = 1.6;                    // …within this many cells of the band edge
// Sun comes from the SW (main.js): the NE quadrant is the shadow side.
const SHADE_DX = 0, SHADE_DZ = 0;         // quadrant test thresholds vs mesa center

// ── the pond on the cap, its spill notch, and the rim waterfall ─────────────
const POND_X = -1.6, POND_Z = -2;         // nudged toward the east rim
const POND_R = 2.3, POND_WOBBLE = 0.7;
const POND_CARVE_Y = 8;                   // pond/notch columns stop below this
const POND_LEVEL = 8.68;                  // water sits 1.32 under the cap top (10)
const NOTCH_X = 1;                        // one-cell spill channel through the rim
const NOTCH_Z0 = -3, NOTCH_Z1 = -1;
const CHUTE_X = 2;                        // lower strata carved sheer east of this
const FALL_X = 2.35;                      // sheet hangs just proud of the cut face
const FALL_Z = -1.5;                      // notch center
const FALL_WIDTH = 2;
const FALL_SINK = 0.4;                    // sheet base tucks below the grass line
const MIST_POS = { x: 3.0, y: 0.55, z: -1.5 };
const MIST_RADIUS = 1.7;
const MIST_COUNT = 7;

// ── supporting masses ───────────────────────────────────────────────────────
const BUTTE = { x: 7, z: 9, r: 2.6, wobble: 0.9 };   // medium mass, south of the path
const BUTTE_STRATA = [
  { y0: 0, y1: 2, c: C_BRICK_RED },
  { y0: 3, y1: 4, c: C_TERRACOTTA },
  { y0: 5, y1: 5, c: C_SAGE },
];
const TALUS_R0 = 10.4, TALUS_R1 = 12.6;   // scattered scree ring around the mesa
const TALUS_DENSITY = 0.16;

// ── dock, path, decor ───────────────────────────────────────────────────────
const DOCK_SPAWN = { x: 13.5, z: 4.5 };   // local; on real ground inside the mask
const DOCK_X0 = 12.4, DOCK_X1 = 18.4;     // deck runs east off the rim
const DOCK_Z0 = 3.3, DOCK_Z1 = 5.7;
const DOCK_DECK_H = 0.14;
const DOCK_PLANK_GAP = 0.95;
const DOCK_POST = 0.22;
const DOCK_POST_DEPTH = -2.0;             // stilts reach below the rim skirt line
const FENCE_POST_W = 0.2, FENCE_POST_H = 0.62;
const FENCE_RAIL = 0.05;
const FENCE_RAIL_Y = [0.28, 0.5];
const FENCE_STEP = 1.4;
const LAND_FENCE = { z: 2.6, x0: 9.5, x1: 12.5 };    // flanks the path's first steps
const PATH_STONES = [                     // stepping stones: dock → the falls
  [12, 4], [11, 3], [10, 3], [9, 2], [8, 2], [7, 1], [6, 1], [5, 0], [4, -1],
];
const STONE_W = 0.78, STONE_H = 0.07;
const LANTERN = { x: 4.6, z: -0.4 };      // path's end — light marks the focal point
const LANTERN_POST_W = 0.18, LANTERN_POST_H = 1.15;
const LANTERN_HEAD = 0.3, LANTERN_HEAD_Y = 0.78;
const BOULDERS = [                        // half-scale slate at the plunge pool
  [3.4, -0.4, 0.5], [2.0, -3.6, 0.4], [4.0, -2.8, 0.6],
];
const LABEL_POS = { x: 13.5, y: 2.1, z: 4.5 };
const COCOA_DARK = 0.82;                  // alternating plank shade factor

// ── deterministic helpers ───────────────────────────────────────────────────

// Per-cell hash in [0, 1) — same recipe as world.js. `salt` decorrelates uses.
function hashCell(x, z, salt = 0) {
  let h = (Math.imul(x + salt * 101, 374761393) + Math.imul(z - salt * 53, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Is local cell (x, z) inside a wobbled disc?
function inDisc(x, z, cx, cz, r, wobble, salt) {
  const wob = wobble ? (hashCell(x, z, salt) - 0.5) * wobble : 0;
  return Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r + wob;
}

// Visit every integer cell of a wobbled disc.
function forDisc(cx, cz, r, wobble, salt, fn) {
  const reach = r + wobble + 1;
  for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
    for (let z = Math.floor(cz - reach); z <= Math.ceil(cz + reach); z++) {
      if (inDisc(x, z, cx, cz, r, wobble, salt)) fn(x, z);
    }
  }
}

const inPond = (x, z) => inDisc(x, z, POND_X, POND_Z, POND_R, POND_WOBBLE, 21);
const inNotch = (x, z) => x === NOTCH_X && z >= NOTCH_Z0 && z <= NOTCH_Z1;
const inPondWater = (x, z) => inPond(x, z) || inNotch(x, z);
const inChute = (x, z) => x >= CHUTE_X && z >= NOTCH_Z0 && z <= NOTCH_Z1;

export async function build(kit) {
  const { THREE, PALETTE, group, water } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // ── terrain strata (block entries, GLOBAL coords) ─────────────────────────
  const entries = [];
  const put = (x, y, z, c) => entries.push([x + ox, y, z + oz, c]);

  for (let i = 0; i < STRATA.length; i++) {
    const band = STRATA[i];
    forDisc(MESA_X, MESA_Z, band.r, band.wobble, i, (x, z) => {
      if (inChute(x, z)) return;                       // the sheer face under the falls
      for (let y = band.y0; y <= band.y1; y++) {
        if (inPondWater(x, z) && y >= POND_CARVE_Y) continue;   // pond basin + notch
        let c = band.c;
        if (inPondWater(x, z) && y === POND_CARVE_Y - 1) {
          c = C_TEAL;                                  // hand-darkened wet floor
        } else if (i > 0 && y === band.y0 && hashCell(x, z, 7) < BAND_DITHER) {
          c = STRATA[i - 1].c;                         // soft 2-step band boundary
        } else {
          // plum hue-shift on the shaded NE rim — never just darker
          const dx = x + 0.5 - MESA_X, dz = z + 0.5 - MESA_Z;
          const rim = Math.hypot(dx, dz) > band.r - SHADE_RIM;
          if (rim && dx > SHADE_DX && dz < SHADE_DZ && hashCell(x, z, 11) < SHADE_DITHER) {
            c = C_DUSTY_PLUM;
          }
        }
        put(x, y, z, c);
      }
    });
  }
  forDisc(MESA_X, MESA_Z, CAP.r, CAP.wobble, 3, (x, z) => {
    if (inChute(x, z) || inPondWater(x, z)) return;
    put(x, CAP.y, z, hashCell(x, z, 13) < CAP_OLIVE_DITHER ? C_OLIVE : CAP.c);
  });

  // ── the butte (medium mass) and the talus ring (small) ────────────────────
  for (const band of BUTTE_STRATA) {
    forDisc(BUTTE.x, BUTTE.z, BUTTE.r, BUTTE.wobble, 5, (x, z) => {
      for (let y = band.y0; y <= band.y1; y++) put(x, y, z, band.c);
    });
  }
  forDisc(MESA_X, MESA_Z, TALUS_R1, 0, 0, (x, z) => {
    const d = Math.hypot(x + 0.5 - MESA_X, z + 0.5 - MESA_Z);
    if (d < TALUS_R0 || hashCell(x, z, 17) > TALUS_DENSITY) return;
    if (!world.isGroundAt(x + ox, z + oz)) return;
    const dx = x + 0.5 - MESA_X, dz = z + 0.5 - MESA_Z;
    const shaded = dx > SHADE_DX && dz < SHADE_DZ && hashCell(x, z, 19) < SHADE_DITHER;
    put(x, 0, z, shaded ? C_DUSTY_PLUM : C_BRICK_RED);
  });

  await kit.setBlocksPaced(world, entries);

  // ── water: cap pond (+ foam), rim waterfall, mist at the plunge ───────────
  let pMinX = Infinity, pMaxX = -Infinity, pMinZ = Infinity, pMaxZ = -Infinity;
  forDisc(POND_X, POND_Z, POND_R, POND_WOBBLE, 21, (x, z) => {
    pMinX = Math.min(pMinX, x); pMaxX = Math.max(pMaxX, x);
    pMinZ = Math.min(pMinZ, z); pMaxZ = Math.max(pMaxZ, z);
  });
  pMaxX = Math.max(pMaxX, NOTCH_X);        // surface reaches the lip face
  pMinZ = Math.min(pMinZ, NOTCH_Z0);
  pMaxZ = Math.max(pMaxZ, NOTCH_Z1);
  const pond = water.makeSurface({
    width: pMaxX - pMinX + 1,
    depth: pMaxZ - pMinZ + 1,
    level: POND_LEVEL,
    origin: { x: ox + (pMinX + pMaxX + 1) / 2, z: oz + (pMinZ + pMaxZ + 1) / 2 },
    isLand: (x, z) => !inPondWater(x - ox, z - oz),
  });
  group.add(pond);

  const fall = water.makeWaterfall({
    top: new THREE.Vector3(ox + FALL_X, POND_LEVEL, oz + FALL_Z),
    height: POND_LEVEL + FALL_SINK,
    width: FALL_WIDTH,
    facing: Math.PI / 2,                   // local +z → world +x: faces the dock
  });
  group.add(fall);

  const mist = water.makeMist({
    position: new THREE.Vector3(ox + MIST_POS.x, MIST_POS.y, oz + MIST_POS.z),
    radius: MIST_RADIUS,
    count: MIST_COUNT,
  });
  group.add(mist);

  // ── decor: dock, fences, path stones, boulders (one vertex-colored mesh) ──
  const decor = kit.decor;
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(COCOA_DARK);
  const sandstone = color(C_SANDSTONE);
  const slate = color(C_SLATE);

  // dock deck: planks laid across the pier, alternating shade
  const plankD = DOCK_Z1 - DOCK_Z0;
  for (let i = 0; ; i++) {
    const px = DOCK_X0 + i * DOCK_PLANK_GAP;
    if (px + DOCK_PLANK_GAP * 0.9 > DOCK_X1 + 0.01) break;
    decor.box(ox + px, 0.02, oz + DOCK_Z0, DOCK_PLANK_GAP * 0.9, DOCK_DECK_H, plankD,
      i % 2 ? cocoaDark : cocoa);
  }
  // dock stilts: down past the rim, floating-island style
  for (const px of [DOCK_X0 + 0.5, DOCK_X1 - 0.7]) {
    for (const pz of [DOCK_Z0 + 0.15, DOCK_Z1 - 0.35]) {
      decor.box(ox + px, DOCK_POST_DEPTH, oz + pz, DOCK_POST, -DOCK_POST_DEPTH + 0.02, DOCK_POST, cocoaDark);
    }
  }
  // half-scale fence: both dock edges (sunk into the deck) + a run on land
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

  // stepping stones: the leading line from the dock to the falls
  for (const [sx, sz] of PATH_STONES) {
    const jitter = (hashCell(sx, sz, 23) - 0.5) * 0.18;
    decor.box(ox + sx + (1 - STONE_W) / 2 + jitter, 0, oz + sz + (1 - STONE_W) / 2 - jitter,
      STONE_W, STONE_H, STONE_W, sandstone);
  }
  // slate boulders around the plunge
  for (const [bx, bz, s] of BOULDERS) {
    decor.box(ox + bx - s / 2, 0, oz + bz - s / 2, s, s * 0.85, s, slate);
  }
  // lantern post + cap (the glow head is its own mesh below)
  decor.box(ox + LANTERN.x, 0, oz + LANTERN.z, LANTERN_POST_W, LANTERN_POST_H, LANTERN_POST_W, cocoa);
  decor.box(ox + LANTERN.x - 0.06, LANTERN_HEAD_Y + LANTERN_HEAD, oz + LANTERN.z - 0.06,
    LANTERN_POST_W + 0.12, 0.08, LANTERN_POST_W + 0.12, cocoaDark);

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  // glow lantern head — emissive, so it carries at dusk (light at the focal end)
  const glow = new kit.GeoBuilder();
  glow.box(ox + LANTERN.x - (LANTERN_HEAD - LANTERN_POST_W) / 2, LANTERN_HEAD_Y,
    oz + LANTERN.z - (LANTERN_HEAD - LANTERN_POST_W) / 2, LANTERN_HEAD, LANTERN_HEAD, LANTERN_HEAD,
    color(C_GLOW));
  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: '#FFE8A8', emissiveIntensity: 0.55,
  }));
  glowMesh.castShadow = true;
  glowMesh.receiveShadow = true;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // ── dock sign ─────────────────────────────────────────────────────────────
  const label = kit.makeLabelSprite('the proving ground');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
