// islands/fifa.js — galá stadium: "the cup, at golden hour".
//
// Composition: a grand floating OVAL stadium bowl. The recessed Sage pitch with
// crisp Cloud-White markings sits at the bottom; tiered Sandstone/Slate stands
// rise in concentric oval rings around it. THE signature is the CROWD MOSAIC —
// the seat caps are deterministically speckled across the whole 16-colour
// palette so the stands read as a packed, roaring crowd (the island's identity).
// FOUR Slate floodlight towers crowned with Glow-Lantern lamp clusters warm at
// dusk. THE FOCAL POINT: a giant golden trophy (Honey + Olive-Gold, the only big
// gold mass) on a plinth at the halfway line, catching the last SW light. An Ink
// scoreboard with a Glow screen stands behind the far stand; bunting swags the
// upper rim and corner flags flutter. The dock is a tunnel mouth on the south
// short end, looking IN across the pitch so the first view is the trophy framed
// by the glowing floodlights and the crowd — a postcard.
//
// Hue band owned: green pitch (60) + sandstone/slate stands (30) + the loud
// crowd and the gold trophy + glow (10, the focal jewels). Lightest values
// (Cloud-White lines, Honey trophy, Glow floodlights) are reserved for those.
// Shadows hue-shift to Dusty-Plum/Twilight on the NE-facing stand faces (sun SW).

// ── palette indices (names from world.js PALETTE) ───────────────────────────
const C_WHITE = 0;
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
const C_BRICK_RED = 11;
const C_COCOA = 12;
const C_SLATE = 13;
const C_INK = 14;
const C_GLOW = 15;

// The crowd mosaic palette — the one place the whole bright wheel goes loud.
// Weighted by repetition so warm jersey colours dominate (a sunlit crowd reads
// honey/ember/rose) while teal/plum/twilight pepper the shade. Deterministic
// per-seat-cell selection makes the stands sing without any randomness.
const CROWD_COLORS = [
  C_HONEY, C_EMBER, C_ROSE_CLAY, C_TERRACOTTA, C_WHITE, C_SANDSTONE,
  C_HONEY, C_EMBER, C_BRICK_RED, C_TEAL, C_DUSTY_PLUM, C_SAGE,
  C_OLIVE, C_ROSE_CLAY, C_TWILIGHT, C_WHITE, C_HONEY, C_EMBER,
];

// ── §pitch — the recessed oval field ─────────────────────────────────────────
// The pitch is an ellipse (semi-axes PITCH_AX × PITCH_AZ) recessed so the grass
// top sits at PITCH_Y, BELOW the lowest stand tier. White markings are painted
// onto the grass top by line tests in local field coordinates.
const FIELD = { cx: 0, cz: 1 };          // field centre (z nudged so the dock end has room)
const PITCH_AX = 19.5, PITCH_AZ = 13.5;  // pitch ellipse semi-axes (touchline span)
const PITCH_Y = 1;                        // grass-top y (recessed below tier 0 at y=2)
const PITCH_FILL_Y0 = 0;                  // pitch column base
const GRASS_JITTER = 0.5;                 // odds a grass cell uses the mown-stripe tint
const LINE_W = 0.55;                      // marking half-width in cells
const CENTRE_CIRCLE_R = 4.4;             // halfway centre circle radius
const PENALTY_HALF_X = 8.5;              // penalty box half-extent along x (touchline dir)
const PENALTY_DEPTH = 4.6;              // penalty box depth from each goal line (along z)
const GOAL_BOX_HALF_X = 4.4;            // six-yard box half-extent along x
const GOAL_BOX_DEPTH = 2.2;            // six-yard box depth along z

// ── §stands — concentric oval tiers (the bowl) ──────────────────────────────
// Each tier is an elliptical ring one cell-band wide, stepping up and outward.
// STRUCT_Y is the structural front wall; the seat row caps the tier's top with a
// crowd-mosaic block. Tier 0 hugs the pitch; the bowl climbs to STANDS.length-1.
const STAND_GAP = 1.4;                    // pitch-to-first-tier clearance margin (cells)
const TIER_RISE = 1;                      // y gained per tier
const TIER_RUN_X = 2.0;                   // x semi-axis gained per tier (outward rake)
const TIER_RUN_Z = 1.8;                   // z semi-axis gained per tier
const TIER_BASE_Y = 2;                    // top of tier 0's front wall
const TIERS = 7;                          // number of seating tiers
const VOMITORY_HALF = 1.3;               // gangway half-width that breaks the seat ring
const VOMITORIES = [                      // angles (radians) where aisles cut the bowl
  0, Math.PI / 2, Math.PI, -Math.PI / 2,
  Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4,
];
const SHADE_PLUM = 0.45;                  // plum/twilight odds on NE-facing structure
const STRUCT_COCOA = 0.22;                // cocoa seam odds in the sandstone structure
const STRUCT_SHELL = 2;                   // hollow bowl: cells of fill below each tier cap

// The roof lip — a thin Slate cantilever crowning the top tier (the bowl's brow).
const ROOF_BAND = 1;                      // tiers of slate roof cap above the seats

// ── §floodlights — four corner towers ───────────────────────────────────────
// Slate lattice poles at the oval's diagonal corners, each crowned with a 3×3
// cluster of Glow-Lantern (index 15) blocks — they route to the world's glow
// mesh and pulse, reading as floodlights warming at dusk.
const FLOOD_TOWERS = [                     // local (x,z) of each tower base
  { x: 17, z: 14 }, { x: -17, z: 14 },
  { x: 17, z: -12 }, { x: -17, z: -12 },
];
const FLOOD_BASE_Y = 0;
const FLOOD_HEIGHT = 17;                  // pole top (well above the roof brow)
const FLOOD_LAMP_Y0 = 16;                 // lamp cluster base y

// ── §trophy — the golden cup at the halfway line (THE FOCAL POINT) ───────────
// A recognizable cup silhouette: wide Honey bowl on an Olive-Gold stem on a
// stepped base, raised on a Cloud-White/Slate plinth so it catches the last
// light at the centre of the pitch. The only big gold mass on the island.
const TROPHY = { cx: 0, cz: 1 };          // on the halfway line, pitch centre
const PLINTH_R = 2.6;                      // plinth disc radius
const PLINTH_Y0 = PITCH_Y + 1;            // plinth sits on the grass
const PLINTH_H = 2;                        // plinth height
const CUP_BASE_Y = PLINTH_Y0 + PLINTH_H;  // trophy starts atop the plinth

// ── §scoreboard — Ink frame with a Glow screen ───────────────────────────────
const SCOREBOARD = { cx: 0, cz: -23.5 };  // behind the north (far) stand, on the rim
const SB_W = 7, SB_H = 4;                  // screen width / height (cells)
const SB_Y0 = 14;                          // bottom of the screen
const SB_POST_H = 14;                      // support post height

// ── §dock — the tunnel mouth (player spawn), south short end ─────────────────
const TUNNEL = { cx: 0, cz: 24 };          // tunnel mouth centre on the south rim
const TUNNEL_HALF = 2;                      // tunnel half-width
const DOCK_SPAWN = { x: 0, z: 27 };        // local; on the apron, looking -z into the bowl
const APRON = { x0: -4, x1: 4, z0: 24, z1: 29 }; // flat entry apron at y=1
const APRON_Y = 1;
const LABEL_POS = { x: 0, y: 4.4, z: 28 };

// ── §decor tunables — bunting, flags, net lines, trophy facets, lamps ────────
const NET_T = 0.04;                        // goal-net line thickness
const BUNTING_DROP = 0.5;                  // bunting catenary sag depth
const BUNTING_BEAD = 0.34;                 // half-scale bunting triangle bead
const FLAG_POLE_H = 1.6;                   // corner-flag pole height

// ── deterministic helpers ───────────────────────────────────────────────────

// Per-cell hash in [0, 1) — same recipe as world.js. `salt` decorrelates uses.
function hashCell(x, z, salt = 0) {
  let h = (Math.imul(x + salt * 101, 374761393) + Math.imul(z - salt * 53, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Normalized ellipse radius of cell (x,z) about the field centre: <1 inside.
function ellipse(x, z, ax, az) {
  const dx = (x + 0.5 - FIELD.cx) / ax;
  const dz = (z + 0.5 - FIELD.cz) / az;
  return Math.hypot(dx, dz);
}

// Which tier ring a cell falls in (0..TIERS-1), or -1 if on the pitch / outside
// the bowl. Tiers are nested ellipses; the band width is the gap between
// consecutive tier radii in cell space, mapped back through the x-semi-axis.
function tierAt(x, z) {
  const innerAx = PITCH_AX + STAND_GAP;
  for (let t = 0; t < TIERS; t++) {
    const ax = innerAx + t * TIER_RUN_X;
    const az = (PITCH_AZ + STAND_GAP) + t * TIER_RUN_Z;
    const axN = innerAx + (t + 1) * TIER_RUN_X;
    const azN = (PITCH_AZ + STAND_GAP) + (t + 1) * TIER_RUN_Z;
    const inOuter = ellipse(x, z, axN, azN) <= 1;
    const inInner = ellipse(x, z, ax, az) <= 1;
    if (inOuter && !inInner) return t;
  }
  return -1;
}

// Angle of a cell about the field centre, for vomitory gaps + crowd variation.
function angleAt(x, z) {
  return Math.atan2(z + 0.5 - FIELD.cz, x + 0.5 - FIELD.cx);
}

// Is this cell inside a gangway aisle (a radial gap in the seats)?
function inVomitory(x, z) {
  const a = angleAt(x, z);
  const r = Math.hypot(x + 0.5 - FIELD.cx, z + 0.5 - FIELD.cz);
  for (const va of VOMITORIES) {
    let d = Math.abs(a - va);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d * r < VOMITORY_HALF) return true;
  }
  return false;
}

// NE-facing test (sun is SW): cells on the north/east side of the bowl shade.
function isShadeSide(x, z) {
  return x + 0.5 - FIELD.cx > -1 && z + 0.5 - FIELD.cz < 1;
}

// The PORTAL: the player's entrance gap. The apron + tunnel cut a clear notch
// through the south stand so the bowl, the stands, and the roof brow leave it
// open — the dock sightline runs straight into the pitch toward the trophy.
const PORTAL_HALF_X = 4;                  // notch half-width (cells)
const PORTAL_Z0 = 16.5;                   // notch starts at this z (into the bowl)
function inPortal(x, z) {
  return Math.abs(x + 0.5 - TUNNEL.cx) <= PORTAL_HALF_X && z + 0.5 > PORTAL_Z0;
}

export async function build(kit) {
  const { THREE, PALETTE, group, water } = kit;
  const world = kit.makeWorld();
  const ox = world.origin.x, oz = world.origin.z;
  const color = (i) => new THREE.Color(PALETTE[i].hex);

  // ── terrain (block entries, GLOBAL coords; Map dedupes overlaps) ──────────
  const cells = new Map();
  const put = (x, y, z, c) => cells.set(x + ',' + y + ',' + z, [x + ox, y, z + oz, c]);

  const min = -world.radius, max = world.radius - 1;

  // -- pitch line tests (in field-local coordinates) --------------------------
  const fx = (x) => x + 0.5 - FIELD.cx;        // signed field x (touchline axis)
  const fz = (z) => z + 0.5 - FIELD.cz;        // signed field z (goal-to-goal axis)
  const isPitch = (x, z) => ellipse(x, z, PITCH_AX, PITCH_AZ) <= 1;

  // returns true if a pitch cell should be painted Cloud-White (a line marking)
  function isMarking(x, z) {
    const X = fx(x), Z = fz(z);
    const aX = Math.abs(X), aZ = Math.abs(Z);
    // touchlines + goal lines: just inside the pitch ellipse edge
    const e = ellipse(x, z, PITCH_AX - 0.6, PITCH_AZ - 0.6);
    if (e > 1 && isPitch(x, z)) return true;
    // halfway line (runs across x at Z≈0)
    if (aZ < LINE_W) return true;
    // centre circle ring
    const cr = Math.hypot(X, Z);
    if (Math.abs(cr - CENTRE_CIRCLE_R) < LINE_W) return true;
    if (cr < 0.7) return true;                  // centre spot
    // penalty boxes (both ends, Z near ±PITCH_AZ)
    for (const dir of [1, -1]) {
      const goalZ = dir * (PITCH_AZ - 0.5);
      const boxFront = goalZ - dir * PENALTY_DEPTH;
      const inXspan = aX < PENALTY_HALF_X + LINE_W;
      const betweenZ = (dir > 0 ? Z > boxFront - LINE_W && Z < goalZ : Z < boxFront + LINE_W && Z > goalZ);
      if (inXspan && betweenZ) {
        // box outline: front edge or the two side edges
        if (Math.abs(Z - boxFront) < LINE_W) return true;
        if (Math.abs(aX - PENALTY_HALF_X) < LINE_W) return true;
      }
      // six-yard box
      const gFront = goalZ - dir * GOAL_BOX_DEPTH;
      const inXspan6 = aX < GOAL_BOX_HALF_X + LINE_W;
      const betweenZ6 = (dir > 0 ? Z > gFront - LINE_W && Z < goalZ : Z < gFront + LINE_W && Z > goalZ);
      if (inXspan6 && betweenZ6) {
        if (Math.abs(Z - gFront) < LINE_W) return true;
        if (Math.abs(aX - GOAL_BOX_HALF_X) < LINE_W) return true;
      }
      // penalty spot
      const spotZ = goalZ - dir * (PENALTY_DEPTH - 1.6);
      if (Math.abs(Z - spotZ) < 0.6 && aX < 0.6) return true;
    }
    return false;
  }

  // -- the pitch: recessed grass with crisp white markings --------------------
  const inTrophyPlinth = (x, z) =>
    Math.hypot(x + 0.5 - TROPHY.cx, z + 0.5 - TROPHY.cz) <= PLINTH_R;
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      if (!isPitch(x, z)) continue;
      // fill the pitch column up to grass-top, then cap with grass/markings
      for (let y = PITCH_FILL_Y0; y < PITCH_Y; y++) put(x, y, z, C_COCOA);
      if (inTrophyPlinth(x, z)) { put(x, PITCH_Y, z, C_SAGE); continue; }
      let c;
      if (isMarking(x, z)) {
        c = C_WHITE;
      } else {
        // mown stripes: alternating sage tints by goal-to-goal band
        const band = Math.floor((fz(z) + PITCH_AZ) / 2);
        const stripe = (band & 1) === 0;
        c = stripe && hashCell(x, z, 3) < GRASS_JITTER ? C_OLIVE : C_SAGE;
      }
      put(x, PITCH_Y, z, c);
    }
  }

  // -- the stands: concentric oval tiers, crowd-mosaic seat caps --------------
  const innerAx = PITCH_AX + STAND_GAP;
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      const t = tierAt(x, z);
      if (t < 0) continue;
      if (inPortal(x, z)) continue;                  // leave the entrance notch open
      const topY = TIER_BASE_Y + t * TIER_RISE;     // structural top of this tier
      const shade = isShadeSide(x, z);
      // structural fill — HOLLOW bowl: only the visible cells are placed (the
      // top riser face + the seating bench below the cap, plus a 1-cell floor
      // skirt at y=0 so the floating underside reads). The deep interior between
      // is empty — saves thousands of never-seen blocks and keeps the pitch the
      // dominant colour mass (the 60-30-10 budget).
      for (let y = 0; y < topY; y++) {
        const visible = y >= topY - STRUCT_SHELL || y === 0;
        if (!visible) continue;
        let c = C_SANDSTONE;
        if (hashCell(x, z, y + 5) < STRUCT_COCOA) c = C_COCOA;
        if (shade && hashCell(x, z, y + 9) < SHADE_PLUM) {
          c = hashCell(x, z, y + 11) < 0.5 ? C_DUSTY_PLUM : C_TWILIGHT;
        }
        // tier risers (the visible front step) read as Slate
        if (y === topY - 1) c = shade && hashCell(x, z, 13) < SHADE_PLUM ? C_DUSTY_PLUM : C_SLATE;
        put(x, y, z, c);
      }
      // seat cap: the CROWD MOSAIC — unless it's a gangway aisle (left as bare
      // slate steps) — speckled deterministically across the bright palette.
      if (inVomitory(x, z)) {
        put(x, topY, z, C_SLATE);
      } else {
        // pick a crowd colour from a per-cell hash; bias the shaded side cooler
        let idx = Math.floor(hashCell(x, z, 17) * CROWD_COLORS.length);
        if (shade && hashCell(x, z, 19) < 0.4) {
          idx = Math.floor(hashCell(x, z, 23) * CROWD_COLORS.length);
          const cool = [C_DUSTY_PLUM, C_TWILIGHT, C_TEAL, C_SLATE, C_ROSE_CLAY];
          put(x, topY, z, cool[idx % cool.length]);
        } else {
          put(x, topY, z, CROWD_COLORS[idx % CROWD_COLORS.length]);
        }
      }
    }
  }

  // -- the roof brow: a thin slate cantilever crowning the top tier -----------
  const outerAx = innerAx + TIERS * TIER_RUN_X;
  const outerAz = (PITCH_AZ + STAND_GAP) + TIERS * TIER_RUN_Z;
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      const onBrow = ellipse(x, z, outerAx, outerAz) <= 1 &&
        ellipse(x, z, outerAx - 1.4, outerAz - 1.4) > 1;
      if (!onBrow || inPortal(x, z)) continue;       // keep the entrance notch open
      const browY = TIER_BASE_Y + (TIERS - 1) * TIER_RISE + 1;
      for (let r = 0; r < ROOF_BAND; r++) {
        const shade = isShadeSide(x, z);
        put(x, browY + r, z, shade && hashCell(x, z, 27) < 0.4 ? C_INK : C_SLATE);
      }
    }
  }

  // -- floodlight towers: slate poles, glow-lantern lamp crowns ---------------
  for (const ft of FLOOD_TOWERS) {
    for (let y = FLOOD_BASE_Y; y < FLOOD_HEIGHT; y++) {
      // 2×2 lattice pole, tapering to 1 near the top
      const wide = y < FLOOD_HEIGHT - 4;
      put(ft.x, y, ft.z, C_SLATE);
      if (wide) {
        put(ft.x + 1, y, ft.z, C_SLATE);
        put(ft.x, y, ft.z + 1, C_INK);
        put(ft.x + 1, y, ft.z + 1, C_SLATE);
      }
    }
    // the lamp crown: a 3×2 cluster of Glow-Lantern blocks (route to glow mesh)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        put(ft.x + dx, FLOOD_LAMP_Y0 + dy, ft.z, C_GLOW);
      }
    }
    // a slate visor over the lamps so they throw downward into the bowl
    for (let dx = -1; dx <= 1; dx++) put(ft.x + dx, FLOOD_LAMP_Y0 + 2, ft.z, C_SLATE);
  }

  // -- the golden trophy on its plinth (THE FOCAL POINT) ----------------------
  // plinth: a stepped Cloud-White / Slate disc
  for (let x = min; x <= max; x++) {
    for (let z = min; z <= max; z++) {
      const d = Math.hypot(x + 0.5 - TROPHY.cx, z + 0.5 - TROPHY.cz);
      if (d > PLINTH_R) continue;
      const step = d > PLINTH_R - 1 ? 1 : 0;            // outer ring one lower
      for (let y = PLINTH_Y0; y < CUP_BASE_Y - step; y++) {
        put(x, y, z, y === CUP_BASE_Y - 1 - step ? C_WHITE : C_SLATE);
      }
    }
  }
  // the cup silhouette — base → stem → wide bowl, in Honey + Olive-Gold.
  const cx = Math.round(TROPHY.cx), cz = Math.round(TROPHY.cz);
  // foot (3×3 olive-gold)
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(cx + dx, CUP_BASE_Y, cz + dz, C_OLIVE);
  // tapered base block
  put(cx, CUP_BASE_Y + 1, cz, C_OLIVE);
  put(cx, CUP_BASE_Y + 2, cz, C_OLIVE);
  // stem (honey)
  put(cx, CUP_BASE_Y + 3, cz, C_HONEY);
  // the wide bowl — a 3×3 honey ring opening upward, with handle arms
  const bowlY = CUP_BASE_Y + 4;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      put(cx + dx, bowlY, cz + dz, C_HONEY);
      put(cx + dx, bowlY + 1, cz + dz, C_HONEY);
    }
  }
  // bowl rim flares (the cup mouth widening) + handles in olive-gold
  for (const dx of [-2, 2]) { put(cx + dx, bowlY + 1, cz, C_OLIVE); put(cx + dx, bowlY, cz, C_OLIVE); }
  put(cx, bowlY + 2, cz, C_HONEY);                  // a glint cap on top

  // -- the scoreboard: Ink frame, Glow screen, behind the far stand ----------
  const sb = SCOREBOARD;
  for (const px of [sb.cx - Math.ceil(SB_W / 2), sb.cx + Math.ceil(SB_W / 2)]) {
    for (let y = 0; y < SB_POST_H; y++) put(px, y, sb.cz, C_SLATE);
  }
  for (let dx = -Math.floor(SB_W / 2) - 1; dx <= Math.floor(SB_W / 2) + 1; dx++) {
    for (let dy = -1; dy <= SB_H; dy++) {
      const onFrame = dx < -Math.floor(SB_W / 2) || dx > Math.floor(SB_W / 2) || dy < 0 || dy >= SB_H;
      put(sb.cx + dx, SB_Y0 + dy, sb.cz, onFrame ? C_INK : C_GLOW);
    }
  }

  // -- the entry concourse + tunnel mouth (the dock end) ----------------------
  // A continuous Sandstone concourse fills the portal notch at y=1 from the dock
  // apron, through the tunnel, to the pitch-edge — the player's walkable approach
  // and the leading line straight to the trophy. Cocoa understructure beneath.
  for (let x = -PORTAL_HALF_X; x <= PORTAL_HALF_X; x++) {
    for (let z = Math.ceil(PORTAL_Z0); z <= APRON.z1; z++) {
      for (let y = 0; y <= APRON_Y; y++) {
        const ax = TUNNEL.cx + x;
        // a slim Cloud-White centre runner down the concourse (the sightline)
        const c = y < APRON_Y ? C_COCOA : (x === 0 ? C_WHITE : C_SANDSTONE);
        put(ax, y, z, c);
      }
    }
  }
  // the tunnel: a dark Ink archway over the concourse (the floor + white runner
  // are already laid by the concourse loop), cut through the south stand. The
  // dark walls + roof frame the bright pitch beyond — the mouth of the postcard.
  for (let z = TUNNEL.cz; z >= TUNNEL.cz - 3; z--) {
    put(TUNNEL.cx - TUNNEL_HALF - 1, APRON_Y + 1, z, C_INK);  // left wall
    put(TUNNEL.cx + TUNNEL_HALF + 1, APRON_Y + 1, z, C_INK);  // right wall
    put(TUNNEL.cx - TUNNEL_HALF - 1, APRON_Y + 2, z, C_INK);
    put(TUNNEL.cx + TUNNEL_HALF + 1, APRON_Y + 2, z, C_INK);
    for (let dx = -TUNNEL_HALF - 1; dx <= TUNNEL_HALF + 1; dx++) {
      put(TUNNEL.cx + dx, APRON_Y + 3, z, C_INK);             // tunnel roof
    }
  }

  await kit.setBlocksPaced(world, [...cells.values()]);

  // ── decor: bunting, corner flags, goal nets, trophy facets, lamp glass ────
  const decor = kit.decor;
  const glow = new kit.GeoBuilder();
  const white = color(C_WHITE);
  const ink = color(C_INK);
  const slate = color(C_SLATE);
  const honey = color(C_HONEY);
  const olive = color(C_OLIVE);
  const glowC = color(C_GLOW);

  // -- the two goals: Cloud-White frames with sub-voxel white net lines -------
  // a goal sits on the goal line at each end, opening toward the pitch centre.
  const goalAt = (dir) => {
    const gz = FIELD.cz + dir * (PITCH_AZ - 0.8);   // goal line z
    const gw = 4.0;                                  // goal mouth half-width
    const gh = 2.6;                                  // crossbar height above grass
    const yBase = PITCH_Y + 1;
    const post = 0.18;
    const gxL = ox + FIELD.cx - gw, gxR = ox + FIELD.cx + gw, gZ = oz + gz;
    // posts + crossbar (Cloud White)
    decor.box(gxL - post / 2, yBase, gZ - post / 2, post, gh, post, white);
    decor.box(gxR - post / 2, yBase, gZ - post / 2, post, gh, post, white);
    decor.box(gxL - post / 2, yBase + gh, gZ - post / 2, gw * 2 + post, post, post, white);
    // the net: a sloped sheet of thin white lines behind the mouth
    const depth = 1.6 * dir;                          // net leans away from the pitch
    const nz0 = gZ, nz1 = gZ + depth;
    const cols = 9, rows = 6;
    for (let i = 0; i <= cols; i++) {                 // vertical net strings
      const xx = gxL + (gxR - gxL) * (i / cols);
      decor.box(xx - NET_T / 2, yBase, nz1 - NET_T / 2, NET_T, gh, NET_T, white);
    }
    for (let j = 0; j <= rows; j++) {                 // horizontal net strings
      const yy = yBase + gh * (j / rows);
      decor.box(gxL, yy - NET_T / 2, nz1 - NET_T / 2, gxR - gxL, NET_T, NET_T, white);
    }
    // the slope strings tying crossbar back to the net base (the roof of the net)
    for (let i = 0; i <= cols; i += 2) {
      const xx = gxL + (gxR - gxL) * (i / cols);
      decor.box(xx - NET_T / 2, yBase + gh - NET_T / 2,
        Math.min(nz0, nz1), NET_T, NET_T, Math.abs(depth), white);
    }
  };
  goalAt(1); goalAt(-1);

  // -- trophy facets: thin Honey/Olive plates catching the SW light -----------
  // bright glints on the bowl's sun-facing (SW) side — the lightest values, here.
  const tcx = ox + TROPHY.cx, tcz = oz + TROPHY.cz, by = bowlY;
  decor.box(tcx - 1.55, by + 0.1, tcz - 1.55, 0.12, 1.9, 0.5, honey.clone().multiplyScalar(1.08));
  decor.box(tcx - 1.55, by + 0.1, tcz - 1.55, 0.5, 1.9, 0.12, honey.clone().multiplyScalar(1.08));
  glow.box(tcx - 0.25, by + 2.2, tcz - 0.25, 0.5, 0.5, 0.5, glowC); // a glint atop the cup
  // engraved bands on the stem
  decor.box(tcx - 0.55, CUP_BASE_Y + 1.6, tcz - 0.55, 1.1, 0.1, 1.1, olive);

  // -- floodlight lamp glass: clustered glowing lenses on each tower ----------
  for (const ft of FLOOD_TOWERS) {
    const lx = ox + ft.x, lz = oz + ft.z;
    for (let dx = -1; dx <= 1; dx++) {
      glow.box(lx + dx - 0.35, FLOOD_LAMP_Y0 + 0.1, lz - 0.35, 0.7, 0.5, 0.45, glowC);
    }
    // a faint warm halo plate angled into the bowl
    glow.box(lx - 1.0, FLOOD_LAMP_Y0 - 0.3, lz - 0.1, 2.0, 0.08, 0.5,
      glowC.clone().multiplyScalar(0.7));
  }

  // -- the scoreboard glass: a brighter glow plate over the screen -----------
  glow.box(ox + SCOREBOARD.cx - Math.floor(SB_W / 2) - 0.4, SB_Y0 + 0.1, oz + SCOREBOARD.cz - 0.06,
    SB_W, SB_H - 0.2, 0.12, glowC);

  // -- bunting: palette-coloured triangle beads swagging the upper rim --------
  // strings run between anchor points around the roof brow; each swag sags into
  // a catenary and is hung with little bright triangle beads (the whole wheel).
  const browY = TIER_BASE_Y + (TIERS - 1) * TIER_RISE + 1 + ROOF_BAND + 0.2;
  const buntColors = [C_HONEY, C_EMBER, C_ROSE_CLAY, C_TEAL, C_WHITE, C_OLIVE, C_BRICK_RED, C_DUSTY_PLUM];
  const ringR_x = outerAx - 0.6, ringR_z = outerAz - 0.6;
  const SWAGS = 28;                                   // anchors around the oval
  let prevA = null;
  for (let i = 0; i <= SWAGS; i++) {
    const a = (i / SWAGS) * Math.PI * 2;
    const ax = ox + FIELD.cx + Math.cos(a) * ringR_x;
    const az = oz + FIELD.cz + Math.sin(a) * ringR_z;
    if (prevA) {
      // string from prevA to this anchor, sagging; hang 2 beads
      const segs = 4;
      let pp = null;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const px = prevA.x + (ax - prevA.x) * t;
        const pz = prevA.z + (az - prevA.z) * t;
        const py = browY - BUNTING_DROP * 4 * t * (1 - t);
        if (pp) {
          decor.box(Math.min(pp.x, px) - 0.02, Math.min(pp.y, py) - 0.02, Math.min(pp.z, pz) - 0.02,
            Math.abs(px - pp.x) + 0.04, Math.abs(py - pp.y) + 0.04, Math.abs(pz - pp.z) + 0.04, ink);
        }
        if (s === 1 || s === 3) {
          const bc = color(buntColors[(i + s) % buntColors.length]);
          decor.box(px - BUNTING_BEAD / 2, py - BUNTING_BEAD - 0.04, pz - BUNTING_BEAD / 2,
            BUNTING_BEAD, BUNTING_BEAD, BUNTING_BEAD, bc);
        }
        pp = { x: px, y: py, z: pz };
      }
    }
    prevA = { x: ax, y: browY, z: az };
  }

  // -- corner flags: four little poles with bright pennants at the pitch corners
  const FLAGS = [
    { x: PITCH_AX - 2.5, z: PITCH_AZ - 1.5, c: C_HONEY },
    { x: -(PITCH_AX - 2.5), z: PITCH_AZ - 1.5, c: C_EMBER },
    { x: PITCH_AX - 2.5, z: -(PITCH_AZ - 1.5), c: C_ROSE_CLAY },
    { x: -(PITCH_AX - 2.5), z: -(PITCH_AZ - 1.5), c: C_TEAL },
  ];
  for (const fl of FLAGS) {
    const px = ox + FIELD.cx + fl.x, pz = oz + FIELD.cz + fl.z, y0 = PITCH_Y + 1;
    decor.box(px - 0.05, y0, pz - 0.05, 0.1, FLAG_POLE_H, 0.1, white);
    decor.box(px + 0.05, y0 + FLAG_POLE_H - 0.55, pz - 0.02, 0.5, 0.34, 0.03, color(fl.c));
  }

  // -- bunting on the tunnel mouth (a welcome swag over the entrance) ---------
  for (let dx = -TUNNEL_HALF; dx <= TUNNEL_HALF; dx++) {
    const bc = color(buntColors[(dx + 4) % buntColors.length]);
    decor.box(ox + TUNNEL.cx + dx - 0.15, APRON_Y + 3.05, oz + TUNNEL.cz - 0.05,
      0.3, 0.3, 0.05, bc);
  }

  // build the decor + glow meshes
  const decorMesh = new THREE.Mesh(decor.build(), kit.lambert('#FFFFFF', { vertexColors: true }));
  decorMesh.castShadow = true;
  decorMesh.receiveShadow = true;
  decorMesh.matrixAutoUpdate = false;
  group.add(decorMesh);

  const glowMesh = new THREE.Mesh(glow.build(), kit.lambert('#FFFFFF', {
    vertexColors: true, emissive: '#FFE8A8', emissiveIntensity: 0.55,
  }));
  glowMesh.castShadow = false;
  glowMesh.receiveShadow = false;
  glowMesh.matrixAutoUpdate = false;
  group.add(glowMesh);

  // ── dock sign + spawn at the tunnel mouth, looking IN across the pitch ─────
  const label = kit.makeLabelSprite('galá stadium');
  label.position.set(ox + LABEL_POS.x, LABEL_POS.y, oz + LABEL_POS.z);
  group.add(label);

  return { dockSpawn: { x: ox + DOCK_SPAWN.x, z: oz + DOCK_SPAWN.z } };
}
