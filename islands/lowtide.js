// islands/lowtide.js — lowtide: a half-drowned marble court at eternal low tide.
//
// Composition: ONE shallow toon sea floods a lagoon across the island's west
// and north. A marble causeway leaves the dock quay and marches through the
// water past twelve broken columns — each wearing its olive tide-stain ring at
// the waterline, each wrapped in its own foam ring — then climbs the court to
// the focal point: the half-collapsed verdigris dome, breached on the side
// that faces the dock. Through the wound: Honey light shafts, a sunlit Honey
// patch on the far interior wall, and Glow Lantern jewels. Cloud White, Honey
// and Glow appear ONLY there; the marble brightens toward it; shadows shift to
// Dusty Plum/Twilight, and the drowned paving darkens Slate/Twilight at every
// waterline. Hue band owned: pale Sandstone marble × verdigris Teal.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_WHITE = 0;
const C_SAND = 1;
const C_PLUM = 4;
const C_TWILIGHT = 5;
const C_TEAL = 6;
const C_SAGE = 7;
const C_OLIVE = 8;
const C_HONEY = 9;
const C_COCOA = 12;
const C_SLATE = 13;
const C_GLOW = 15;

// ── the sea: one surface, lagoon + flooded lobe + two tide pools ────────────
const SEA_LEVEL = 1.45;                   // halfway up block row y=1 — low tide
const BAY = { x: -6, z: -1, r: 22, wobble: 2.6, salt: 31 };
const LOBE = { x: 8, z: -14, r: 7.8, wobble: 1.8, salt: 37 };
const POOLS = [                           // tide pools left behind on the flat
  { x: 16, z: -10, r: 1.4, salt: 41 },
  { x: 16, z: -6, r: 1.5, salt: 43 },
];
// Sea cells are clipped to this box so the rectangular water plane's corners
// always land inside the island disc (hidden inside shore blocks, never void).
// The clip edges wobble INWARD only, so shorelines stay organic while the
// plane extremes never grow.
const SEA_CLIP_X = 19.5;                  // wobble bites inward from these, so
const SEA_CLIP_Z = 18.5;                  // cells never pass ±18.5 / ±17.5
const SEA_CLIP_WOBBLE = 1.5;              // (plane corners stay over ground)
const COURT_SEA_R = 11.6;                 // the tide bites the court's west rim
const PAVE_TWI = 0.12;                    // twilight dither on drowned paving
const WET_SCAN = 3;                       // wet-ring scan radius (cells)

// ── the court and the dome (the focal point) ────────────────────────────────
const COURT = { x: 12, z: 7 };            // cell-corner center; +0.5 for middle
const COURT_R = 13.2;                     // marble platform, top y=3
const APRON_R = 14.8;                     // half-step apron, top y=2 (= flat)
const PLINTH_R = 8.2;                     // dome plinth, top y=4 (interior floor)
const COURT_GAP = 0.05;                   // missing-tile odds on the court top
const COURT_MOSS = 0.06;                  // sage moss specks between court tiles
const MOSAIC_R0 = 2.5, MOSAIC_R1 = 4.0;   // teal mosaic ring on the dome floor

const DRUM_R0 = 6.2, DRUM_R1 = 7.9;       // rotunda wall ring
const DRUM_Y0 = 4, DRUM_Y1 = 9;
const DRUM_WHITE = 0.52;                  // Cloud White share of the drum marble
const DRUM_BASE_STAIN = 0.3;              // olive damp ring on the drum's foot row
const DOME_R = 8.0;                       // shell hemisphere radius
const SHELL_Y0 = 10, SHELL_Y1 = 17;
const SHELL_T = 2.6;                      // shell ring thickness (inward)
const SHELL_OUT = 0.45;                   // …and a small cornice overhang
const SHELL_SAGE = 0.2;                   // weather streaks in the verdigris
const SHELL_WHITE = 0.07;                 // sun-bleached flecks
const DOOR_HALF = 0.21;                   // door arc half-width (radians)
const DOOR_Y1 = 6;                        // opening rows DRUM_Y0..DOOR_Y1
const BREACH_HALF_MAX = 1.25;             // collapse sector half-width at the top
const BREACH_Y0 = 7;                      // sector ramps open from here…
const BREACH_YTOP = 16;                   // …to full width here
const BREACH_RAGGED = 0.3;                // hash raggedness of the carve edge
const RIM_BAND = 0.45;                    // accent band just outside the carve
const RIM_WHITE = 0.4;                    // fresh-break Cloud White odds
const RIM_HONEY = 0.55;                   // Honey odds on the sun-side rim edge
// Sunlit patch the breach throws on the far interior wall (visible from dock).
const PATCH_AZ0 = -0.35, PATCH_AZ1 = 0.45;
const PATCH_Y0 = 5, PATCH_Y1 = 8;
const PATCH_D_IN = 7.0;                   // inner drum layer only
const PATCH_GLOW_CELLS = [[19, 7, 6], [18, 5, 7]];   // x, z, y — pulsing core
const FLOOR_GLOW_CELLS = [[9, 5], [14, 9], [11, 3]]; // glow tiles in the floor
const ALTAR = { x: 13, z: 5, y: 4 };      // 2×2 white altar on the dome floor

// ── the avenue: quay → causeway → columns → court steps ─────────────────────
const DOCK_SPAWN = { x: -22.5, z: -6.5 }; // local; on the quay flat
const AVE_A = { x: -21, z: -5.6 };        // causeway start, at the quay
const AVE_DIR = { x: 0.934, z: 0.357 };   // unit line toward the dome door
const CAUSE_HALF = 1.5;                   // causeway half-width
const CAUSE_T_MAX = 26;                   // raster length cap (stops at court)
const CAUSE_OLIVE = 0.32;                 // tide-stain dither on the deck

// Broken 2×2 columns: [anchorX, anchorZ, shaftRows, capped, ragged]. Bases
// auto-sit on sea paving (y1), flat (y2) or court (y3); row y=1 wears the
// Olive/Sage tide stain. The two capped 8-row columns are the court gate.
const COLS = [
  [-18, -2, 4, 0, 1], [-16, -7, 3, 0, 1],
  [-14, 0, 7, 1, 0], [-12, -5, 4, 0, 1],
  [-9, 2, 5, 0, 1], [-7, -3, 8, 1, 0],
  [-5, 3, 9, 1, 0], [-3, -2, 4, 0, 1],
  [-1, 5, 7, 1, 0], [0, -1, 5, 0, 1],
  [2, 6, 8, 1, 0], [4, 0, 8, 1, 0],
];
const STUMPS = [[-19, -10, 1], [-3, 8, 2], [9, -6, 1], [-13, 8, 1], [19, 12, 2]];
// Ghost peristyle: drowned pedestal stubs ringing the court apron.
const PEDESTALS = [[4, -4], [10, -6], [17, -5], [23, -1], [16, 20], [9, 20], [3, 17]];
const RAG_TOP = 0.62;                     // keep odds, broken top row
const RAG_UNDER = 0.88;                   // keep odds, row under the break
const STAIN_OLIVE = 0.6;                  // vs sage, in the tide ring
const CAP_WHITE = 0.6;                    // capital marble mix

// Two toppled column drums, half-buried/half-drowned: cell rects + rest row.
const TOPPLED = [
  { x0: -21, x1: -20, z0: -1, z1: 2, y: 2 },  // on the quay flat
  { x0: -7, x1: -4, z0: 4, z1: 5, y: 1 },     // out in the bay
];

// Propylon: a half-collapsed gateway framing the avenue's first steps.
const PYLON_A = { x: -21, z: -3, rows: 6 };   // standing, carries a lintel stub
const PYLON_B = { x: -19, z: -8, rows: 3 };   // broken at shoulder height
const PYLON_STUB = [[-21, -4], [-20, -4]];    // lintel cells reaching for B

// ── supporting ruins ────────────────────────────────────────────────────────
// Roofless cella, half-standing in the flooded north lobe.
const CELLA = { x0: 2, x1: 9, z0: -15, z1: -11, rows: 5 };
const CELLA_DOOR = [[5, -11], [6, -11]];      // 2-wide door, south wall
const CELLA_KEEP_HI = 0.5;                    // ragged top rows
const CELLA_KEEP_MID = 0.82;
// Drowned arcade in the bay's south reach: three piers, broken lintels.
const ARCADE_PIERS = [4, 7, 10];
const ARCADE_Z = 11;                          // piers span z..z+1
const ARCADE_TOP = 5;                         // pier top row
const ARCADE_LINTELS = [[4, 7], [9, 10]];     // x-runs at ARCADE_TOP + 1
// Ruined seawall stubs on the rim: [az0, az1] arcs (radians, atan2 space).
const SEAWALL_ARCS = [[-2.3, -0.8], [0.8, 2.3]];
const SEAWALL_R0 = 24.6, SEAWALL_R1 = 26.8;
const SEAWALL_KEEP = 0.95;
// Rubble fields (clumped, never even rows): x, z, r, density.
const RUBBLE = [[-4, -21, 3.5, 0.2], [16, 1, 4, 0.15], [-16, 18, 3, 0.2]];
// Floating debris: the collapse frozen mid-air over the breach side.
const DEBRIS = [
  [3, 15, 2, C_TEAL], [4, 15, 2, C_WHITE], [3, 15, 3, C_TEAL],
  [3, 16, 2, C_SAND], [4, 16, 3, C_TEAL],
  [-2, 18, -1, C_WHITE], [-1, 18, -1, C_TEAL], [-2, 19, -1, C_SAND],
  [4, 13, 13, C_TEAL], [4, 13, 14, C_SLATE],
];

// ── paint ramps and shading ─────────────────────────────────────────────────
const WHITE_RAMP_DIST = 34;               // marble whitens toward the dome…
const WHITE_RAMP_MAX = 0.5;               // …from this far out, to this odds
const WHITE_FLOOR = 0.02;
const FLAT_GAP = 0.08;                    // missing tiles on the tidal flat
const NE_RIM_R = 23.5;                    // plum/twilight shadow dither on the
const NE_AZ0 = -1.25, NE_AZ1 = 0.15;      // island's NE rim (sun is SW)
const NE_SHADE = 0.4;
const SPAWN_SOLID_R = 3;                  // no missing tiles around the spawn

// ── honey light shafts through the breach (parallel to the SW sun) ──────────
const BEAM_DIR = { x: 0.9437, y: -0.3267, z: -0.0508 };
const BEAM_MID = { x: 11.9, y: 8.3, z: 7.6 };
const BEAM_LEN = 12.5;
const BEAM_THICK = 0.07;
const BEAMS = [                           // width, sideways offset, lift
  { w: 1.5, off: -1.7, lift: 0.3 },
  { w: 0.95, off: 0, lift: 0 },
  { w: 0.6, off: 1.6, lift: -0.25 },
];
const BEAM_OPACITY = 0.32;
const BEAM_EMISSIVE = '#EBB44E';

// ── glow jewels (decor, emissive) ───────────────────────────────────────────
const JEWELS = [                          // x, y, z, size — on the dome floor
  [13.4, 4, 4.1, 0.42], [14.9, 4, 5.4, 0.3], [13.1, 4, 6.2, 0.34],
  [15.3, 4, 7.0, 0.26], [8.6, 4, 5.6, 0.3], [9.3, 4, 7.9, 0.26],
  [10.6, 4, 4.4, 0.26], [12.2, 4, 8.9, 0.3],
];
const ALTAR_GEM = { x: 13.7, y: 5, z: 5.7, s: 0.5 };
const JEWEL_EMISSIVE = '#FFE8A8';

// ── mist (≤2 groups) ────────────────────────────────────────────────────────
const MIST_BREACH = { x: 11, y: 4.8, z: 6, radius: 2.4, count: 6 };
const MIST_BAY = { x: -10, y: 1.8, z: 0, radius: 3.5, count: 5 };

// ── dock, quay decor, label ─────────────────────────────────────────────────
const PIER_X0 = -30.6, PIER_X1 = -24.2;
const PIER_Z0 = -7.8, PIER_Z1 = -5.4;
const PIER_DECK_Y = 2.02;
const PIER_DECK_H = 0.14;
const PIER_PLANK = 0.92;
const PIER_POST = 0.22;
const PIER_POST_DEPTH = -2.0;
const PIER_DARK = 0.82;
const MOORING = [[-30.1, -7.7], [-30.1, -5.7]];
const BOLLARDS = [[-19.55, -12], [-19.55, -6], [-19.55, 0], [-19.55, 6]];
const LABEL_POS = { x: -25.5, y: 4.6, z: -6.5 };

// litter zones for sub-voxel marble chips: x, z, r, odds
const LITTER = [[-12, -3, 9, 0.09], [14, 7, 12, 0.08], [5, -13, 6, 0.07]];
const QUAY_TUFTS = [-12.4, -9.2, -3.6, -0.8, 2.2, 5.8];   // z spots, x = quay lip
const FALLEN_SLABS = [                    // abacus pieces resting on the stumps
  [-18.6, 2, -9.8], [-2.6, 3, 8.4], [9.4, 2, -5.6],
];
const POOL_PEBBLES = [
  [14.6, -11.4], [18.0, -9.2], [14.2, -6.0], [17.8, -4.6], [15.4, -3.6],
];

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

// Signed smallest angle a − b, wrapped to (−π, π].
function angSub(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const inIsland = (x, z) => Math.hypot(x + 0.5, z + 0.5) <= 27;
const courtDist = (x, z) => Math.hypot(x + 0.5 - (COURT.x + 0.5), z + 0.5 - (COURT.z + 0.5));
const courtAz = (x, z) => Math.atan2(z + 0.5 - (COURT.z + 0.5), x + 0.5 - (COURT.x + 0.5));
const AZ_BREACH = Math.atan2(DOCK_SPAWN.z - (COURT.z + 0.5), DOCK_SPAWN.x - (COURT.x + 0.5));

// Raw lagoon mask: bay + lobe + pools, clipped to the safe plane box and held
// off the court. Structures punch land back out of it (the foot set) so foam
// rings every drowned column, pier and causeway edge.
function inLagoonRaw(x, z) {
  const clipX = SEA_CLIP_X - hashCell(0, z, 74) * SEA_CLIP_WOBBLE;
  const clipZ = SEA_CLIP_Z - hashCell(x, 0, 75) * SEA_CLIP_WOBBLE;
  if (Math.abs(x + 0.5) > clipX || Math.abs(z + 0.5) > clipZ) return false;
  if (!inIsland(x, z)) return false;
  if (courtDist(x, z) <= COURT_SEA_R) return false;
  if (inDisc(x, z, BAY.x, BAY.z, BAY.r, BAY.wobble, BAY.salt)) return true;
  if (inDisc(x, z, LOBE.x, LOBE.z, LOBE.r, LOBE.wobble, LOBE.salt)) return true;
  for (const p of POOLS) {
    if (inDisc(x, z, p.x, p.z, p.r, 0.8, p.salt)) return true;
  }
  return false;
}

// White-marble ramp: paving and shafts brighten toward the focal dome.
function whiteOdds(x, z) {
  const d = courtDist(x, z);
  const t = Math.max(0, 1 - d / WHITE_RAMP_DIST);
  return WHITE_FLOOR + WHITE_RAMP_MAX * t * t;
}

export async function build(kit) {
  const { THREE, PALETTE, group, water } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // ── the avenue raster and the drowned-structure foot set ──────────────────
  const ck = (x, z) => x + ',' + z;
  const causeway = new Set();
  for (let t = 0; t <= CAUSE_T_MAX; t += 0.4) {
    const px = AVE_A.x + AVE_DIR.x * t;
    const pz = AVE_A.z + AVE_DIR.z * t;
    if (Math.hypot(px - (COURT.x + 0.5), pz - (COURT.z + 0.5)) < COURT_SEA_R) break;
    for (let w = -CAUSE_HALF; w <= CAUSE_HALF; w += 0.5) {
      causeway.add(ck(Math.round(px - AVE_DIR.z * w), Math.round(pz + AVE_DIR.x * w)));
    }
  }
  const foot = new Set(causeway);
  for (const [cx, cz] of COLS) {
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) foot.add(ck(cx + dx, cz + dz));
  }
  for (const [sx, sz] of STUMPS) {
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) foot.add(ck(sx + dx, sz + dz));
  }
  for (const [px, pz] of PEDESTALS) {
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) foot.add(ck(px + dx, pz + dz));
  }
  for (const p of [PYLON_A, PYLON_B]) {
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) foot.add(ck(p.x + dx, p.z + dz));
  }
  for (const d of TOPPLED) {
    for (let x = d.x0; x <= d.x1; x++) for (let z = d.z0; z <= d.z1; z++) foot.add(ck(x, z));
  }
  for (let x = CELLA.x0; x <= CELLA.x1; x++) {
    for (let z = CELLA.z0; z <= CELLA.z1; z++) {
      if (x === CELLA.x0 || x === CELLA.x1 || z === CELLA.z0 || z === CELLA.z1) foot.add(ck(x, z));
    }
  }
  for (const px of ARCADE_PIERS) {
    foot.add(ck(px, ARCADE_Z));
    foot.add(ck(px, ARCADE_Z + 1));
  }

  const inSea = (x, z) => inLagoonRaw(x, z) && !foot.has(ck(x, z));
  const distToSea = (x, z) => {
    let best = WET_SCAN + 1;
    for (let dx = -WET_SCAN; dx <= WET_SCAN; dx++) {
      for (let dz = -WET_SCAN; dz <= WET_SCAN; dz++) {
        if (!inSea(x + dx, z + dz)) continue;
        const d = Math.hypot(dx, dz);
        if (d < best) best = d;
      }
    }
    return best;
  };

  // ── terrain (deduped local map → global entries) ──────────────────────────
  const cells = new Map();
  const put = (x, y, z, c) => cells.set(x + ',' + y + ',' + z, [x, y, z, c]);

  // colour of a dry/wet paving tile on the flat and apron
  const tileColor = (x, z, salt) => {
    const wet = distToSea(x, z);
    const h = hashCell(x, z, salt);
    if (wet <= 1.5) return h < 0.5 ? C_SLATE : C_TWILIGHT;
    if (wet <= 2.5) return h < 0.45 ? C_TWILIGHT : C_TEAL;
    if (wet <= 3.5) return h < 0.5 ? C_OLIVE : C_SAGE;
    const az = Math.atan2(z + 0.5, x + 0.5);
    if (Math.hypot(x + 0.5, z + 0.5) >= NE_RIM_R && az > NE_AZ0 && az < NE_AZ1 &&
        hashCell(x, z, 11) < NE_SHADE) {
      return hashCell(x, z, 12) < 0.55 ? C_PLUM : C_TWILIGHT;
    }
    if (hashCell(x, z, 13) < whiteOdds(x, z)) return C_WHITE;
    return C_SAND;
  };

  // ground pass: drowned paving, court, apron, tidal flat
  for (let x = -27; x <= 26; x++) {
    for (let z = -27; z <= 26; z++) {
      if (!inIsland(x, z)) continue;
      if (inSea(x, z)) {
        // the drowned courtyard floor, darkened to slate under the water
        put(x, 0, z, hashCell(x, z, 14) < PAVE_TWI ? C_TWILIGHT : C_SLATE);
        continue;
      }
      const dCourt = courtDist(x, z);
      if (dCourt <= COURT_R) {
        const wet = distToSea(x, z);                  // tide ring on the sea wall
        put(x, 0, z, wet <= 1.5 ? C_SLATE : C_SAND);
        const gap = dCourt > PLINTH_R + 0.5 && wet > 1.5 && hashCell(x, z, 15) < COURT_GAP;
        if (gap) {
          put(x, 1, z, hashCell(x, z, 16) < 0.5 ? C_SAGE : C_OLIVE);
        } else {
          put(x, 1, z, wet <= 1.5
            ? (hashCell(x, z, 76) < 0.6 ? C_OLIVE : C_SLATE)
            : C_SAND);
          let c;
          const az = courtAz(x, z);
          if (dCourt > COURT_R - 1.2 && az > NE_AZ0 && az < NE_AZ1 && hashCell(x, z, 17) < 0.45) {
            c = hashCell(x, z, 18) < 0.55 ? C_PLUM : C_TWILIGHT;  // shaded NE rim
          } else if (hashCell(x, z, 19) < COURT_MOSS) {
            c = C_SAGE;
          } else {
            c = hashCell(x, z, 20) < whiteOdds(x, z) ? C_WHITE : C_SAND;
          }
          put(x, 2, z, c);
        }
        continue;
      }
      if (dCourt <= APRON_R) {
        put(x, 0, z, C_SAND);
        const wet = distToSea(x, z);
        put(x, 1, z, wet <= 1.5 ? C_SLATE
          : hashCell(x, z, 21) < 0.25 ? C_OLIVE
          : hashCell(x, z, 22) < whiteOdds(x, z) ? C_WHITE : C_SAND);
        continue;
      }
      // the tidal flat: weathered paving with hash-dithered missing tiles
      const nearSpawn = Math.hypot(x + 0.5 - DOCK_SPAWN.x, z + 0.5 - DOCK_SPAWN.z) < SPAWN_SOLID_R;
      const wet = distToSea(x, z);
      const gap = !nearSpawn && wet > 1.5 && hashCell(x, z, 23) < FLAT_GAP;
      if (gap) {
        put(x, 0, z, hashCell(x, z, 16) < 0.5 ? C_SAGE : C_OLIVE);
      } else {
        put(x, 0, z, C_SAND);
        put(x, 1, z, tileColor(x, z, 24));
      }
    }
  }

  // causeway overlay: a warm, tide-stained deck — the leading line stays light
  for (const key of causeway) {
    const [x, z] = key.split(',').map(Number);
    if (!inIsland(x, z) || courtDist(x, z) <= COURT_R) continue;
    put(x, 0, z, C_SAND);
    put(x, 1, z, hashCell(x, z, 25) < CAUSE_OLIVE ? C_OLIVE
      : hashCell(x, z, 26) < whiteOdds(x, z) ? C_WHITE : C_SAND);
  }

  // ── the dome plinth: interior floor with a teal mosaic + glow tiles ───────
  for (let x = COURT.x - 9; x <= COURT.x + 9; x++) {
    for (let z = COURT.z - 9; z <= COURT.z + 9; z++) {
      const d = courtDist(x, z);
      if (d > PLINTH_R) continue;
      let c;
      if (d < MOSAIC_R0) c = C_WHITE;
      else if (d < MOSAIC_R1) c = hashCell(x, z, 27) < 0.65 ? C_TEAL : C_WHITE;
      else c = hashCell(x, z, 28) < 0.45 ? C_WHITE : C_SAND;
      put(x, 3, z, c);
    }
  }
  for (const [gx, gz] of FLOOR_GLOW_CELLS) put(gx, 3, gz, C_GLOW);

  // ── the drum: Cloud White rotunda, door to the avenue, sunlit Honey patch ─
  for (let x = COURT.x - 9; x <= COURT.x + 9; x++) {
    for (let z = COURT.z - 9; z <= COURT.z + 9; z++) {
      const d = courtDist(x, z);
      if (d <= DRUM_R0 || d > DRUM_R1) continue;
      const az = courtAz(x, z);
      const door = Math.abs(angSub(az, AZ_BREACH)) < DOOR_HALF;
      for (let y = DRUM_Y0; y <= DRUM_Y1; y++) {
        if (door && y <= DOOR_Y1) continue;
        // the collapse crack widening above the lintel
        const half = BREACH_HALF_MAX *
          Math.pow(Math.max(0, Math.min(1, (y - BREACH_Y0) / (BREACH_YTOP - BREACH_Y0))), 0.8);
        const diff = angSub(az, AZ_BREACH);
        if (y >= BREACH_Y0 + 1 &&
            Math.abs(diff) < half + (hashCell(x, z, 29 + y) - 0.5) * BREACH_RAGGED) continue;
        let c;
        if (d <= PATCH_D_IN && az > PATCH_AZ0 && az < PATCH_AZ1 &&
            y >= PATCH_Y0 && y <= PATCH_Y1) {
          c = C_HONEY;                       // the breach-light on the far wall
        } else if (y === DRUM_Y0 && hashCell(x, z, 30) < DRUM_BASE_STAIN) {
          c = hashCell(x, z, 31) < STAIN_OLIVE ? C_OLIVE : C_SAGE;
        } else {
          const ne = az > NE_AZ0 && az < NE_AZ1 && d > PATCH_D_IN;
          if (ne && hashCell(x, z, 32 + y) < 0.3) c = C_PLUM;
          else c = hashCell(x, z, 33 + y) < DRUM_WHITE ? C_WHITE : C_SAND;
        }
        put(x, y, z, c);
      }
    }
  }
  for (const [gx, gz, gy] of PATCH_GLOW_CELLS) {
    const d = courtDist(gx, gz);
    if (d > DRUM_R0 && d <= DRUM_R1) put(gx, gy, gz, C_GLOW);
  }

  // ── the dome shell: verdigris teal, breached toward the dock ──────────────
  for (let y = SHELL_Y0; y <= SHELL_Y1; y++) {
    const rr = Math.sqrt(DOME_R * DOME_R - Math.pow(y - SHELL_Y0 + 0.5, 2));
    const reach = Math.ceil(rr + SHELL_OUT) + 1;
    for (let x = COURT.x - reach; x <= COURT.x + reach; x++) {
      for (let z = COURT.z - reach; z <= COURT.z + reach; z++) {
        const d = courtDist(x, z);
        const apex = y >= SHELL_Y1 - 1 && rr <= SHELL_T + 1.8;
        if (d > rr + SHELL_OUT) continue;
        if (!apex && d <= rr - SHELL_T) continue;
        const az = courtAz(x, z);
        const half = BREACH_HALF_MAX *
          Math.pow(Math.max(0, Math.min(1, (y - BREACH_Y0) / (BREACH_YTOP - BREACH_Y0))), 0.8);
        const diff = angSub(az, AZ_BREACH);
        const edge = half + (hashCell(x, z, 34 + y) - 0.5) * BREACH_RAGGED;
        if (Math.abs(diff) < edge) continue;          // the wound
        let c = C_TEAL;
        if (Math.abs(diff) < edge + RIM_BAND) {
          // broken edge: fresh white marble, honey-lit on the sun side
          if (diff < 0 && hashCell(x, z, 35 + y) < RIM_HONEY) c = C_HONEY;
          else if (hashCell(x, z, 36 + y) < RIM_WHITE) c = C_WHITE;
        } else if (hashCell(x, z, 37 + y) < SHELL_SAGE) {
          c = C_SAGE;
        } else if (hashCell(x, z, 38 + y) < SHELL_WHITE) {
          c = C_WHITE;
        }
        put(x, y, z, c);
      }
    }
  }

  // ── the columns ───────────────────────────────────────────────────────────
  const baseRow = (x, z) => {
    if (inLagoonRaw(x, z)) return 1;                  // standing in the water
    if (courtDist(x, z) <= COURT_R) return 3;         // on the court
    return 2;                                         // on the tidal flat
  };
  const shaftColor = (x, z, y, base) => {
    if (y === 1) return hashCell(x, z, 39) < STAIN_OLIVE ? C_OLIVE : C_SAGE;
    if (y === base && base === 2 && hashCell(x, z, 40) < 0.5) return C_SAGE;
    return hashCell(x, z, 41 + y) < whiteOdds(x, z) ? C_WHITE : C_SAND;
  };
  for (const [cx, cz, rows, capped, ragged] of COLS) {
    const base = baseRow(cx, cz);
    const top = base + rows - 1;
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const x = cx + dx, z = cz + dz;
        for (let y = base; y <= top; y++) {
          if (ragged && y === top && hashCell(x, z, 42 + y) > RAG_TOP) continue;
          if (ragged && y === top - 1 && hashCell(x, z, 43 + y) > RAG_UNDER) continue;
          put(x, y, z, shaftColor(x, z, y, base));
        }
      }
    }
    if (capped) {
      const hx = hashCell(cx, cz, 44) < 0.5 ? 0 : 1;  // 3×3 capital, offset corner
      const hz = hashCell(cx, cz, 45) < 0.5 ? 0 : 1;
      for (let dx = 0; dx < 3; dx++) {
        for (let dz = 0; dz < 3; dz++) {
          const x = cx - 1 + hx + dx, z = cz - 1 + hz + dz;
          put(x, top + 1, z, hashCell(x, z, 46) < CAP_WHITE ? C_WHITE : C_SAND);
        }
      }
    }
  }
  for (const [sx, sz, rows] of STUMPS) {
    const base = baseRow(sx, sz);
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const x = sx + dx, z = sz + dz;
        for (let y = base; y < base + rows; y++) {
          if (y === base + rows - 1 && hashCell(x, z, 47) > 0.7) continue;
          put(x, y, z, shaftColor(x, z, y, base));
        }
      }
    }
  }
  // the ghost peristyle: pedestal stubs, some drowned, some carrying one drum
  for (const [px, pz] of PEDESTALS) {
    const base = baseRow(px, pz);
    const tall = hashCell(px, pz, 71) < 0.35 ? 2 : 1;
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const x = px + dx, z = pz + dz;
        for (let y = base; y < base + tall; y++) {
          if (tall === 2 && y === base + 1 && hashCell(x, z, 72) > 0.75) continue;
          put(x, y, z, shaftColor(x, z, y, base));
        }
      }
    }
  }
  for (const d of TOPPLED) {
    for (let x = d.x0; x <= d.x1; x++) {
      for (let z = d.z0; z <= d.z1; z++) {
        put(x, d.y - 1, z, C_SAND);                   // solid footing, never a gap
        put(x, d.y, z, hashCell(x, z, 48) < 0.3 ? C_OLIVE
          : hashCell(x, z, 49) < 0.4 ? C_WHITE : C_SAND);
      }
    }
  }

  // ── propylon, cella, arcade, seawall ──────────────────────────────────────
  for (const p of [PYLON_A, PYLON_B]) {
    const base = baseRow(p.x, p.z);
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const x = p.x + dx, z = p.z + dz;
        for (let y = base; y < base + p.rows; y++) {
          if (y === base + p.rows - 1 && hashCell(x, z, 50) > 0.75) continue;
          if (y === 1) put(x, y, z, hashCell(x, z, 54) < STAIN_OLIVE ? C_OLIVE : C_SAGE);
          else put(x, y, z, hashCell(x, z, 51 + y) < 0.18 ? C_WHITE : C_SAND);
        }
      }
    }
  }
  const stubY = baseRow(PYLON_A.x, PYLON_A.z) + PYLON_A.rows - 1;
  for (const [x, z] of PYLON_STUB) put(x, stubY, z, C_SAND);

  for (let x = CELLA.x0; x <= CELLA.x1; x++) {
    for (let z = CELLA.z0; z <= CELLA.z1; z++) {
      const wall = x === CELLA.x0 || x === CELLA.x1 || z === CELLA.z0 || z === CELLA.z1;
      if (!wall) continue;
      let door = false;
      for (const [dx2, dz2] of CELLA_DOOR) if (dx2 === x && dz2 === z) door = true;
      const keepMid = hashCell(x, z, 53) <= CELLA_KEEP_MID;
      for (let y = 1; y < 1 + CELLA.rows; y++) {
        if (door && y <= 3) continue;
        if (y === CELLA.rows && (!keepMid || hashCell(x, z, 52) > CELLA_KEEP_HI)) continue;
        if (y === CELLA.rows - 1 && !keepMid) continue;
        if (y === 1) put(x, y, z, hashCell(x, z, 54) < STAIN_OLIVE ? C_OLIVE : C_SAGE);
        else put(x, y, z, hashCell(x, z, 55 + y) < 0.25 ? C_WHITE : C_SAND);
      }
    }
  }

  for (const px of ARCADE_PIERS) {
    for (let z = ARCADE_Z; z <= ARCADE_Z + 1; z++) {
      for (let y = 1; y <= ARCADE_TOP; y++) {
        put(px, y, z, y === 1
          ? (hashCell(px, z, 56) < STAIN_OLIVE ? C_OLIVE : C_SAGE)
          : (hashCell(px, z, 57 + y) < 0.3 ? C_WHITE : C_SAND));
      }
    }
  }
  for (const [x0, x1] of ARCADE_LINTELS) {
    for (let x = x0; x <= x1; x++) put(x, ARCADE_TOP + 1, ARCADE_Z, C_SAND);
  }

  for (let x = -27; x <= 26; x++) {
    for (let z = -27; z <= 26; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r < SEAWALL_R0 || r > SEAWALL_R1 || !inIsland(x, z)) continue;
      const az = Math.atan2(z + 0.5, x + 0.5);
      let inArc = false;
      for (const [a0, a1] of SEAWALL_ARCS) if (az >= a0 && az <= a1) inArc = true;
      if (!inArc || hashCell(x, z, 58) > SEAWALL_KEEP) continue;
      const h = 1 + (hashCell(x, z, 59) < 0.3 ? 1 : 0) + (hashCell(x, z, 60) < 0.08 ? 1 : 0);
      for (let y = 2; y < 2 + h; y++) {
        const shaded = az > NE_AZ0 && az < NE_AZ1 && hashCell(x, z, 61 + y) < NE_SHADE;
        put(x, y, z, shaded ? C_PLUM : hashCell(x, z, 62 + y) < 0.2 ? C_SLATE : C_SAND);
      }
    }
  }

  // ── rubble fields and the frozen collapse ─────────────────────────────────
  for (const [rx, rz, rr, density] of RUBBLE) {
    for (let x = Math.floor(rx - rr); x <= Math.ceil(rx + rr); x++) {
      for (let z = Math.floor(rz - rr); z <= Math.ceil(rz + rr); z++) {
        if (Math.hypot(x + 0.5 - rx, z + 0.5 - rz) > rr) continue;
        if (hashCell(x, z, 63) > density) continue;
        if (!inIsland(x, z) || inSea(x, z) || causeway.has(ck(x, z))) continue;
        if (courtDist(x, z) <= PLINTH_R + 0.5) continue;   // keep the dome floor clear
        const y = courtDist(x, z) <= COURT_R ? 3 : 2;
        if (!cells.has(x + ',' + (y - 1) + ',' + z)) continue;   // only on tiles
        put(x, y, z, hashCell(x, z, 64) < 0.35 ? C_SLATE : C_SAND);
      }
    }
  }
  for (const [x, y, z, c] of DEBRIS) put(x, y, z, c);

  // altar: a small white table under the shafts (the glow gem is decor)
  for (let dx = 0; dx < 2; dx++) {
    for (let dz = 0; dz < 2; dz++) put(ALTAR.x + dx, ALTAR.y, ALTAR.z + dz, C_WHITE);
  }

  await kit.setBlocksPaced(world, [...cells.values()].map(([x, y, z, c]) => [x + ox, y, z + oz, c]));

  // ── water: the one sea surface (foam on every shore via isLand) ───────────
  let sMinX = Infinity, sMaxX = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity;
  for (let x = -27; x <= 26; x++) {
    for (let z = -27; z <= 26; z++) {
      if (!inSea(x, z)) continue;
      sMinX = Math.min(sMinX, x); sMaxX = Math.max(sMaxX, x);
      sMinZ = Math.min(sMinZ, z); sMaxZ = Math.max(sMaxZ, z);
    }
  }
  const sea = water.makeSurface({
    width: sMaxX - sMinX + 1,
    depth: sMaxZ - sMinZ + 1,
    level: SEA_LEVEL,
    origin: { x: ox + (sMinX + sMaxX + 1) / 2, z: oz + (sMinZ + sMaxZ + 1) / 2 },
    isLand: (x, z) => !inSea(x - ox, z - oz),
  });
  group.add(sea);

  group.add(water.makeMist({
    position: new THREE.Vector3(ox + MIST_BREACH.x, MIST_BREACH.y, oz + MIST_BREACH.z),
    radius: MIST_BREACH.radius,
    count: MIST_BREACH.count,
  }));
  group.add(water.makeMist({
    position: new THREE.Vector3(ox + MIST_BAY.x, MIST_BAY.y, oz + MIST_BAY.z),
    radius: MIST_BAY.radius,
    count: MIST_BAY.count,
  }));

  // ── decor: pier, quay, capitals' abaci, litter, tufts (one mesh) ──────────
  const decor = kit.decor;
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(PIER_DARK);
  const sandstone = color(C_SAND);
  const white = color(C_WHITE);
  const slate = color(C_SLATE);
  const olive = color(C_OLIVE);
  const sage = color(C_SAGE);

  // pier deck planks + stilts down past the rim + mooring posts
  const plankD = PIER_Z1 - PIER_Z0;
  for (let i = 0; ; i++) {
    const px = PIER_X0 + i * PIER_PLANK;
    if (px + PIER_PLANK * 0.9 > PIER_X1 + 0.01) break;
    decor.box(ox + px, PIER_DECK_Y, oz + PIER_Z0, PIER_PLANK * 0.9, PIER_DECK_H, plankD,
      i % 2 ? cocoaDark : cocoa);
  }
  for (const px of [PIER_X0 + 0.4, PIER_X1 - 0.6]) {
    for (const pz of [PIER_Z0 + 0.15, PIER_Z1 - 0.37]) {
      decor.box(ox + px, PIER_POST_DEPTH, oz + pz, PIER_POST, PIER_DECK_Y - PIER_POST_DEPTH, PIER_POST, cocoaDark);
    }
  }
  for (const [mx, mz] of MOORING) {
    decor.box(ox + mx, PIER_DECK_Y, oz + mz, 0.2, 0.85, 0.2, cocoa);
    decor.box(ox + mx - 0.05, PIER_DECK_Y + 0.85, oz + mz - 0.05, 0.3, 0.08, 0.3, cocoaDark);
  }
  // quay bollards along the drowned west edge
  for (const [bx, bz] of BOLLARDS) {
    decor.box(ox + bx, 2, oz + bz, 0.3, 0.5, 0.3, slate);
    decor.box(ox + bx - 0.05, 2.5, oz + bz - 0.05, 0.4, 0.1, 0.4, slate);
  }
  // abacus slabs floating a hair over each intact capital
  for (const [cx, cz, rows, capped] of COLS) {
    if (!capped) continue;
    const base = baseRow(cx, cz);
    decor.box(ox + cx + 1 - 1.6, base + rows + 1, oz + cz + 1 - 1.6, 3.2, 0.22, 3.2,
      hashCell(cx, cz, 65) < CAP_WHITE ? white : sandstone);
  }
  // collar rings on the toppled drums
  for (const d of TOPPLED) {
    const w = d.x1 - d.x0 + 1, dp = d.z1 - d.z0 + 1;
    if (w >= dp) {
      decor.box(ox + d.x0 + w * 0.3, d.y + 1, oz + d.z0 - 0.06, 0.14, 0.08, dp + 0.12, sandstone);
      decor.box(ox + d.x0 + w * 0.72, d.y + 1, oz + d.z0 - 0.06, 0.14, 0.08, dp + 0.12, white);
    } else {
      decor.box(ox + d.x0 - 0.06, d.y + 1, oz + d.z0 + dp * 0.3, w + 0.12, 0.08, 0.14, sandstone);
      decor.box(ox + d.x0 - 0.06, d.y + 1, oz + d.z0 + dp * 0.72, w + 0.12, 0.08, 0.14, white);
    }
  }
  // marble chips scattered near the avenue and the court
  for (const [lx, lz, lr, odds] of LITTER) {
    for (let x = Math.floor(lx - lr); x <= Math.ceil(lx + lr); x++) {
      for (let z = Math.floor(lz - lr); z <= Math.ceil(lz + lr); z++) {
        if (Math.hypot(x + 0.5 - lx, z + 0.5 - lz) > lr) continue;
        if (hashCell(x, z, 66) > odds) continue;
        if (!inIsland(x, z) || inSea(x, z)) continue;
        if (courtDist(x, z) <= PLINTH_R + 1) continue;     // not inside the dome
        const y = courtDist(x, z) <= COURT_R ? 3 : courtDist(x, z) <= APRON_R ? 2 : 2;
        if (!cells.has(x + ',' + (y - 1) + ',' + z)) continue;
        const j = (hashCell(x, z, 67) - 0.5) * 0.4;
        decor.box(ox + x + 0.25 + j, y, oz + z + 0.25 - j, 0.45, 0.07, 0.5,
          hashCell(x, z, 68) < 0.5 ? white : sandstone);
      }
    }
  }
  // algae tufts clinging at the waterline of the drowned columns
  for (const [cx, cz] of COLS) {
    if (!inLagoonRaw(cx, cz)) continue;
    decor.box(ox + cx - 0.12, SEA_LEVEL + 0.05, oz + cz + 0.3, 0.14, 0.3, 0.5,
      hashCell(cx, cz, 69) < 0.5 ? olive : sage);
    decor.box(ox + cx + 1.6, SEA_LEVEL + 0.02, oz + cz + 1.98, 0.5, 0.26, 0.14,
      hashCell(cx, cz, 70) < 0.5 ? sage : olive);
  }
  // algae fringe along the drowned quay edge
  for (const tz of QUAY_TUFTS) {
    decor.box(ox - 19.2, SEA_LEVEL + 0.03, oz + tz, 0.5, 0.28, 0.16,
      hashCell(0, Math.round(tz), 73) < 0.5 ? olive : sage);
  }
  // fallen abacus slabs beside the stumps
  for (const [fx, fy, fz] of FALLEN_SLABS) {
    decor.box(ox + fx, fy, oz + fz, 1.1, 0.22, 1.1, sandstone);
  }
  // slate pebbles ringing the twin tide pools
  for (const [px, pz] of POOL_PEBBLES) {
    decor.box(ox + px, 2, oz + pz, 0.28, 0.2, 0.24, slate);
  }
  // half-steps easing the court lip and the dome threshold on the avenue line
  decor.box(ox - 0.4, 2, oz + 2.2, 1.8, 0.5, 0.9, white);
  decor.box(ox + 4.3, 3, oz + 4.0, 1.6, 0.5, 0.8, white);

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  // ── glow jewels in the breach — the treasure the tide left behind ─────────
  const glow = new kit.GeoBuilder();
  const glowColor = color(C_GLOW);
  for (const [jx, jy, jz, s] of JEWELS) {
    glow.box(ox + jx, jy, oz + jz, s, s, s, glowColor);
  }
  glow.box(ox + ALTAR_GEM.x, ALTAR_GEM.y, oz + ALTAR_GEM.z, ALTAR_GEM.s, ALTAR_GEM.s, ALTAR_GEM.s, glowColor);
  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: JEWEL_EMISSIVE, emissiveIntensity: 0.6,
  }));
  glowMesh.castShadow = true;
  glowMesh.receiveShadow = true;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // ── honey light shafts: thin additive slabs aligned with the SW sun ───────
  const beams = new kit.GeoBuilder();
  const honey = color(C_HONEY);
  for (const b of BEAMS) {
    beams.box(-BEAM_LEN / 2, b.lift - BEAM_THICK / 2, b.off - b.w / 2,
      BEAM_LEN, BEAM_THICK, b.w, honey);
  }
  const beamMesh = new THREE.Mesh(beams.build(), kit.lambert('#000000', {
    emissive: BEAM_EMISSIVE,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: BEAM_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  beamMesh.position.set(ox + BEAM_MID.x, BEAM_MID.y, oz + BEAM_MID.z);
  beamMesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(BEAM_DIR.x, BEAM_DIR.y, BEAM_DIR.z).normalize()
  );
  beamMesh.updateMatrix();
  beamMesh.matrixAutoUpdate = false;
  group.add(beamMesh);

  // ── dock sign ─────────────────────────────────────────────────────────────
  const label = kit.makeLabelSprite('lowtide');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
