// islands/wicklight.js — wicklight harbor: "every boat is remembered".
//
// Composition: a crescent cove bites in from the east. The village is a dark
// Cocoa/Slate/Ink mass stepping down the western slope — big houses high,
// medium mid-slope, small at the waterline, ending at a half-scale rowboat in
// the shallows. The pier sweeps across the cove's south shore to the FOCAL
// POINT: the Cloud White lighthouse with Brick Red bands and a pulsing Glow
// Lantern crown at the crescent's tip. Catenary lantern strings run the
// waterfront and the pier; their beads and the lighthouse double in the still
// harbor as hand-placed reflection plates. One additive Honey quad is the
// lighthouse beam, aimed seaward. Hero angle: the arrival dock on the NE quay,
// looking SW across the cove.
//
// Hue band owned: Cocoa/Slate/Ink dusk-dark, pricked with Glow Lantern.
// Lightest values (Cloud White / Glow / Honey) live at the lighthouse, the
// lantern strings, and three plaster house fronts only.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_WHITE = 0;
const C_SANDSTONE = 1;
const C_TERRACOTTA = 2;
const C_DUSTY_PLUM = 4;
const C_TWILIGHT = 5;
const C_HONEY = 9;
const C_EMBER = 10;
const C_BRICK_RED = 11;
const C_COCOA = 12;
const C_SLATE = 13;
const C_INK = 14;
const C_GLOW = 15;

// ── §terrain — the crescent cove and the village slope ──────────────────────
// The cove is two wobbled discs (body + mouth) clipped at BAY_CLIP_Z; the
// spit capsule and the house pads override it back to land. Land height grows
// in terraces away from the shore, capped low on the horns and piled high on
// the west by the amphitheater term and the ridge cones.
const BAY_A = { cx: 7.5, cz: 2.5, r: 9.5 };    // cove body
const BAY_B = { cx: 18, cz: 3, r: 7 };         // mouth — opens through the east rim
const BAY_WOBBLE = 1.2;                        // ± amplitude on the disc edges
const BAY_CLIP_Z = 12;                         // hard south shoreline of the cove
const SPIT = { x0: 12.5, z0: 11.3, x1: 19, z1: 12, r: 1.7 }; // south horn capsule
const QUAY = { x0: 16, x1: 21, z0: -13, z1: -11 };  // bare-ground arrival plaza (h = 0)
const APRON = { x0: 14, x1: 23, z0: -15, z1: -8 };  // flat h=1 shelf around the quay

const BEACH_W = 1.7;                           // shore ring width (h = 1, Sandstone)
const WET_W = 0.85;                            // wet Cocoa edge inside the beach ring
const TERRACE_STEP = 1.3;                      // cells per 1-block rise
const CAP_BASE = 2;                            // height cap east of the village
const CAP_WEST_RATE = 0.55;                    // cap grows toward -x
const CAP_WEST_MAX = 10;
const CAP_NORTH_Z = -6, CAP_NORTH_H = 4;       // north shore stays low
const CAP_SOUTH_Z = 9, CAP_SOUTH_H = 4;        // south crescent body stays low
const H_MAX = 14;
const TERRACE_BREAK = 0.16;                    // odds a terrace edge gains a block
const RIM_FALL_W = 4, RIM_FALL_RATE = 1.2;     // dome falloff toward the outer rim

const RIDGES = [                               // cliffy cones behind the village
  { cx: -18.5, cz: -4, peak: 13, steep: 1.2 },
  { cx: -21, cz: 2, peak: 14, steep: 1.15 },
  { cx: -14, cz: 7.5, peak: 10, steep: 1.4 },
  { cx: 5, cz: 17, peak: 6, steep: 1.3 },      // soft knoll behind the pier
];

// The lane: a sandstone ramp from the waterfront up through the village.
const LANE = { x0: -2, z0: 0.5, x1: -13, z1: -1.5, halfW: 1.0 };
const LANE_RISE = 0.55;                        // blocks gained per cell of -x
const LANE_H_MAX = 6;

// terrain color dithers
const TOP_COCOA = 0.38;                        // Cocoa odds on a Slate top
const SHADE_PLUM = 0.5;                        // plum/twilight odds at a NE crevice
const SHADE_RIM = 0.28;                        // plum/twilight odds on a N/E-facing edge
const RIDGE_INK = 0.22;                        // Ink dither on the high ridge
const RIDGE_TWILIGHT = 0.18;                   // twilight snow-shadow on ridge tops
const WARM_BROW = 0.6;                         // Terracotta odds on a SW-facing brow
const LANE_TERRA = 0.2;                        // worn Terracotta stones in the lane

// ── §village — nine houses, big→medium→small toward the water ──────────────
// x0/z0 = footprint min corner; pad = terrain flattened to this height under
// the house (+1 ring); body = wall height; plaster fronts are the 30% band.
const HOUSES = [
  { x0: -16, z0: -4, w: 5, d: 4, pad: 5, body: 4, wall: C_SLATE, axis: 'x', chimney: true },
  { x0: -15, z0: 1, w: 4, d: 4, pad: 5, body: 3, wall: C_COCOA, axis: 'z', chimney: true },
  { x0: -10, z0: -7, w: 4, d: 3, pad: 4, body: 3, wall: C_COCOA, axis: 'x', plaster: true },
  { x0: -9, z0: 1, w: 3, d: 3, pad: 3, body: 2, wall: C_SLATE, axis: 'z' },
  { x0: -11, z0: 5, w: 4, d: 3, pad: 4, body: 3, wall: C_COCOA, axis: 'x' },
  { x0: -5, z0: -5, w: 3, d: 2, pad: 2, body: 2, wall: C_SLATE, axis: 'x', plaster: true, glow: true },
  { x0: -4, z0: -2, w: 2, d: 2, pad: 1, body: 2, wall: C_COCOA, axis: 'x', plaster: true, glow: true },
  { x0: -5, z0: 2, w: 3, d: 2, pad: 2, body: 2, wall: C_SLATE, axis: 'x' },
  { x0: -4, z0: 5, w: 2, d: 2, pad: 1, body: 1, wall: C_COCOA, axis: 'z' }, // boat shed
];
const ROOF_C = C_INK;

// ── §landmark — the lighthouse at the crescent's tip ────────────────────────
const LH = { cx: 19, cz: 12 };                 // tower center cell
const LH_ROCK_R = 3.0, LH_ROCK_WOBBLE = 0.5;   // Ink/Slate base rock, h = 2
const LH_TOWER_Y0 = 2, LH_TOWER_Y1 = 12;       // 3×3 Cloud White shaft
const LH_BANDS = [5, 6, 9, 10];                // Brick Red rows
const LH_GALLERY_Y = 13;                       // 5×5-minus-corners Ink lip
const LH_LANTERN_Y = 14;                       // Glow cross, Ink corner posts
const LH_CAP_Y = 15;                           // Ink cap + 1×1 crown block

// ── §details — pier, sea stacks, floating debris ────────────────────────────
const PIER_X0 = 3, PIER_X1 = 12, PIER_Z = 11;  // block causeway, top y = 1
const STACKS = [                               // sea stacks framing the mouth
  { x: 22, z: 1, h: 3 },
  { x: 23, z: 3, h: 2 },
];
const DEBRIS = [                               // floating chunks off the rim
  { x: 23, z: -16, y: 5, cells: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 0]] },
  { x: -25, z: 10, y: 8, cells: [[0, 0, 0], [0, 1, 0], [1, 0, 0]] },
  { x: 12, z: -24, y: 6, cells: [[0, 0, 0], [1, 0, 1]] },
];

// ── §water — two abutting toon surfaces + one mist breath ───────────────────
const WATER_LEVEL = 0.55;                      // land is h ≥ 1 everywhere wet
const RECT_MAIN = { x0: -5, x1: 24.6, z0: -9.4, z1: 10.4 };
const RECT_POCKET = { x0: 0.5, x1: 14, z0: 10.4, z1: 13.2 };
const MIST = { x: 21, y: 0.5, z: 8.5, radius: 1.8, count: 6 };

// ── §decor — strings, boats, quay, reflections, the beam ────────────────────
const POLE_W = 0.16, POLE_H = 2.15, WIRE_Y = 2.05;
const WIRE_T = 0.045, WIRE_SEGS = 6, WIRE_SAG = 0.38;
const BEAD = 0.5;                              // half-scale lantern beads
const BEAD_LONG_SPAN = 4.2;                    // two beads beyond this span
const POLES = [
  // village waterline chain — mooring-post lanterns standing in the shallows,
  // hugging the shore just east of the house fronts (base resolved per cell)
  { x: 1.6, z: -6.3 }, { x: -0.7, z: -4.2 }, { x: -0.9, z: -1.2 },
  { x: -0.9, z: 1.8 }, { x: -0.6, z: 4.8 }, { x: -0.2, z: 7.6 }, { x: 0.8, z: 10.2 },
  // pier chain (base = pier deck; the last pole stands on the lighthouse rock)
  { x: 3.2, z: 11.15, base: 1 }, { x: 6.4, z: 11.15, base: 1 },
  { x: 9.6, z: 11.15, base: 1 }, { x: 12.6, z: 11.2, base: 1 },
  { x: 15.6, z: 11.7, base: 1 }, { x: 17.6, z: 11.6, base: 2 },
];
// standalone lamps: the grand hall's yard (the lane's summit) + the dock end
const YARD_LAMP = { x: -9.8, z: -1.9 };
const DOCK_LAMP = { x: 25.5, z: -11.9 };

const ROWBOAT = { x: -0.1, z: 5.7, yaw: 0 };   // half-scale, afloat in the shallows
const DINGHY = { x: 14.5, z: -7.5 };           // beached upside-down on the strip
const QUAY_BOLLARDS = [[17.3, -10.95], [20.6, -10.95]];
const QUAY_BARRELS = [[16.6, -12.6], [17.15, -12.35], [16.85, -11.9]];
const PIER_BARRELS = [[2.7, 10.3], [3.3, 10.05]];

// painted reflections: thin plates floating just above the surface
const REFL_Y = WATER_LEVEL + 0.1, REFL_T = 0.03;
const LH_REFL = { x: 19.5, z0: 10.2, step: 1.15, n: 8, w0: 0.85, shrink: 0.07 };
const HOUSE_REFL = [                           // under the plaster fronts
  { x: 0.6, z: -3.4, dx: 0.95, dz: -0.35, n: 5 },
  { x: 0.4, z: 6.2, dx: 0.95, dz: -0.3, n: 3 },
];

const BEAM = { x0: 20.8, len: 24, y: 14.5, z: 12.5, h: 1.1, opacity: 0.42 };

// arrival dock (decor deck off the quay's seaward rim) + spawn
const DOCK = { x0: 20.8, x1: 26.0, z0: -12.9, z1: -11.15, deckY: 0.1 };
const DOCK_SPAWN = { x: 18.5, z: -11.5 };      // bare quay ground, hero vista SW
const LABEL_POS = { x: 24.5, y: 2.5, z: -12 };

// ── deterministic helpers ───────────────────────────────────────────────────

// Per-cell hash in [0, 1) — same recipe as world.js. `salt` decorrelates uses.
function hashCell(x, z, salt = 0) {
  let h = (Math.imul(x + salt * 101, 374761393) + Math.imul(z - salt * 53, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const distDisc = (x, z, d) => Math.hypot(x + 0.5 - d.cx, z + 0.5 - d.cz) - d.r;

function distSeg(x, z, x0, z0, x1, z1) {
  const px = x + 0.5 - x0, pz = z + 0.5 - z0;
  const dx = x1 - x0, dz = z1 - z0;
  const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - t * dx, pz - t * dz);
}

const inQuay = (x, z) => x >= QUAY.x0 && x <= QUAY.x1 && z >= QUAY.z0 && z <= QUAY.z1;
const inSpit = (x, z) =>
  distSeg(x, z, SPIT.x0, SPIT.z0, SPIT.x1, SPIT.z1) <= SPIT.r + (hashCell(x, z, 41) - 0.5) * 0.6;

// House pads force land + a fixed height under and 1 ring around each house.
const padMap = new Map();
for (const h of HOUSES) {
  for (let x = h.x0 - 1; x <= h.x0 + h.w; x++) {
    for (let z = h.z0 - 1; z <= h.z0 + h.d; z++) padMap.set(x + ',' + z, h.pad);
  }
}

function inBay(x, z) {
  if (z > BAY_CLIP_Z) return false;
  if (inSpit(x, z) || padMap.has(x + ',' + z)) return false;
  const wob = (hashCell(x, z, 31) - 0.5) * BAY_WOBBLE;
  return distDisc(x, z, BAY_A) <= wob || distDisc(x, z, BAY_B) <= wob;
}

function shoreDist(x, z) {
  return Math.max(0.25, Math.min(distDisc(x, z, BAY_A), distDisc(x, z, BAY_B)));
}

function laneDist(x, z) {
  return distSeg(x, z, LANE.x0, LANE.z0, LANE.x1, LANE.z1);
}

const inApron = (x, z) => x >= APRON.x0 && x <= APRON.x1 && z >= APRON.z0 && z <= APRON.z1;

// Terrain height for a LAND cell (callers test masks first).
function terrainH(x, z) {
  if (inQuay(x, z)) return 0;
  if (inApron(x, z)) return 1;
  const pad = padMap.get(x + ',' + z);
  if (pad !== undefined) return pad;
  if (laneDist(x, z) <= LANE.halfW) {
    return Math.max(1, Math.min(LANE_H_MAX, Math.round(1 + (-x - 2) * LANE_RISE)));
  }
  const d = shoreDist(x, z);
  let h = d < BEACH_W ? 1 : 1 + Math.floor((d - BEACH_W) / TERRACE_STEP);
  if (d >= BEACH_W + TERRACE_STEP && hashCell(x, z, 7) < TERRACE_BREAK) h += 1;
  let cap = Math.max(CAP_BASE, Math.min(CAP_WEST_MAX, Math.round(CAP_BASE + (4 - x) * CAP_WEST_RATE)));
  if (z < CAP_NORTH_Z) cap = Math.min(cap, CAP_NORTH_H);
  if (z > CAP_SOUTH_Z) cap = Math.min(cap, CAP_SOUTH_H);
  h = Math.min(h, cap);
  for (const r of RIDGES) {
    const rd = Math.hypot(x + 0.5 - r.cx, z + 0.5 - r.cz);
    const rh = r.peak - Math.floor(rd * r.steep);
    if (rh > h) h = rh;
  }
  // dome falloff: the land steps down toward the outer rim — sky-island profile
  const rim = 25 - Math.hypot(x + 0.5, z + 0.5);
  if (rim < RIM_FALL_W) h -= Math.round((RIM_FALL_W - rim) * RIM_FALL_RATE);
  return Math.max(1, Math.min(H_MAX, h));
}

export async function build(kit) {
  const { THREE, PALETTE, group, water } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);
  const isLandCell = (x, z) => world.isGroundAt(x + ox, z + oz) && !inBay(x, z);

  // ── terrain (block entries, GLOBAL coords; Map dedupes overlaps) ──────────
  const cells = new Map();
  const put = (x, y, z, c) => cells.set(x + ',' + y + ',' + z, [x + ox, y, z + oz, c]);

  const min = -world.radius, max = world.radius - 1;
  const heights = new Map();
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      if (!isLandCell(x, z)) continue;
      const h = terrainH(x, z);
      heights.set(x + ',' + z, h);
    }
  }
  const hAt = (x, z) => heights.get(x + ',' + z) ?? 0;

  for (const [k, h] of heights) {
    if (h <= 0) continue;
    const i = k.indexOf(',');
    const x = +k.slice(0, i), z = +k.slice(i + 1);
    const d = shoreDist(x, z);
    const onLane = laneDist(x, z) <= LANE.halfW && padMap.get(k) === undefined;
    for (let y = 0; y < h; y++) {
      let c;
      if (y < h - 1) {
        // column interior — Cocoa earth with Slate seams, Ink at the waterline
        c = hashCell(x, z, y + 3) < 0.3 ? C_SLATE : C_COCOA;
        if (y === 0 && d < WET_W + 0.6) c = C_INK;
      } else if (onLane) {
        c = hashCell(x, z, 9) < LANE_TERRA ? C_TERRACOTTA : C_SANDSTONE;
      } else if (d < WET_W) {
        c = C_INK;                                   // wet stone at the lip
      } else if (d < BEACH_W && h <= 2) {
        c = C_SANDSTONE;                             // the warm beach ring
      } else if (hAt(x - 1, z + 1) <= h - 2 && hashCell(x, z, 11) < WARM_BROW) {
        c = hashCell(x, z, 12) < 0.55 ? C_TERRACOTTA : C_SANDSTONE; // SW sun brow
      } else if (hAt(x + 1, z - 1) >= h + 2 && hashCell(x, z, 13) < SHADE_PLUM) {
        c = hashCell(x, z, 14) < 0.5 ? C_DUSTY_PLUM : C_TWILIGHT;   // NE crevice
      } else if ((hAt(x + 1, z) < h || hAt(x, z - 1) < h) && hashCell(x, z, 18) < SHADE_RIM) {
        c = hashCell(x, z, 19) < 0.5 ? C_DUSTY_PLUM : C_TWILIGHT;   // N/E-facing edge
      } else if (h >= 8) {
        const r = hashCell(x, z, 15);
        c = r < RIDGE_INK ? C_INK : r < RIDGE_INK + RIDGE_TWILIGHT ? C_TWILIGHT : C_SLATE;
        if (hashCell(x, z, 16) < 0.12) c = C_DUSTY_PLUM;
      } else {
        c = hashCell(x, z, 17) < TOP_COCOA ? C_COCOA : C_SLATE;
      }
      put(x, y, z, c);
    }
  }

  // ── §village — walls, gabled Ink roofs, chimneys ──────────────────────────
  for (let i = 0; i < HOUSES.length; i++) {
    const hs = HOUSES[i];
    const x1 = hs.x0 + hs.w - 1, z1 = hs.z0 + hs.d - 1;
    for (let x = hs.x0; x <= x1; x++) {
      for (let z = hs.z0; z <= z1; z++) {
        for (let y = hs.pad; y < hs.pad + hs.body; y++) {
          const c = hs.plaster && x === x1 ? C_WHITE : hs.wall;
          put(x, y, z, c);
        }
      }
    }
    // gable roof: rows shrink by 1 per side per level along the ridge axis
    const along = hs.axis === 'x';
    const a0 = along ? hs.x0 : hs.z0, a1 = along ? x1 : z1;
    const b0 = along ? hs.z0 : hs.x0, b1 = along ? z1 : x1;
    let lo = b0 - 1, hi = b1 + 1, lvl = 0;
    while (lo <= hi) {
      const y = hs.pad + hs.body + lvl;
      for (let a = a0 - 1; a <= a1 + 1; a++) {
        for (let b = lo; b <= hi; b++) {
          if (along) put(a, y, b, ROOF_C);
          else put(b, y, a, ROOF_C);
        }
      }
      lo += 1; hi -= 1; lvl += 1;
    }
    if (hs.chimney) {
      const y = hs.pad + hs.body + lvl;
      if (along) put(a0 + 1, y, Math.floor((b0 + b1) / 2), C_SLATE);
      else put(Math.floor((b0 + b1) / 2), y, a0 + 1, C_SLATE);
    }
  }

  // ── §landmark — the lighthouse ────────────────────────────────────────────
  const rockReach = Math.ceil(LH_ROCK_R + LH_ROCK_WOBBLE + 1);
  for (let x = LH.cx - rockReach; x <= LH.cx + rockReach; x++) {
    for (let z = LH.cz - rockReach; z <= LH.cz + rockReach; z++) {
      const wob = (hashCell(x, z, 43) - 0.5) * LH_ROCK_WOBBLE * 2;
      if (Math.hypot(x - LH.cx, z - LH.cz) > LH_ROCK_R + wob) continue;
      put(x, 0, z, C_INK);
      put(x, 1, z, C_SLATE);
    }
  }
  for (let x = LH.cx - 1; x <= LH.cx + 1; x++) {
    for (let z = LH.cz - 1; z <= LH.cz + 1; z++) {
      for (let y = LH_TOWER_Y0; y <= LH_TOWER_Y1; y++) {
        put(x, y, z, LH_BANDS.includes(y) ? C_BRICK_RED : C_WHITE);
      }
      // lantern room: Ink corner posts, Glow cross — pulses via the world's glow material
      const corner = Math.abs(x - LH.cx) === 1 && Math.abs(z - LH.cz) === 1;
      put(x, LH_LANTERN_Y, z, corner ? C_INK : C_GLOW);
      put(x, LH_CAP_Y, z, C_INK);
    }
  }
  for (let x = LH.cx - 2; x <= LH.cx + 2; x++) {
    for (let z = LH.cz - 2; z <= LH.cz + 2; z++) {
      if (Math.abs(x - LH.cx) === 2 && Math.abs(z - LH.cz) === 2) continue;
      put(x, LH_GALLERY_Y, z, C_INK);
    }
  }
  put(LH.cx, LH_CAP_Y + 1, LH.cz, C_INK);

  // ── §details — pier causeway, sea stacks, floating debris ─────────────────
  for (let x = PIER_X0; x <= PIER_X1; x++) put(x, 0, PIER_Z, C_COCOA);
  for (const s of STACKS) {
    for (let y = 0; y < s.h; y++) put(s.x, y, s.z, y === 0 ? C_INK : C_SLATE);
  }
  for (const d of DEBRIS) {
    for (let i = 0; i < d.cells.length; i++) {
      const [cx, cy, cz] = d.cells[i];
      const c = hashCell(d.x + cx, d.z + cz, 47) < 0.3 ? C_DUSTY_PLUM : C_SLATE;
      put(d.x + cx, d.y + cy, d.z + cz, cy < 0 || i === d.cells.length - 1 ? C_COCOA : c);
    }
  }

  await kit.setBlocksPaced(world, [...cells.values()]);

  // ── §water — two abutting surfaces (one shader family), mist at the mouth ─
  const isLand = (gx, gz) => isLandCell(gx - ox, gz - oz);
  for (const r of [RECT_MAIN, RECT_POCKET]) {
    const surf = water.makeSurface({
      width: r.x1 - r.x0,
      depth: r.z1 - r.z0,
      level: WATER_LEVEL,
      origin: { x: ox + (r.x0 + r.x1) / 2, z: oz + (r.z0 + r.z1) / 2 },
      isLand,
    });
    group.add(surf);
  }
  const mist = water.makeMist({
    position: new THREE.Vector3(ox + MIST.x, MIST.y, oz + MIST.z),
    radius: MIST.radius,
    count: MIST.count,
  });
  group.add(mist);

  // ── §decor — one lambert mesh + one glow mesh + the beam ──────────────────
  const decor = kit.decor;
  const glow = new kit.GeoBuilder();
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(0.78);
  const slate = color(C_SLATE);
  const slateDark = slate.clone().multiplyScalar(0.8);
  const ink = color(C_INK);
  const sandstone = color(C_SANDSTONE);
  const white = color(C_WHITE);
  const brick = color(C_BRICK_RED);
  const ember = color(C_EMBER);
  const glowC = color(C_GLOW);

  // quay paving — stone plates over the bare arrival ground
  for (let x = QUAY.x0; x <= QUAY.x1; x++) {
    for (let z = QUAY.z0; z <= QUAY.z1; z++) {
      const r = hashCell(x, z, 51);
      const c = r < 0.4 ? slate : r < 0.7 ? slateDark : cocoaDark;
      const j = (hashCell(x, z, 52) - 0.5) * 0.05;
      decor.box(ox + x + 0.03 + j, 0, oz + z + 0.03 - j, 0.94, 0.07, 0.94, c);
    }
  }
  for (const [bx, bz] of QUAY_BOLLARDS) {
    decor.box(ox + bx, 0.07, oz + bz, 0.18, 0.5, 0.18, ink);
  }

  // arrival dock — planks out over the rim, stilts into the void
  for (let i = 0; ; i++) {
    const px = DOCK.x0 + i * 0.95;
    if (px + 0.85 > DOCK.x1 + 0.01) break;
    decor.box(ox + px, DOCK.deckY, oz + DOCK.z0, 0.85, 0.12, DOCK.z1 - DOCK.z0,
      i % 2 ? cocoaDark : cocoa);
  }
  for (const px of [23.4, 25.5]) {
    for (const pz of [DOCK.z0 + 0.1, DOCK.z1 - 0.3]) {
      decor.box(ox + px, -2.3, oz + pz, 0.2, 2.45, 0.2, cocoaDark);
    }
  }
  for (const ez of [DOCK.z0 - 0.04, DOCK.z1 - 0.12]) {
    for (let px = DOCK.x0 + 0.3; px <= DOCK.x1 - 0.5; px += 1.3) {
      decor.box(ox + px, DOCK.deckY + 0.12, oz + ez, 0.16, 0.55, 0.16, ink);
    }
    decor.box(ox + DOCK.x0 + 0.3, DOCK.deckY + 0.55, oz + ez + 0.035,
      DOCK.x1 - DOCK.x0 - 0.8, 0.06, 0.09, cocoaDark);
  }

  // pier deck — planks overhanging the causeway, stilt posts in the water
  for (let x = PIER_X0; x <= PIER_X1; x++) {
    for (const [off, w] of [[0.04, 0.42], [0.52, 0.42]]) {
      decor.box(ox + x + off, 1.0, oz + PIER_Z - 0.15, w, 0.07,
        1.3, (x + (off > 0.3 ? 1 : 0)) % 2 ? cocoaDark : cocoa);
    }
    if ((x - PIER_X0) % 3 === 0) {
      for (const sz of [PIER_Z - 0.22, PIER_Z + 1.1]) {
        if (cells.has(x + ',0,' + Math.floor(sz))) continue; // stilts only over open water
        decor.box(ox + x + 0.42, -0.05, oz + sz, 0.14, 1.05, 0.14, cocoaDark);
      }
    }
  }
  decor.box(ox + PIER_X0 + 0.2, 1.45, oz + PIER_Z + 1.06,
    PIER_X1 - PIER_X0 + 0.4, 0.05, 0.06, ink);   // south rope rail
  for (let x = PIER_X0; x <= PIER_X1 + 0.1; x += 2.6) {
    decor.box(ox + x + 0.7, 1.07, oz + PIER_Z + 1.04, 0.12, 0.44, 0.12, ink);
  }

  // lantern strings — poles, stepped catenary wire, half-scale glow beads
  const poleBase = (p) => p.base !== undefined ? p.base : hAt(Math.floor(p.x), Math.floor(p.z));
  const poleTop = (p) => ({ x: ox + p.x, y: poleBase(p) + WIRE_Y, z: oz + p.z });
  const addPole = (p) => {
    const b = poleBase(p);
    decor.box(ox + p.x - POLE_W / 2, b, oz + p.z - POLE_W / 2, POLE_W, POLE_H, POLE_W, ink);
    decor.box(ox + p.x - 0.15, b + POLE_H, oz + p.z - 0.15, 0.3, 0.07, 0.3, cocoaDark);
  };
  const wire = (a, b) => {
    let prev = null;
    for (let i = 0; i <= WIRE_SEGS; i++) {
      const t = i / WIRE_SEGS;
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - WIRE_SAG * 4 * t * (1 - t),
        z: a.z + (b.z - a.z) * t,
      };
      if (prev) {
        decor.box(
          Math.min(prev.x, p.x) - WIRE_T / 2, Math.min(prev.y, p.y) - WIRE_T / 2,
          Math.min(prev.z, p.z) - WIRE_T / 2,
          Math.abs(p.x - prev.x) + WIRE_T, Math.abs(p.y - prev.y) + WIRE_T,
          Math.abs(p.z - prev.z) + WIRE_T, ink);
      }
      prev = p;
    }
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const ts = span > BEAD_LONG_SPAN ? [0.33, 0.67] : [0.5];
    for (const t of ts) {
      const bx = a.x + (b.x - a.x) * t;
      const by = a.y + (b.y - a.y) * t - WIRE_SAG * 4 * t * (1 - t);
      const bz = a.z + (b.z - a.z) * t;
      glow.box(bx - BEAD / 2, by - BEAD - 0.02, bz - BEAD / 2, BEAD, BEAD, BEAD, glowC);
      decor.box(bx - BEAD / 2 - 0.03, by - 0.02, bz - BEAD / 2 - 0.03, BEAD + 0.06, 0.07, BEAD + 0.06, ink);
    }
  };
  for (const p of POLES) addPole(p);
  for (let i = 0; i + 1 < POLES.length; i++) wire(poleTop(POLES[i]), poleTop(POLES[i + 1]));

  // standalone lamps (post + pulsing head) — the lane summit and the dock end
  const lamp = (x, y, z) => {
    decor.box(ox + x - 0.09, y, oz + z - 0.09, 0.18, 1.15, 0.18, ink);
    glow.box(ox + x - 0.15, y + 1.15, oz + z - 0.15, 0.3, 0.3, 0.3, glowC);
    decor.box(ox + x - 0.21, y + 1.45, oz + z - 0.21, 0.42, 0.08, 0.42, cocoaDark);
  };
  lamp(YARD_LAMP.x, hAt(Math.floor(YARD_LAMP.x), Math.floor(YARD_LAMP.z)), YARD_LAMP.z);
  lamp(DOCK_LAMP.x, DOCK.deckY + 0.12, DOCK_LAMP.z);

  // house fronts — doors, windows, Brick Red / Ember shutters
  for (let i = 0; i < HOUSES.length; i++) {
    const hs = HOUSES[i];
    const fx = ox + hs.x0 + hs.w;                // east face plane
    const cz = oz + hs.z0 + hs.d / 2;
    const shutterC = hashCell(hs.x0, hs.z0, 61) < 0.5 ? brick : ember;
    decor.box(fx, hs.pad, cz - 0.42, 0.07, 1.7, 0.84, ink);          // door
    decor.box(fx - 0.05, hs.pad - 0.06, cz - 0.5, 0.45, 0.12, 1.0, sandstone); // step
    if (hs.body >= 2) {
      const wy = hs.pad + 1.15;
      const wz = [cz - hs.d / 2 + 0.55, cz + hs.d / 2 - 1.05];
      for (const z of hs.d >= 3 ? wz : [wz[0]]) {
        if (hs.glow) glow.box(fx, wy, z, 0.06, 0.62, 0.5, glowC);
        else decor.box(fx, wy, z, 0.06, 0.62, 0.5, ink);
        decor.box(fx, wy, z - 0.26, 0.06, 0.62, 0.22, shutterC);
        decor.box(fx, wy, z + 0.54, 0.06, 0.62, 0.22, shutterC);
      }
    }
  }

  // gallery railing on the lighthouse — Brick Red posts, Ink rail
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    decor.box(ox + LH.cx + 0.5 + Math.cos(a) * 2.2 - 0.06, LH_GALLERY_Y + 1,
      oz + LH.cz + 0.5 + Math.sin(a) * 2.2 - 0.06, 0.12, 0.55, 0.12, brick);
  }
  decor.box(ox + LH.cx - 1.75, LH_GALLERY_Y + 1.5, oz + LH.cz - 1.75, 4.5, 0.06, 0.06, ink);
  decor.box(ox + LH.cx - 1.75, LH_GALLERY_Y + 1.5, oz + LH.cz + 2.69, 4.5, 0.06, 0.06, ink);
  decor.box(ox + LH.cx - 1.75, LH_GALLERY_Y + 1.5, oz + LH.cz - 1.69, 0.06, 0.06, 4.38, ink);
  decor.box(ox + LH.cx + 2.69, LH_GALLERY_Y + 1.5, oz + LH.cz - 1.69, 0.06, 0.06, 4.38, ink);
  decor.box(ox + LH.cx + 0.34, LH_CAP_Y + 2, oz + LH.cz + 0.34, 0.32, 0.5, 0.32, ink); // finial
  glow.box(ox + LH.cx + 0.41, LH_CAP_Y + 2.5, oz + LH.cz + 0.41, 0.18, 0.18, 0.18, glowC);
  decor.box(ox + LH.cx - 1.07, LH_TOWER_Y0, oz + LH.cz + 0.08, 0.07, 1.6, 0.84, ink); // door (west)
  decor.box(ox + LH.cx - 1.45, LH_TOWER_Y0 - 0.06, oz + LH.cz, 0.4, 0.12, 1.0, sandstone);

  // the rowboat — half-scale, the last note of the big→medium→small cascade
  const bx = ox + ROWBOAT.x, bz = oz + ROWBOAT.z;
  decor.box(bx - 0.75, 0.42, bz - 0.3, 1.5, 0.1, 0.6, cocoaDark);    // hull floor
  decor.box(bx - 0.75, 0.5, bz - 0.36, 1.5, 0.26, 0.09, cocoa);      // gunwales
  decor.box(bx - 0.75, 0.5, bz + 0.27, 1.5, 0.26, 0.09, cocoa);
  decor.box(bx - 0.84, 0.5, bz - 0.3, 0.12, 0.3, 0.6, cocoa);        // bow / stern
  decor.box(bx + 0.72, 0.5, bz - 0.3, 0.12, 0.3, 0.6, cocoa);
  decor.box(bx - 0.2, 0.58, bz - 0.3, 0.14, 0.07, 0.6, sandstone);   // thwart
  decor.box(bx - 0.7, 0.62, bz - 0.05, 0.9, 0.05, 0.07, sandstone);  // shipped oar
  glow.box(bx + 0.62, 0.78, bz - 0.09, 0.18, 0.18, 0.18, glowC);     // bow lantern
  decor.box(bx + 0.58, 0.74, bz - 0.13, 0.26, 0.05, 0.26, ink);

  // beached dinghy + barrels on the north strip
  decor.box(ox + DINGHY.x - 0.7, 1.0, oz + DINGHY.z - 0.3, 1.4, 0.26, 0.6, cocoaDark);
  decor.box(ox + DINGHY.x - 0.55, 1.26, oz + DINGHY.z - 0.06, 1.1, 0.07, 0.12, slateDark);
  for (const [px, pz] of QUAY_BARRELS) {
    decor.box(ox + px, 0.07, oz + pz, 0.42, 0.52, 0.42, cocoa);
    decor.box(ox + px - 0.02, 0.28, oz + pz - 0.02, 0.46, 0.07, 0.46, slateDark);
  }
  for (const [px, pz] of PIER_BARRELS) {
    decor.box(ox + px, 1, oz + pz, 0.42, 0.52, 0.42, cocoaDark);
  }
  decor.box(ox + 19.6, 0.07, oz + -12.7, 0.55, 0.5, 0.55, slateDark); // quay crate
  decor.box(ox + 20.25, 0.07, oz + -12.45, 0.45, 0.4, 0.45, cocoa);

  // hand-placed reflections — thin plates riding just above the still water
  const reflWhite = white.clone().multiplyScalar(0.45);
  const reflWhiteDim = white.clone().multiplyScalar(0.32);
  const reflBrick = brick.clone().multiplyScalar(0.5);
  const reflGlow = glowC.clone().multiplyScalar(0.55);
  for (let k = 0; k < LH_REFL.n; k++) {
    if (hashCell(k, 5, 71) < 0.18) continue;
    const w = LH_REFL.w0 * (1 - k * LH_REFL.shrink);
    const px = ox + LH_REFL.x + (hashCell(k, 9, 72) - 0.5) * 0.3 - w / 2;
    const pz = oz + LH_REFL.z0 - k * LH_REFL.step;
    if (k === 4) glow.box(px, REFL_Y, pz, w, REFL_T, 0.5, reflGlow);
    else if (k % 3 === 2) decor.box(px, REFL_Y, pz, w, REFL_T, 0.55, reflBrick);
    else decor.box(px, REFL_Y, pz, w, REFL_T, 0.55, k < 4 ? reflWhite : reflWhiteDim);
  }
  for (const r of HOUSE_REFL) {
    for (let k = 0; k < r.n; k++) {
      const w = 0.55 * (1 - k * 0.12);
      const px = ox + r.x + r.dx * k * 1.05 - w / 2;
      const pz = oz + r.z + r.dz * k * 1.05;
      if (k === 1) glow.box(px, REFL_Y, pz, w, REFL_T, 0.4, reflGlow);
      else decor.box(px, REFL_Y, pz, w, REFL_T, 0.4, k === 0 ? reflWhite : reflWhiteDim);
    }
  }
  for (let i = 8; i < 11; i += 2) {                      // pier bead shimmer
    glow.box(ox + POLES[i].x - 0.2, REFL_Y, oz + POLES[i].z - 1.3, 0.4, REFL_T, 0.5, reflGlow);
  }

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: '#FFE8A8', emissiveIntensity: 0.55,
  }));
  glowMesh.castShadow = true;
  glowMesh.receiveShadow = true;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // the beam — ONE long additive Honey quad, aimed seaward, fading to nothing
  const beamGeo = new THREE.PlaneGeometry(BEAM.len, BEAM.h, 1, 1);
  const honey = color(C_HONEY);
  const beamCols = new Float32Array(4 * 3);
  const bpos = beamGeo.attributes.position;
  for (let i = 0; i < 4; i++) {
    const near = bpos.getX(i) < 0;
    beamCols[i * 3] = near ? honey.r : 0;
    beamCols[i * 3 + 1] = near ? honey.g : 0;
    beamCols[i * 3 + 2] = near ? honey.b : 0;
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(beamCols, 3));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: BEAM.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  }));
  beam.position.set(ox + BEAM.x0 + BEAM.len / 2, BEAM.y, oz + BEAM.z);
  beam.matrixAutoUpdate = false;
  beam.updateMatrix();
  group.add(beam);

  // ── §dock — sign + spawn on the quay, hero vista SW across the cove ───────
  const label = kit.makeLabelSprite('wicklight harbor');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
