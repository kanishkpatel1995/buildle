// islands/astronomers.js — the astronomer's reach: the observatory peak.
//
// The TALLEST island in the archipelago (height:footprint ≈ 3:1, built to
// y = 31). It owns the COOL end of the palette: a Slate crag dithered with
// Ink crevices, Dusty Plum shadows below the snowline and Twilight Blue
// above it, Cloud White snow ONLY on the SW sun-facing ledges. A thin
// Sandstone zig-zag stair climbs the south silhouette, crossing TWO
// half-scale rope bridges — one out to a lone overlook spire, one over an
// Ink cleft gashed into the SW face. The apex carries the focal point: a
// Slate drum with an Olive Gold cornice, a Cocoa dome split by a pulsing
// Glow Lantern slit, and a brass-ringed telescope barrel cantilevered out
// over the void, aimed straight at the golden-hour sun. At the foot of the
// 30-block wall: a single 2-tall door — the archipelago's hardest scale cut.
//
// NO water on this island — it lives above the falls' world. The budget
// goes to rock strata dithering and the stair's shadow play instead.
//
// Hero angle: from the dock (south rim), the full 3:1 silhouette with the
// lit dome slit breaking the dome's western profile against the sky.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_WHITE = 0;       // Cloud White — snow, apex only
const C_SANDSTONE = 1;   // path-tint — the stair
const C_PLUM = 4;        // Dusty Plum — low shadow faces
const C_TWILIGHT = 5;    // Twilight Blue — high shadow faces
const C_OLIVE_GOLD = 8;  // brass
const C_COCOA = 12;      // the dome, woodwork
const C_SLATE = 13;      // the crag's body
const C_INK = 14;        // crevices, the cleft
const C_GLOW = 15;       // dome slit + the one window

// ── terrain: the crag ───────────────────────────────────────────────────────
// Stacked strata bands around CRAG: tall cliff bands alternating with ledge
// step-ins, a recessed neck under an overhanging cornice band, and a wide
// terrace slab cantilevered over the final neck — the sky-island overhang.
const CRAG_X = -2, CRAG_Z = -4;
const BANDS = [
  { y0: 0,  y1: 2,  r: 13.8, wob: 1.5 },
  { y0: 3,  y1: 5,  r: 11.4, wob: 1.3 },
  { y0: 6,  y1: 9,  r: 9.0,  wob: 1.1 },
  { y0: 10, y1: 11, r: 7.7,  wob: 1.0 },
  { y0: 12, y1: 15, r: 6.7,  wob: 0.9 },
  { y0: 16, y1: 17, r: 5.0,  wob: 0.7 },  // recessed neck — shadow groove
  { y0: 18, y1: 20, r: 5.6,  wob: 0.7 },  // overhanging cornice — the snow band
  { y0: 21, y1: 22, r: 3.2,  wob: 0.5 },
  { y0: 23, y1: 23, r: 4.4,  wob: 0.4 },  // terrace slab — overhangs the neck
];
const SUN_X = -0.880, SUN_Z = 0.475; // unit azimuth toward the SW sun (main.js rig)
const SNOWLINE = 19;                 // snow only where ledge tops sit at/above this
const SNOW_ODDS = 0.85, SNOW_DOT = 0.15;
const RIM_W = 1.7;                   // hue-shift band hugs each stratum's edge
const SHADE_ODDS = 0.5, SHADE_DOT = 0.3;   // NE faces: plum low, twilight high
const TWILIGHT_MIN_Y = 12;
const WARM_ODDS = 0.16, WARM_DOT = 0.35, WARM_MAX_Y = 10; // sun-kissed SW base rock
const CREVICE_ODDS = 0.5;            // ink seams where each band sits on the last
const FLECK_ODDS = 0.07;             // body strata dithering

// Footing: a ragged y=0 apron fading out from the base band, plus a talus ring.
const APRON_R = 16.0;
const TALUS_R0 = 14.6, TALUS_R1 = 17.2;
const TALUS_ODDS = 0.13, TALUS_TALL_ODDS = 0.3;
const PATH_CLEAR = 1.15;             // apron/talus keep off the dock path stones

// ── terrain: the cleft (the second bridge's gap) ────────────────────────────
// A vertical gash carved into the SW face: Ink walls, spanned at its top.
const CLEFT_TH0 = 120, CLEFT_TH1 = 140;   // azimuth window, degrees from CRAG
const CLEFT_Y0 = 6, CLEFT_Y1 = 15;
const CLEFT_DEPTH = 2.2;             // carve the outer shell this deep
const CLEFT_INK = 1.4;               // ink the wall band just behind the carve
const CLEFT_EDGE = 5;                // ink dither bleeds this far past the window

// ── terrain: the overlook spire, NW buttress, floating debris ───────────────
const SHOULDER_X = 10.5, SHOULDER_Z = 4.5;     // the lone overlook spire (SE)
const SHOULDER_BANDS = [
  { y0: 0, y1: 2, r: 5.0 },
  { y0: 3, y1: 5, r: 4.0 },
  { y0: 6, y1: 8, r: 3.0 },                    // summit floor at y = 9
];
const SHOULDER_WOB = 0.8;
const BUTTRESS_X = -9, BUTTRESS_Z = -10;       // sub-peak on the NW base
const BUTTRESS_BANDS = [
  { y0: 0, y1: 2, r: 4.2 },
  { y0: 3, y1: 4, r: 3.4 },
  { y0: 5, y1: 6, r: 2.6 },
];
const BUTTRESS_WOB = 0.9;
const DEBRIS = [                               // floating chunks — sky-island drift
  { x: -13, z: 2,  yTop: 12, r: 2.0, levels: 3, snow: false },
  { x: 8,   z: -13, yTop: 21, r: 1.6, levels: 2, snow: true },
  { x: -9,  z: 12, yTop: 6,  r: 1.3, levels: 2, snow: false },
  { x: -15, z: -8, yTop: 15, r: 1.0, levels: 1, snow: false },
];
const DEBRIS_TAPER = 0.3;            // each level down shrinks — wider tops

// ── landmark: the observatory (the focal point — light lives ONLY here) ─────
const DRUM_X = CRAG_X + 0.7, DRUM_Z = CRAG_Z + 0.5;  // slightly off the crag axis
const DRUM_R = 2.6, DRUM_Y0 = 24, DRUM_Y1 = 27;       // Slate drum on the terrace
const CORNICE_INNER = 1.55;          // Olive Gold brass ring on the drum's top rim
const WINDOW_TH = 75, WINDOW_HALF = 11, WINDOW_Y = 25; // the one Glow window (faces the dock)
const DOME_LAYERS = [                // Cocoa dome, stacked discs
  { y: 28, r: 2.6 },
  { y: 29, r: 2.15 },
  { y: 30, r: 1.65 },
  { y: 31, r: 0.95 },
];
const DOME_RIM = 1.1;                // slit paints this deep into each layer's rim
const SLIT_TH = 151.6, SLIT_HALF = 16; // dome slit at the sun's azimuth — off-axis

// The telescope: a voxel-stepped barrel marching along the true sun vector,
// Cocoa with Olive Gold rings, eyepiece jewel glowing at the slit's foot.
const SUN_DIR = { x: -0.825, y: 0.347, z: 0.446 };   // normalize(-50, 21, 27)
const BARREL_SEGS = 7, BARREL_STEP = 0.95;
const BARREL_BASE_T = 1.4;           // first segment sits just inside the dome
const BARREL_W0 = 1.5, BARREL_TAPER = 0.055;
const BARREL_Y = 28.3;               // barrel pivot height
const RING_SEGS = [2, 5];            // brass collars at these segments
const RING_PAD = 0.26, RING_LEN = 0.34;
const EYEPIECE_T = 2.95, EYEPIECE_Y = 28.45, EYEPIECE_S = 0.42;

// ── details: the stair, the bridges, the door ───────────────────────────────
// Three flights zig-zag the south face: E, then W, then E again under the
// cornice. Treads ride just proud of each band's nominal radius; flat
// connector stones bridge the band step-ins, and the carve set keeps three
// blocks of headroom above every tread.
const TREAD_OUT = 0.55;              // treads sit this far proud of the face
const TREAD_ARC = 1.02;              // arc length between treads, in cells
const TREAD_NUDGE = 2;               // degrees stepped when a cell is taken
const HEADROOM = 3;
const FLIGHTS = [
  { y0: 0,  y1: 8,  th0: 110, dir: -1 },   // up-east from the base
  { y0: 9,  y1: 15, th0: 70,  dir: 1 },    // switchback up-west
  { y0: 16, y1: 23, th0: 145, dir: -1 },   // under the cornice, east to the terrace
];
// Half-scale rope rail on the first flight (nearest the viewer's scale read).
const RAIL_EVERY = 3, RAIL_OUT = 0.45;
const RAIL_POST_W = 0.12, RAIL_POST_H = 0.62, RAIL_SAG = 0.12;
// Rope bridge kit (both bridges share it).
const BRIDGE_POST_W = 0.15, BRIDGE_POST_H = 0.8, BRIDGE_HALF_W = 0.36;
const PLANK_STEP = 0.5, PLANK_W = 0.66, PLANK_T = 0.07;
const DECK_SAG = 0.3, ROPE_SAG = 0.42, ROPE_RISE = 0.52;
const ROPE_BEAD = 0.08, ROPE_STEP = 0.42;
const SHOULDER_ANCHOR_IN = 0.45;     // bridge B lands this far inside the summit rim

// The tiny door: a 2-tall niche at the foot of the 30-block wall.
const DOOR_X = -2, DOOR_Z = 9;                 // carved niche cells (y 0..1)
const DOOR_CLEAR = { x0: -3, x1: -1, z0: 10, z1: 11, y1: 2 }; // approach kept open
const DOOR_SURROUND = [                        // forced Slate jambs + back wall —
  [-3, 0, 9], [-3, 1, 9], [-3, 2, 9],          // wobble must never open the niche
  [-1, 0, 9], [-1, 1, 9], [-1, 2, 9],
  [-2, 2, 9],
  [-2, 0, 8], [-2, 1, 8], [-2, 2, 8],
];
const DOOR_PANEL = { x: -1.94, z: 9.52, w: 0.88, h: 1.9, t: 0.14 };
const DOOR_FRAME_W = 0.16, DOOR_FRAME_H = 2.05;
const DOOR_HANDLE = { x: -1.28, y: 0.95, z: 9.98, s: 0.1 };
const DOORSTEP = { x: -2.6, z: 10.05, w: 1.3, d: 0.85, h: 0.08 };

// The overlook cairn on the shoulder summit (mid-value stones only — no glow).
const CAIRN = [
  [10.0, 9.0,  4.0, 1.0,  0.5,  1.0],
  [10.15, 9.5, 4.15, 0.7, 0.4,  0.7],
  [10.3, 9.9,  4.3, 0.4,  0.32, 0.4],
];
const CAIRN_BEAD = [10.4, 10.22, 4.4, 0.2];

// ── water ───────────────────────────────────────────────────────────────────
// None. The astronomer's reach sits above the falls' world; the sky does the
// shimmering here. (Zero water draw calls, zero mist groups — by design.)

// ── dock & path ─────────────────────────────────────────────────────────────
const DOCK_SPAWN = { x: 4.5, z: 17.5 };  // local; on real ground inside the mask
const DOCK_X0 = 3.2, DOCK_X1 = 5.6;      // pier runs south off the rim
const DOCK_Z0 = 16.4, DOCK_Z1 = 21.2;
const DOCK_PLANK_GAP = 0.55, DOCK_PLANK_D = 0.5, DOCK_DECK_H = 0.13;
const DOCK_POST = 0.22, DOCK_POST_DEPTH = -2.0;
const FENCE_POST_W = 0.18, FENCE_POST_H = 0.6;
const FENCE_RAIL = 0.05, FENCE_RAIL_Y = [0.26, 0.46], FENCE_STEP = 1.45;
const PATH_STONES = [                    // dock → the door → the stair's foot
  [4.6, 15.9], [3.7, 14.6], [2.9, 13.3], [2.1, 12.1], [1.0, 11.3],
  [-0.3, 10.8], [-1.5, 10.4],            // …arrives at the door
  [-3.2, 10.6], [-4.8, 10.3], [-6.0, 10.0], // …spur west to the first tread
];
const STONE_W = 0.78, STONE_H = 0.07;
const LABEL_POS = { x: 4.4, y: 2.1, z: 18.6 };
const COCOA_DARK = 0.82;                 // alternating plank / rope shade factor

// ── deterministic helpers ───────────────────────────────────────────────────

const D2R = Math.PI / 180;

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

// Azimuth of (dx, dz) in degrees [0, 360): 0 = +x (east), 90 = +z (south).
function azimuthDeg(dx, dz) {
  const t = Math.atan2(dz, dx) / D2R;
  return t < 0 ? t + 360 : t;
}

function angDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function bandAt(y) {
  for (const b of BANDS) if (y >= b.y0 && y <= b.y1) return b;
  return BANDS[BANDS.length - 1];
}

// Hash salts — one family per generator so dithers never correlate.
const SALT_BAND = 40;     // + band index
const SALT_SHOULDER = 60; // + band index
const SALT_BUTTRESS = 70; // + band index
const SALT_APRON = 80;
const SALT_TALUS = 82;
const SALT_DEBRIS = 90;   // + chunk index * 4 + level
const SALT_DRUM = 110;
const SALT_DOME = 112;
const SALT_STONE = 120;

// The crag's shared paint: Ink seams at band bases, plum/twilight hue-shift
// on shaded NE rims (never just darker), warm Sandstone kisses on sunlit SW
// base rock, sparse strata flecks through the body. Pass y0 = -1 to skip the
// crevice seam (apron, talus, debris).
function rockColor(x, z, y, cx, cz, r, y0, salt) {
  const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
  const d = Math.hypot(dx, dz) || 1;
  const sw = (dx * SUN_X + dz * SUN_Z) / d;
  const rim = d > r - RIM_W;
  if (y === y0 && hashCell(x, z, salt) < CREVICE_ODDS) return C_INK;
  if (rim && -sw > SHADE_DOT && hashCell(x, z, salt + 1) < SHADE_ODDS) {
    return y >= TWILIGHT_MIN_Y ? C_TWILIGHT : C_PLUM;
  }
  if (rim && sw > WARM_DOT && y <= WARM_MAX_Y && hashCell(x, z, salt + 2) < WARM_ODDS) {
    return C_SANDSTONE;
  }
  if (hashCell(x + y * 7, z - y * 3, salt + 3) < FLECK_ODDS) {
    return y >= TWILIGHT_MIN_Y ? C_TWILIGHT : C_INK;
  }
  return C_SLATE;
}

// Cleft test: 0 = untouched, 1 = carved away, 2 = Ink shadow wall/edge.
function cleftAt(x, y, z) {
  if (y < CLEFT_Y0 || y > CLEFT_Y1) return 0;
  const dx = x + 0.5 - CRAG_X, dz = z + 0.5 - CRAG_Z;
  const th = azimuthDeg(dx, dz);
  const d = Math.hypot(dx, dz);
  const r = bandAt(y).r;
  const inWin = th >= CLEFT_TH0 && th <= CLEFT_TH1;
  if (inWin && d > r - CLEFT_DEPTH) return 1;
  if (inWin && d > r - CLEFT_DEPTH - CLEFT_INK) return 2;
  if (!inWin && th >= CLEFT_TH0 - CLEFT_EDGE && th <= CLEFT_TH1 + CLEFT_EDGE && d > r - RIM_W) {
    return 2;
  }
  return 0;
}

// Lay out the three flights: one tread per y, riding bandAt(y).r + TREAD_OUT,
// with flat connector stones wherever a band step-in opens a gap wider than
// one cell. Fully deterministic — pure trigonometry plus the band table.
function layoutStair() {
  const flights = [];
  const seen = new Set();
  for (const f of FLIGHTS) {
    const treads = [];
    let th = f.th0;
    let prev = null;
    for (let y = f.y0; y <= f.y1; y++) {
      const dist = bandAt(y).r + TREAD_OUT;
      let cx = Math.floor(CRAG_X + Math.cos(th * D2R) * dist);
      let cz = Math.floor(CRAG_Z + Math.sin(th * D2R) * dist);
      let guard = 0;
      while (seen.has(cx + ',' + cz) && guard < 12) {
        th += f.dir * TREAD_NUDGE;
        cx = Math.floor(CRAG_X + Math.cos(th * D2R) * dist);
        cz = Math.floor(CRAG_Z + Math.sin(th * D2R) * dist);
        guard++;
      }
      if (prev) {
        let px = prev.x, pz = prev.z, hops = 0;
        while ((Math.abs(cx - px) > 1 || Math.abs(cz - pz) > 1) && hops < 8) {
          px += Math.sign(cx - px);
          pz += Math.sign(cz - pz);
          if (px === cx && pz === cz) break;
          if (!seen.has(px + ',' + pz)) {
            treads.push({ x: px, z: pz, y: prev.y });
            seen.add(px + ',' + pz);
          }
          hops++;
        }
      }
      const cur = { x: cx, z: cz, y };
      treads.push(cur);
      seen.add(cx + ',' + cz);
      prev = cur;
      th += f.dir * (TREAD_ARC / dist) / D2R;
    }
    flights.push(treads);
  }
  return flights;
}

export async function build(kit) {
  const { THREE, PALETTE, group } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // ── stair layout first: the carve set shapes every terrain pass ──────────
  const flights = layoutStair();
  const allTreads = flights.flat();
  const carved = new Set();
  const ck = (x, y, z) => x + ',' + y + ',' + z;
  for (const t of allTreads) {
    for (let dy = 1; dy <= HEADROOM; dy++) carved.add(ck(t.x, t.y + dy, t.z));
  }
  for (let y = 0; y <= 1; y++) carved.add(ck(DOOR_X, y, DOOR_Z));      // the niche
  for (let x = DOOR_CLEAR.x0; x <= DOOR_CLEAR.x1; x++) {               // its approach
    for (let z = DOOR_CLEAR.z0; z <= DOOR_CLEAR.z1; z++) {
      for (let y = 0; y <= DOOR_CLEAR.y1; y++) carved.add(ck(x, y, z));
    }
  }

  const entries = [];
  const put = (x, y, z, c) => entries.push([x + ox, y, z + oz, c]);

  // ── terrain: strata bands (snow on SW ledge tops at the snowline only) ───
  for (let bi = 0; bi < BANDS.length; bi++) {
    const band = BANDS[bi];
    const salt = SALT_BAND + bi;
    forDisc(CRAG_X, CRAG_Z, band.r, band.wob, salt, (x, z) => {
      const dx = x + 0.5 - CRAG_X, dz = z + 0.5 - CRAG_Z;
      const d = Math.hypot(dx, dz) || 1;
      const sw = (dx * SUN_X + dz * SUN_Z) / d;
      let coveredAbove;
      if (bi + 1 < BANDS.length) {
        const nb = BANDS[bi + 1];
        coveredAbove = inDisc(x, z, CRAG_X, CRAG_Z, nb.r, nb.wob, SALT_BAND + bi + 1);
      } else {
        coveredAbove = Math.hypot(x + 0.5 - DRUM_X, z + 0.5 - DRUM_Z) <= DRUM_R + 0.2;
      }
      for (let y = band.y0; y <= band.y1; y++) {
        if (carved.has(ck(x, y, z))) continue;
        const cleft = cleftAt(x, y, z);
        if (cleft === 1) continue;
        let c;
        if (cleft === 2) {
          c = C_INK;
        } else if (
          y === band.y1 && !coveredAbove && y + 1 >= SNOWLINE &&
          sw > SNOW_DOT && hashCell(x, z, salt + 4) < SNOW_ODDS
        ) {
          c = C_WHITE;
        } else {
          // crevice seams belong to multi-row bands only — the 1-row terrace
          // slab is a walking floor and stays clean
          const seamY = band.y1 > band.y0 ? band.y0 : -1;
          c = rockColor(x, z, y, CRAG_X, CRAG_Z, band.r, seamY, salt);
        }
        put(x, y, z, c);
      }
    });
  }

  // ── terrain: apron footing + talus ring (kept off the path stones) ───────
  const nearPath = (x, z) => {
    for (const [px, pz] of PATH_STONES) {
      if (Math.hypot(x + 0.5 - px, z + 0.5 - pz) < PATH_CLEAR) return true;
    }
    return false;
  };
  forDisc(CRAG_X, CRAG_Z, APRON_R, 0, SALT_APRON, (x, z) => {
    if (inDisc(x, z, CRAG_X, CRAG_Z, BANDS[0].r, BANDS[0].wob, SALT_BAND)) return;
    if (!world.isGroundAt(x + ox, z + oz)) return;
    if (nearPath(x, z) || carved.has(ck(x, 0, z))) return;
    const d = Math.hypot(x + 0.5 - CRAG_X, z + 0.5 - CRAG_Z);
    const fade = 1 - (d - BANDS[0].r) / (APRON_R - BANDS[0].r);
    if (hashCell(x, z, SALT_APRON) > fade) return;
    put(x, 0, z, rockColor(x, z, 0, CRAG_X, CRAG_Z, d + RIM_W, -1, SALT_APRON));
  });
  forDisc(CRAG_X, CRAG_Z, TALUS_R1, 0, SALT_TALUS, (x, z) => {
    const d = Math.hypot(x + 0.5 - CRAG_X, z + 0.5 - CRAG_Z);
    if (d < TALUS_R0 || hashCell(x, z, SALT_TALUS) > TALUS_ODDS) return;
    if (!world.isGroundAt(x + ox, z + oz) || nearPath(x, z)) return;
    const c = rockColor(x, z, 0, CRAG_X, CRAG_Z, d + RIM_W, -1, SALT_TALUS + 1);
    put(x, 0, z, c);
    if (hashCell(x, z, SALT_TALUS + 2) < TALUS_TALL_ODDS) put(x, 1, z, c);
  });

  // ── terrain: the overlook spire and the NW buttress ───────────────────────
  for (let bi = 0; bi < SHOULDER_BANDS.length; bi++) {
    const band = SHOULDER_BANDS[bi];
    forDisc(SHOULDER_X, SHOULDER_Z, band.r, SHOULDER_WOB, SALT_SHOULDER + bi, (x, z) => {
      for (let y = band.y0; y <= band.y1; y++) {
        put(x, y, z, rockColor(x, z, y, SHOULDER_X, SHOULDER_Z, band.r, band.y0, SALT_SHOULDER + bi));
      }
    });
  }
  for (let bi = 0; bi < BUTTRESS_BANDS.length; bi++) {
    const band = BUTTRESS_BANDS[bi];
    forDisc(BUTTRESS_X, BUTTRESS_Z, band.r, BUTTRESS_WOB, SALT_BUTTRESS + bi, (x, z) => {
      for (let y = band.y0; y <= band.y1; y++) {
        put(x, y, z, rockColor(x, z, y, BUTTRESS_X, BUTTRESS_Z, band.r, band.y0, SALT_BUTTRESS + bi));
      }
    });
  }

  // ── terrain: floating debris chunks ───────────────────────────────────────
  for (let di = 0; di < DEBRIS.length; di++) {
    const chunk = DEBRIS[di];
    for (let li = 0; li < chunk.levels; li++) {
      const y = chunk.yTop - li;
      const r = chunk.r * (1 - DEBRIS_TAPER * li);
      const salt = SALT_DEBRIS + di * 4 + li;
      forDisc(chunk.x, chunk.z, r, 0.6, salt, (x, z) => {
        let c = rockColor(x, z, y, chunk.x, chunk.z, r, -1, salt);
        if (chunk.snow && li === 0) {
          const dx = x + 0.5 - chunk.x, dz = z + 0.5 - chunk.z;
          const d = Math.hypot(dx, dz) || 1;
          if ((dx * SUN_X + dz * SUN_Z) / d > 0 && hashCell(x, z, salt + 1) < 0.8) c = C_WHITE;
        }
        put(x, y, z, c);
      });
    }
  }

  // ── landmark: drum, dome, slit, window ────────────────────────────────────
  forDisc(DRUM_X, DRUM_Z, DRUM_R, 0, SALT_DRUM, (x, z) => {
    const dx = x + 0.5 - DRUM_X, dz = z + 0.5 - DRUM_Z;
    const d = Math.hypot(dx, dz);
    const th = azimuthDeg(dx, dz);
    for (let y = DRUM_Y0; y <= DRUM_Y1; y++) {
      let c = C_SLATE;
      if (y === DRUM_Y1 && d > CORNICE_INNER) {
        // brass cornice — the slit's light splits it where the dome opens
        c = angDiff(th, SLIT_TH) < SLIT_HALF ? C_GLOW : C_OLIVE_GOLD;
      }
      if (y === WINDOW_Y && d > DRUM_R - 1.2 && angDiff(th, WINDOW_TH) < WINDOW_HALF) {
        c = C_GLOW;                                                        // the one window
      }
      put(x, y, z, c);
    }
  });
  for (const layer of DOME_LAYERS) {
    forDisc(DRUM_X, DRUM_Z, layer.r, 0, SALT_DOME, (x, z) => {
      const dx = x + 0.5 - DRUM_X, dz = z + 0.5 - DRUM_Z;
      const d = Math.hypot(dx, dz);
      const th = azimuthDeg(dx, dz);
      let c = C_COCOA;
      if (d > layer.r - DOME_RIM && angDiff(th, SLIT_TH) < SLIT_HALF) c = C_GLOW; // the slit
      put(x, layer.y, z, c);
    });
  }

  // ── details: the door surround, then the stair (both overwrite the rock) ─
  for (const [x, y, z] of DOOR_SURROUND) put(x, y, z, C_SLATE);
  for (const t of allTreads) put(t.x, t.y, t.z, C_SANDSTONE);

  await kit.setBlocksPaced(world, entries);

  // ── decor: one vertex-colored mesh for every wooden/stone jewel ───────────
  const decor = kit.decor;
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(COCOA_DARK);
  const sandstone = color(C_SANDSTONE);
  const slate = color(C_SLATE);
  const olive = color(C_OLIVE_GOLD);
  const db = (x, y, z, sx, sy, sz, c) => decor.box(ox + x, y, oz + z, sx, sy, sz, c);

  // catenary rope: a run of tiny beads sagging between two points
  const ropeBetween = (ax, ay, az, bx, by, bz, sag, c) => {
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / ROPE_STEP));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t - sag * 4 * t * (1 - t);
      db(x - ROPE_BEAD / 2, y - ROPE_BEAD / 2, z - ROPE_BEAD / 2,
        ROPE_BEAD, ROPE_BEAD, ROPE_BEAD, c);
    }
  };

  // half-scale rope bridge: posts, sagging plank deck, two hand ropes
  const ropeBridge = (A, B) => {
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const px = -uz, pz = ux;
    for (const [end, s] of [[A, 1], [B, -1]]) {
      for (const side of [-1, 1]) {
        const bx = end.x + px * side * (BRIDGE_HALF_W + 0.1) + ux * s * 0.1;
        const bz = end.z + pz * side * (BRIDGE_HALF_W + 0.1) + uz * s * 0.1;
        db(bx - BRIDGE_POST_W / 2, end.y - 0.2, bz - BRIDGE_POST_W / 2,
          BRIDGE_POST_W, BRIDGE_POST_H, BRIDGE_POST_W, cocoa);
      }
    }
    const n = Math.max(3, Math.ceil(len / PLANK_STEP));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = A.x + dx * t, z = A.z + dz * t;
      const y = A.y + (B.y - A.y) * t - DECK_SAG * 4 * t * (1 - t) - PLANK_T;
      db(x - PLANK_W / 2, y, z - PLANK_W / 2, PLANK_W, PLANK_T, PLANK_W,
        i % 2 ? cocoaDark : cocoa);
    }
    for (const side of [-1, 1]) {
      ropeBetween(
        A.x + px * side * BRIDGE_HALF_W, A.y + ROPE_RISE, A.z + pz * side * BRIDGE_HALF_W,
        B.x + px * side * BRIDGE_HALF_W, B.y + ROPE_RISE, B.z + pz * side * BRIDGE_HALF_W,
        ROPE_SAG, cocoaDark
      );
    }
  };

  // bridge A — the overlook: junction landing east to the lone spire's summit
  const j1 = flights[0][flights[0].length - 1];
  const jx = j1.x + 0.5, jz = j1.z + 0.5, jy = j1.y + 1.02;
  const toJ = Math.hypot(jx - SHOULDER_X, jz - SHOULDER_Z);
  const topR = SHOULDER_BANDS[SHOULDER_BANDS.length - 1].r - SHOULDER_ANCHOR_IN;
  ropeBridge(
    { x: jx, y: jy, z: jz },
    {
      x: SHOULDER_X + ((jx - SHOULDER_X) / toJ) * topR,
      y: jy,
      z: SHOULDER_Z + ((jz - SHOULDER_Z) / toJ) * topR,
    }
  );
  // bridge B — over the cleft's mouth, where the last flight begins
  const b1a = flights[1][flights[1].length - 1];
  const b1b = flights[2][0];
  ropeBridge(
    { x: b1a.x + 0.5, y: b1a.y + 1.02, z: b1a.z + 0.5 },
    { x: b1b.x + 0.5, y: b1b.y + 1.02, z: b1b.z + 0.5 }
  );

  // rope rail along the first flight — sub-voxel posts, sagging line
  const railPosts = [];
  const f1 = flights[0];
  for (let i = 0; i < f1.length; i += RAIL_EVERY) {
    const t = f1[i];
    const dx = t.x + 0.5 - CRAG_X, dz = t.z + 0.5 - CRAG_Z;
    const d = Math.hypot(dx, dz) || 1;
    const x = t.x + 0.5 + (dx / d) * RAIL_OUT;
    const z = t.z + 0.5 + (dz / d) * RAIL_OUT;
    db(x - RAIL_POST_W / 2, t.y + 1, z - RAIL_POST_W / 2,
      RAIL_POST_W, RAIL_POST_H, RAIL_POST_W, cocoa);
    railPosts.push({ x, y: t.y + 1 + RAIL_POST_H - 0.06, z });
  }
  for (let i = 0; i + 1 < railPosts.length; i++) {
    const a = railPosts[i], b = railPosts[i + 1];
    ropeBetween(a.x, a.y, a.z, b.x, b.y, b.z, RAIL_SAG, cocoaDark);
  }

  // the tiny door — panel, frame, brass handle, sandstone doorstep
  db(DOOR_PANEL.x, 0, DOOR_PANEL.z, DOOR_PANEL.w, DOOR_PANEL.h, DOOR_PANEL.t, cocoa);
  db(DOOR_X - 0.12, 0, DOOR_Z + 0.86, DOOR_FRAME_W, DOOR_FRAME_H, DOOR_FRAME_W, cocoaDark);
  db(DOOR_X + 0.96, 0, DOOR_Z + 0.86, DOOR_FRAME_W, DOOR_FRAME_H, DOOR_FRAME_W, cocoaDark);
  db(DOOR_X - 0.12, DOOR_FRAME_H - 0.03, DOOR_Z + 0.86,
    1.24, DOOR_FRAME_W, DOOR_FRAME_W, cocoaDark);
  db(DOOR_HANDLE.x, DOOR_HANDLE.y, DOOR_HANDLE.z,
    DOOR_HANDLE.s, DOOR_HANDLE.s, DOOR_HANDLE.s, olive);
  db(DOORSTEP.x, 0, DOORSTEP.z, DOORSTEP.w, DOORSTEP.h, DOORSTEP.d, sandstone);

  // the overlook cairn
  for (const [x, y, z, sx, sy, sz] of CAIRN) db(x, y, z, sx, sy, sz, slate);
  db(CAIRN_BEAD[0], CAIRN_BEAD[1], CAIRN_BEAD[2],
    CAIRN_BEAD[3], CAIRN_BEAD[3], CAIRN_BEAD[3], olive);

  // the telescope barrel — stepped along the true sun vector, brass-ringed
  const sunUx = Math.cos(SLIT_TH * D2R), sunUz = Math.sin(SLIT_TH * D2R);
  const base = {
    x: DRUM_X + sunUx * BARREL_BASE_T,
    y: BARREL_Y,
    z: DRUM_Z + sunUz * BARREL_BASE_T,
  };
  for (let i = 0; i < BARREL_SEGS; i++) {
    const s = BARREL_W0 - i * BARREL_TAPER;
    const x = base.x + SUN_DIR.x * BARREL_STEP * i;
    const y = base.y + SUN_DIR.y * BARREL_STEP * i;
    const z = base.z + SUN_DIR.z * BARREL_STEP * i;
    db(x - s / 2, y - s / 2, z - s / 2, s, s, s, cocoa);
    if (RING_SEGS.includes(i) || i === BARREL_SEGS - 1) {
      const rs = s + RING_PAD;
      db(x - rs / 2, y - rs / 2, z - rs / 2, rs, RING_LEN, rs, olive);
    }
  }

  // ── dock: pier, stilts, fences, path stones ───────────────────────────────
  for (let i = 0; ; i++) {
    const pz = DOCK_Z0 + i * DOCK_PLANK_GAP;
    if (pz + DOCK_PLANK_D > DOCK_Z1 + 0.01) break;
    db(DOCK_X0, 0.02, pz, DOCK_X1 - DOCK_X0, DOCK_DECK_H, DOCK_PLANK_D,
      i % 2 ? cocoaDark : cocoa);
  }
  for (const px of [DOCK_X0 + 0.2, DOCK_X1 - 0.42]) {
    for (const pz of [DOCK_Z0 + 0.2, DOCK_Z1 - 0.5]) {
      db(px, DOCK_POST_DEPTH, pz, DOCK_POST, -DOCK_POST_DEPTH + 0.02, DOCK_POST, cocoaDark);
    }
  }
  const fenceRun = (x, z0, z1) => {
    let lastZ = z0;
    for (let z = z0; z <= z1 + 0.01; z += FENCE_STEP) {
      db(x, 0.14, z, FENCE_POST_W, FENCE_POST_H, FENCE_POST_W, cocoa);
      lastZ = z;
    }
    for (const ry of FENCE_RAIL_Y) {
      db(x + (FENCE_POST_W - FENCE_RAIL) / 2, 0.14 + ry, z0 + FENCE_POST_W,
        FENCE_RAIL, FENCE_RAIL, lastZ - z0 - FENCE_POST_W, cocoaDark);
    }
  };
  fenceRun(DOCK_X0 - 0.04, DOCK_Z0 + 0.2, DOCK_Z1 - 0.4);
  fenceRun(DOCK_X1 - FENCE_POST_W + 0.04, DOCK_Z0 + 0.2, DOCK_Z1 - 0.4);
  for (const [sx, sz] of PATH_STONES) {
    const jitter = (hashCell(Math.round(sx * 4), Math.round(sz * 4), SALT_STONE) - 0.5) * 0.16;
    db(sx - STONE_W / 2 + jitter, 0, sz - STONE_W / 2 - jitter,
      STONE_W, STONE_H, STONE_W, sandstone);
  }

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  // the eyepiece jewel at the slit's foot — emissive, the astronomer's spark
  const glow = new kit.GeoBuilder();
  glow.box(
    ox + DRUM_X + sunUx * EYEPIECE_T - EYEPIECE_S / 2, EYEPIECE_Y,
    oz + DRUM_Z + sunUz * EYEPIECE_T - EYEPIECE_S / 2,
    EYEPIECE_S, EYEPIECE_S, EYEPIECE_S, color(C_GLOW)
  );
  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: '#FFE8A8', emissiveIntensity: 0.55,
  }));
  glowMesh.castShadow = true;
  glowMesh.receiveShadow = true;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // ── dock sign ─────────────────────────────────────────────────────────────
  const label = kit.makeLabelSprite("the astronomer's reach");
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
