// islands/foundry.js — the foundry: "speak, and it is built".
//
// Composition: a serene round dais — the calm STAGE, never the spectacle. The
// spectacle is the build that materializes on the empty plinth at its heart
// (the build animator in foundry.js writes a separate World there). So this
// island is composed entirely to frame that empty center: a raised ring of
// Sandstone/Cloud White flagstone with a Slate rim, a low clear build plinth
// at local origin, a Cocoa + Olive-Gold brass lectern at the dock end with a
// pulsing Glow Lantern, and a ring of eight slender Glow-topped Cocoa posts —
// the summoning ring, the ONLY bright accents — encircling the void. Dusty
// Plum / Twilight shadow dithering falls on the NE faces; a few floating
// flagstone debris chunks drift below the rim.
//
// Hue band owned: warm Sandstone stage, pricked with Glow Lantern at the ring.
// Lightest values (Cloud White / Glow) live at the plinth lip and the lantern
// crowns only — the eye is pulled to the empty center, where the build appears.
//
// Hero angle: the dock, just behind the lectern (south, +z), looking across
// the lectern's lantern to the empty plinth (north, -z) — a rising build there
// is the focal payoff.

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_WHITE = 0;
const C_SANDSTONE = 1;
const C_DUSTY_PLUM = 4;
const C_TWILIGHT = 5;
const C_OLIVE = 8;
const C_COCOA = 12;
const C_SLATE = 13;
const C_GLOW = 15;

// The build anchor the controller reads — the plinth center; builds center
// here. Matches the registry origin so the dais ground and the builds World
// share a center (see foundry.js §2).
export const FOUNDRY_BUILD_ORIGIN = { x: 150, z: 30 };

// ── the dais — a tiered round stage framing a recessed central court ────────
// World cells must sit at y ≥ 0 (world.js _inBoundsLocal), so the dais reads as
// raised the way every island does: a solid flagstone mass from y=0 up, with
// the World's own earth skirt + underside rock hanging beneath it. The CENTER
// is a recessed court at the y=0 ground plane (kept clear of world blocks) so a
// summoned build rises from flush ground; concentric raised tiers step UP and
// OUTWARD around it — an amphitheater that frames the empty center, and the
// dock-side stand sits a step above the court so the hero vista looks down onto
// the rising build.
const STAGE = { cx: 0, cz: 0, r: 15.4, wobble: 0.6 };  // local center == origin
const COURT_R = 9.6;                   // recessed build court — y=0, NO world blocks
const TIER_STEP = 1.6;                 // cells of radius per one-block rise (gentle ramp)
const TIER_MAX_H = 2;                  // low open rim — the camera clears it to frame the build
const RIM_W = 1.5;                     // slate rim within this of the edge
const RIM_RING_R = STAGE.r - RIM_W;
const FLAG_WHITE_DITHER = 0.15;        // pale flagstones scattered through sandstone
const TIER_BREAK = 0.14;               // odds a tier edge gains an extra block (organic)
const SHADE_DITHER = 0.42;             // plum/twilight hue-shift odds on the NE rim
const SHADE_RIM = 2.6;                 // …within this many cells of the stage edge
// Sun comes from the SW (main.js): the NE quadrant (+x, -z) is the shadow side.
const SHADE_DX = 0, SHADE_DZ = 0;

// ── the empty build court — kept clear of world blocks; pale stone underfoot ─
// The build animator's World writes build-local y 0..23 straight to global y,
// so the court footprint must hold NO world blocks (forcePlace skips occupied
// cells). A thin sub-voxel slab + a brighter raised lip ring read as a stage
// without blocking the rising build.
const PLINTH_SLAB = { r: COURT_R - 1.4, y: -0.14, h: 0.14 };   // pale floor disc
const PLINTH_LIP = { r: COURT_R - 0.6, h: 0.26, w: 0.5 };      // bright lip ring
const PLINTH_LIP_STEP = 0.3;           // angular spacing of lip segments (rad)

// ── the lectern — Cocoa + Olive-Gold brass, at the dock end (south) ─────────
const LECTERN = { x: 0, z: 9.6 };      // local; between the dock and the plinth
const LECTERN_BASE_W = 1.05, LECTERN_BASE_H = 0.34;
const LECTERN_COL_W = 0.42, LECTERN_COL_H = 0.95;
const LECTERN_TOP_W = 1.15, LECTERN_TOP_D = 0.7, LECTERN_TOP_H = 0.14;
const LECTERN_TILT = 0.32;             // reading-slope tilt of the top (rad)
const LECTERN_BRASS_H = 0.06;          // olive-gold trim bands
const LANTERN_HEAD = 0.34;             // glow lantern docked on the lectern
const LANTERN_Y = LECTERN_BASE_H + LECTERN_COL_H + 0.46;
const LANTERN_ARM_W = 0.12, LANTERN_ARM_H = 0.5;

// ── the summoning ring — eight slender Glow-topped Cocoa posts ──────────────
const RING_COUNT = 8;
const RING_R = 10.4;                   // posts sit just inside the rim, framing center
const POST_W = 0.26;
const POST_H = 2.35;
const POST_GLOW = 0.32;                // glow crown cube edge
const POST_GLOW_Y = POST_H + 0.02;
const POST_BRASS_H = 0.07;             // olive-gold collar under each crown
const RING_GAP_AT = 0;                 // the dock-side slot stays open (post skipped)

// ── floating flagstone debris below the rim ─────────────────────────────────
const DEBRIS = [                       // [x, y, z, size]
  [-9.5, -2.6, -7, 1.2],
  [10.5, -3.8, 5, 1.7],
  [4, -5.0, -11, 0.9],
  [-12, -4.4, 4.5, 1.0],
  [8.5, -2.2, -9.5, 0.7],
  [-5, -6.2, 9, 1.35],
];

// ── dock & sign ──────────────────────────────────────────────────────────────
const DOCK_SPAWN = { x: 0, z: 11.4 };  // local; on the stage behind the lectern, facing -z
const LABEL_POS = { x: 0, y: 2.2, z: 12.0 };

const COCOA_DARK = 0.82;               // shaded cut of cocoa for trim/undersides

// ── deterministic helpers (coordinate hashing — never random) ───────────────

// Per-cell hash in [0, 1) — same recipe as world.js / test-isle.js.
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

// Top block index for the tier at distance d from center: the recessed court
// (d ≤ COURT_R) is the y=0 ground plane (top block index −1 == clear), tiers
// step up by one block every TIER_STEP cells outward, capped at TIER_MAX_H.
function tierTop(d) {
  if (d <= COURT_R) return -1;
  const h = Math.min(TIER_MAX_H, Math.floor((d - COURT_R) / TIER_STEP) + 1);
  return h - 1;   // top SOLID block index (a height-h tier fills y=0..h-1)
}

// Walkable surface height at a point (local coords) — the y a prop's base sits
// on. The court floor is y=0; tiers add their height.
function surfaceTop(lx, lz) {
  return tierTop(Math.hypot(lx - STAGE.cx, lz - STAGE.cz)) + 1;
}

export async function build(kit) {
  const { THREE, PALETTE, group } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // ── stage terrain (block entries, GLOBAL coords) ──────────────────────────
  const entries = [];
  const put = (x, y, z, c) => entries.push([x + ox, y, z + oz, c]);

  forDisc(STAGE.cx, STAGE.cz, STAGE.r, STAGE.wobble, 1, (x, z) => {
    const d = Math.hypot(x + 0.5 - STAGE.cx, z + 0.5 - STAGE.cz);
    // The central court footprint stays clear of world blocks (top index −1) so
    // the summoned build (foundry.js) can rise into those exact cells from y=0.
    let top = tierTop(d);
    if (top < 0) return;                            // recessed court — leave bare
    // organic tier lips: an occasional extra block where a step crests.
    if (top < TIER_MAX_H - 1 && hashCell(x, z, 23) < TIER_BREAK) top += 1;
    const onRim = d > RIM_RING_R;
    const dx = x + 0.5 - STAGE.cx, dz = z + 0.5 - STAGE.cz;
    const shaded = dx > SHADE_DX && dz < SHADE_DZ && d > STAGE.r - SHADE_RIM;
    for (let y = 0; y <= top; y++) {
      let c;
      if (onRim) {
        c = C_SLATE;                                // slate rim band, top to base
      } else if (y === top) {
        c = hashCell(x, z, 7) < FLAG_WHITE_DITHER ? C_WHITE : C_SANDSTONE;
        // Plum / twilight hue-shift on the shaded NE rim — never just darker.
        if (shaded) {
          const h = hashCell(x, z, 11);
          if (h < SHADE_DITHER) c = h < SHADE_DITHER * 0.5 ? C_DUSTY_PLUM : C_TWILIGHT;
        }
      } else {
        c = C_SANDSTONE;                            // sandstone body under the deck
      }
      put(x, y, z, c);
    }
  });

  await kit.setBlocksPaced(world, entries);

  // ── decor: plinth slab, lectern + brass, ring posts, debris ───────────────
  const decor = kit.decor;
  const cocoa = color(C_COCOA);
  const cocoaDark = cocoa.clone().multiplyScalar(COCOA_DARK);
  const sandstone = color(C_SANDSTONE);
  const white = color(C_WHITE);
  const slate = color(C_SLATE);
  const olive = color(C_OLIVE);

  // the build plinth: a pale stone disc just under the deck + a brighter raised
  // lip ring around it (the lightest values, framing the empty stage).
  forDisc(0, 0, PLINTH_SLAB.r, 0, 0, (x, z) => {
    const pale = hashCell(x, z, 3) < 0.3 ? white : sandstone;
    decor.box(ox + x, PLINTH_SLAB.y, oz + z, 1, PLINTH_SLAB.h, 1, pale);
  });
  for (let a = 0; a < Math.PI * 2 - 1e-6; a += PLINTH_LIP_STEP) {
    const lipX = Math.cos(a) * PLINTH_LIP.r, lipZ = Math.sin(a) * PLINTH_LIP.r;
    decor.box(ox + lipX - PLINTH_LIP.w / 2, 0, oz + lipZ - PLINTH_LIP.w / 2,
      PLINTH_LIP.w, PLINTH_LIP.h, PLINTH_LIP.w, white);
  }

  // the lectern: stepped Cocoa base → column → tilted reading top, brass bands.
  // It stands on the court floor at the inner edge, so its base sits at y=0.
  const lx = LECTERN.x, lz = LECTERN.z;
  const lecternY = surfaceTop(lx, lz);
  decor.box(ox + lx - LECTERN_BASE_W / 2, lecternY, oz + lz - LECTERN_BASE_W / 2,
    LECTERN_BASE_W, LECTERN_BASE_H, LECTERN_BASE_W, cocoaDark);
  decor.box(ox + lx - LECTERN_BASE_W / 2, lecternY + LECTERN_BASE_H, oz + lz - LECTERN_BASE_W / 2,
    LECTERN_BASE_W, LECTERN_BRASS_H, LECTERN_BASE_W, olive);          // brass plinth band
  const colY = lecternY + LECTERN_BASE_H + LECTERN_BRASS_H;
  decor.box(ox + lx - LECTERN_COL_W / 2, colY, oz + lz - LECTERN_COL_W / 2,
    LECTERN_COL_W, LECTERN_COL_H, LECTERN_COL_W, cocoa);
  const topY = colY + LECTERN_COL_H;
  // tilted reading slope: two stacked offset slabs fake the lean toward the dock.
  decor.box(ox + lx - LECTERN_TOP_W / 2, topY, oz + lz - LECTERN_TOP_D / 2 + LECTERN_TILT * 0.5,
    LECTERN_TOP_W, LECTERN_TOP_H, LECTERN_TOP_D, cocoa);
  decor.box(ox + lx - LECTERN_TOP_W / 2, topY + LECTERN_TOP_H, oz + lz - LECTERN_TOP_D / 2,
    LECTERN_TOP_W, LECTERN_TOP_H, LECTERN_TOP_D * 0.7, olive);        // brass face plate
  // the lantern arm reaching up off the lectern's plinth-side shoulder
  decor.box(ox + lx - LANTERN_ARM_W / 2, topY, oz + lz - LECTERN_TOP_D / 2 - 0.18,
    LANTERN_ARM_W, LANTERN_ARM_H, LANTERN_ARM_W, cocoaDark);
  const lanternHeadY = lecternY + LANTERN_Y;

  // the summoning ring posts (cocoa shafts + olive collars; glow crowns below).
  // Each post stands on whatever tier it lands on, so the crowns ring evenly.
  const ringPosts = [];     // remembered for the glow pass: [px, pz, crownY]
  for (let i = 0; i < RING_COUNT; i++) {
    if (i === RING_GAP_AT) continue;             // keep the dock-side slot open
    const a = Math.PI / 2 + (i / RING_COUNT) * Math.PI * 2;  // post 0 at the dock (+z), go round
    const px = Math.cos(a) * RING_R;
    const pz = Math.sin(a) * RING_R;
    const baseY = surfaceTop(px, pz);
    decor.box(ox + px - POST_W / 2, baseY, oz + pz - POST_W / 2, POST_W, POST_H, POST_W, cocoa);
    decor.box(ox + px - (POST_W + 0.06) / 2, baseY + POST_H - POST_BRASS_H - 0.04,
      oz + pz - (POST_W + 0.06) / 2, POST_W + 0.06, POST_BRASS_H, POST_W + 0.06, olive);
    ringPosts.push([px, pz, baseY + POST_GLOW_Y]);
  }

  // floating flagstone debris below the rim (slate, hand-shaded undersides).
  for (const [dx, dy, dz, s] of DEBRIS) {
    const tint = hashCell(Math.round(dx), Math.round(dz), 5) < 0.4 ? slate : sandstone;
    decor.box(ox + dx - s / 2, dy, oz + dz - s / 2, s, s * 0.7, s, tint);
  }

  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  // ── glow lanterns — emissive, so they carry at dusk (the only bright light) ─
  const glow = new kit.GeoBuilder();
  const glowColor = color(C_GLOW);
  // the lectern's docked lantern
  glow.box(ox + lx - LANTERN_HEAD / 2, lanternHeadY, oz + lz - LECTERN_TOP_D / 2 - 0.18 - LANTERN_HEAD / 2,
    LANTERN_HEAD, LANTERN_HEAD, LANTERN_HEAD, glowColor);
  // a crown on every ring post
  for (const [px, pz, crownY] of ringPosts) {
    glow.box(ox + px - POST_GLOW / 2, crownY, oz + pz - POST_GLOW / 2,
      POST_GLOW, POST_GLOW, POST_GLOW, glowColor);
  }
  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: '#FFE8A8', emissiveIntensity: 0.6,
  }));
  glowMesh.castShadow = true;
  glowMesh.receiveShadow = true;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // ── dock sign ─────────────────────────────────────────────────────────────
  const label = kit.makeLabelSprite('the foundry');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
