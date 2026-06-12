// water.js — the stylized water family: toon-banded surfaces, waterfall
// sheets, mist breath. One module-level uTime uniform object is shared by
// every material; water.update(dt) is the only place it advances. Procedural
// masks only — no texture files, no postprocessing, no depth textures.
//
// Golden-hour identity: every fragment shader ends with the SAME output
// chunk order as three's built-in materials (tonemapping → colorspace → fog)
// so the water fogs exactly like the Lambert terrain and sits IN the scene.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Budgets

const MAX_SURF_VERTS = 16384; // surface tessellation cap — segments auto-coarsen
const MIST_COUNT_MAX = 16; // hard cap on sprites per mist group
const DT_CLAMP = 0.1; // tab-back safety on the shared clock

// ---------------------------------------------------------------------------
// Surface tunables (contract recipe numbers live here too — all named)

const SURF_BODY = '#3F8C8C'; // warm-shifted teal — the golden-hour body
const SURF_DEEP = '#5B6EA8'; // twilight blue — the shadow band
const SURF_FOAM = '#F7EDDD'; // peach-cream — never postcard white

const WAVE_AMP = 0.06; // compound-sine displacement amplitude
const WAVE_MIX_X = 0.8; // world x+z mix feeding the sine stack
const WAVE_MIX_Z = 0.6;

// Two-sample stripe mask (Wind Waker trick): same value noise sampled twice,
// second sample offset and counter-drifting, so the overlap slowly evolves.
const SURF_S1X = 0.55, SURF_S1Y = 0.85; // sample 1 scale — stretched stripes
const SURF_D1X = 0.045, SURF_D1Y = 0.028; // sample 1 drift (slow, calm pond)
const SURF_S2X = 0.82, SURF_S2Y = 1.27; // sample 2 scale
const SURF_D2X = -0.032, SURF_D2Y = 0.05; // sample 2 counter-drift
const SURF_OFF2X = 5.2, SURF_OFF2Y = 1.3; // sample 2 offset
const SURF_BLEND = 0.55; // weight of sample 1 in the combined mask
const SURF_GAIN = 0.88; // compresses the mask so the cream band stays sparse
const SURF_LIFT = 0.04; // …without growing the deep band
const SURF_BANDS = 3; // floor(n*3)/3 — three hand-painted flats

// Shore foam (contract formula constants)
const SHORE_DIST_MAX = 3; // aShoreDist clamp, in cells
const SHORE_SCAN_R = 4; // cell scan window when baking aShoreDist
const FOAM_FREQ = 1.5;
const FOAM_SPEED = 0.4;
const FOAM_NOISE = 0.5;
const FOAM_WIDTH = 0.22;
const FOAM_FAR = 2.2; // foam fades out by this shore distance
const FOAM_NEAR = 0.4; // …and is full strength inside this one

// ---------------------------------------------------------------------------
// Waterfall tunables

const FALL_BODY = '#7FB8C9';
const FALL_FOAM = '#F7EDDD';
const FALL_SEG_Y = 4; // 1×4 segment sheet
const FALL_BEVEL_LIP = 0.6; // top edge pulled back — the lip
const FALL_BEVEL_MID = 0.18; // second row eases the bevel into a curl
const FALL_SPEED_1 = 1.0; // panner 1 speed
const FALL_SPEED_2 = 1.6; // panner 2 speed
const FALL_DRIFT_U = 0.35; // panner 2 negative-U sideways drift
const FALL_CUTOFF = 0.35; // hard alpha cutoff — the silk shred line
const FALL_WOBBLE_FREQ = 12.0; // sine UV wobble
const FALL_WOBBLE_AMP = 0.05;
const FALL_WOBBLE_SCROLL = 1.0;
const FALL_FREQ_U1 = 6.0; // streak frequency across the sheet
const FALL_FREQ_U2 = 9.5;
const FALL_FREQ_V1 = 1.6; // streak frequency along the fall (low = long)
const FALL_FREQ_V2 = 2.4;
const FALL_STRETCH_LIP = 0.55; // v-stretch at the lip — long laminar silk
const FALL_STRETCH_BASE = 2.6; // v-stretch at the base — broken, aerated
const FALL_RATE_EDGE = 0.8; // pan-speed multiplier at the edges
const FALL_RATE_CENTER = 1.25; // …faster in the center
const FALL_MASK_BIAS = 0.08; // overall sheet solidity above the cutoff
const FALL_LIP_SOLID = 0.3; // mask boost near the lip — sheet starts whole
const FALL_LIP_RANGE = 0.6; // lip boost eases in from this v upward
const FALL_BASE_ERODE = 0.18; // mask erosion near the base — sheet shreds
const FALL_EDGE_W = 0.1; // ragged side edges instead of ruler lines
const FALL_EDGE_ERODE = 0.3;
const FALL_LIP_FOAM = 0.75; // lip foam band strength (×0.75 of base)
const FALL_STREAK_HILIGHT = 0.35; // bright cores on the strongest streaks
const FALL_ALPHA_MIN = 0.78;
const FALL_ALPHA_MAX = 0.96;

// ---------------------------------------------------------------------------
// Mist tunables

const MIST_TINT = '#F2C9A0'; // warm golden-hour breath
const MIST_TEX_SIZE = 128;
const MIST_LOOP_S = 7.0; // seconds per rise loop — slow
const MIST_RISE = 0.4; // units per second
const MIST_OPACITY = 0.5; // peak opacity
const MIST_SCALE_MIN = 1.2;
const MIST_SCALE_MAX = 2.2;
const MIST_IN_END = 0.3; // fade-in portion of the loop
const MIST_OUT_START = 0.55; // fade-out begins here
const MIST_DRIFT_AMP = 0.18; // gentle sideways wander
const MIST_DRIFT_SPEED = 0.35;
const MIST_RENDER_ORDER = 1; // after the waterfall sheet so it reads in front

// ---------------------------------------------------------------------------
// Shared clock + registry. uTime is one uniform object reused by reference in
// every ShaderMaterial — registering a material IS sharing this object. Mist
// groups are the only members needing per-frame JS work.

const uTime = { value: 0 };
const mists = new Set();

// GLSL float formatter — keeps tunables as JS consts while shaders stay exact.
const glf = (n) => {
  const s = String(Math.round(n * 1e6) / 1e6);
  return /[.e]/.test(s) ? s : s + '.0';
};

// Hash-based value noise — no textures anywhere.
const NOISE_GLSL = /* glsl */ `
  float whash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float wnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = whash(i);
    float b = whash(i + vec2(1.0, 0.0));
    float c = whash(i + vec2(0.0, 1.0));
    float d = whash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
`;

// ---------------------------------------------------------------------------
// Surface shaders

const SURF_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  attribute float aShoreDist;
  uniform float uTime;
  varying vec2 vWorld;
  varying float vShore;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float xz = wp.x * ${glf(WAVE_MIX_X)} + wp.z * ${glf(WAVE_MIX_Z)};
    float t = uTime;
    wp.y += (sin(xz * 1.0 + t) + sin(xz * 2.3 + t * 1.5) + sin(xz * 3.3 + t * 0.4)) / 3.0 * ${glf(WAVE_AMP)};
    vWorld = wp.xz;
    vShore = aShoreDist;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SURF_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  varying vec2 vWorld;
  varying float vShore;
  ${NOISE_GLSL}
  void main() {
    vec2 p1 = vWorld * vec2(${glf(SURF_S1X)}, ${glf(SURF_S1Y)})
            + uTime * vec2(${glf(SURF_D1X)}, ${glf(SURF_D1Y)});
    vec2 p2 = vWorld * vec2(${glf(SURF_S2X)}, ${glf(SURF_S2Y)})
            + uTime * vec2(${glf(SURF_D2X)}, ${glf(SURF_D2Y)})
            + vec2(${glf(SURF_OFF2X)}, ${glf(SURF_OFF2Y)});
    float n = wnoise(p1) * ${glf(SURF_BLEND)} + wnoise(p2) * ${glf(1 - SURF_BLEND)};
    n = n * ${glf(SURF_GAIN)} + ${glf(SURF_LIFT)};
    float band = floor(n * ${glf(SURF_BANDS)}) / ${glf(SURF_BANDS)};
    vec3 col = mix(uDeep, uBody, step(0.3, band));
    col = mix(col, uFoam, step(0.6, band));
    // shore foam — (1 - smoothstep(near, far, d)) == smoothstep(far, near, d),
    // written ascending because reversed smoothstep edges are undefined in GLSL
    float foam = step(fract(vShore * ${glf(FOAM_FREQ)} - uTime * ${glf(FOAM_SPEED)} + n * ${glf(FOAM_NOISE)}), ${glf(FOAM_WIDTH)})
               * (1.0 - smoothstep(${glf(FOAM_NEAR)}, ${glf(FOAM_FAR)}, vShore));
    col = mix(col, uFoam, foam);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Waterfall shaders

const FALL_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FALL_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uBody;
  uniform vec3 uFoam;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 uv = vUv;
    uv.x += sin(uv.y * ${glf(FALL_WOBBLE_FREQ)} + uTime * ${glf(FALL_WOBBLE_SCROLL)}) * ${glf(FALL_WOBBLE_AMP)};
    float center = 1.0 - abs(uv.x - 0.5) * 2.0;
    float rate = mix(${glf(FALL_RATE_EDGE)}, ${glf(FALL_RATE_CENTER)}, clamp(center, 0.0, 1.0));
    // long laminar streaks at the lip, breaking up toward the base
    float stretch = mix(${glf(FALL_STRETCH_BASE)}, ${glf(FALL_STRETCH_LIP)}, uv.y);
    float n1 = wnoise(vec2(uv.x * ${glf(FALL_FREQ_U1)},
                           uv.y * stretch * ${glf(FALL_FREQ_V1)} + uTime * ${glf(FALL_SPEED_1)} * rate));
    float n2 = wnoise(vec2(uv.x * ${glf(FALL_FREQ_U2)} - uTime * ${glf(FALL_DRIFT_U)},
                           uv.y * stretch * ${glf(FALL_FREQ_V2)} + uTime * ${glf(FALL_SPEED_2)} * rate));
    float m = n1 * 0.62 + n2 * 0.38 + ${glf(FALL_MASK_BIAS)};
    m += smoothstep(${glf(FALL_LIP_RANGE)}, 1.0, uv.y) * ${glf(FALL_LIP_SOLID)};
    m -= (1.0 - smoothstep(0.0, 0.45, uv.y)) * ${glf(FALL_BASE_ERODE)};
    float edge = min(uv.x, 1.0 - uv.x);
    m -= (1.0 - smoothstep(0.0, ${glf(FALL_EDGE_W)}, edge)) * ${glf(FALL_EDGE_ERODE)};
    if (m < ${glf(FALL_CUTOFF)}) discard;
    vec3 col = mix(uFoam, uBody, smoothstep(0.0, 0.55, uv.y));
    float foamBand = (1.0 - smoothstep(0.02, 0.16, uv.y))
                   + smoothstep(0.86, 0.985, uv.y) * ${glf(FALL_LIP_FOAM)};
    col = mix(col, uFoam, clamp(foamBand, 0.0, 1.0));
    col = mix(col, uFoam, smoothstep(0.62, 0.85, m) * ${glf(FALL_STREAK_HILIGHT)});
    float alpha = mix(${glf(FALL_ALPHA_MIN)}, ${glf(FALL_ALPHA_MAX)}, smoothstep(${glf(FALL_CUTOFF)}, 0.7, m));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Helpers

// Per-material fog uniforms (cloned) merged with shared ones (uTime by ref).
function waterUniforms(extra) {
  return Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), extra);
}

// Distance in cells from a world-space point to the nearest land cell, clamped
// to SHORE_DIST_MAX. isLand is queried with INTEGER world cell coords.
function shoreDistance(isLand, wx, wz) {
  const cx = Math.floor(wx);
  const cz = Math.floor(wz);
  let best = SHORE_DIST_MAX;
  for (let ix = cx - SHORE_SCAN_R; ix <= cx + SHORE_SCAN_R; ix++) {
    for (let iz = cz - SHORE_SCAN_R; iz <= cz + SHORE_SCAN_R; iz++) {
      if (!isLand(ix, iz)) continue;
      const dx = wx - (ix + 0.5);
      const dz = wz - (iz + 0.5);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
    }
  }
  return best;
}

function smooth01(x) {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  return u * u * (3 - 2 * u);
}

let mistTexture = null;
function getMistTexture() {
  if (mistTexture) return mistTexture;
  const c = document.createElement('canvas');
  c.width = c.height = MIST_TEX_SIZE;
  const g = c.getContext('2d');
  const half = MIST_TEX_SIZE / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, MIST_TEX_SIZE, MIST_TEX_SIZE);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (mistTexture = tex);
}

function updateMistGroup(group, t) {
  const kids = group.children;
  for (let i = 0; i < kids.length; i++) {
    const s = kids[i];
    const d = s.userData.mist;
    const frac = (t / MIST_LOOP_S + d.phase) % 1;
    const fadeIn = smooth01(frac / MIST_IN_END);
    const fadeOut = 1 - smooth01((frac - MIST_OUT_START) / (1 - MIST_OUT_START));
    s.material.opacity = MIST_OPACITY * fadeIn * fadeOut;
    const scale = MIST_SCALE_MIN + (MIST_SCALE_MAX - MIST_SCALE_MIN) * frac;
    s.scale.set(scale, scale, 1);
    s.position.set(
      d.x + Math.sin(t * MIST_DRIFT_SPEED * d.drift + d.spin) * MIST_DRIFT_AMP,
      frac * MIST_RISE * MIST_LOOP_S,
      d.z + Math.cos(t * MIST_DRIFT_SPEED * d.drift * 0.83 + d.spin) * MIST_DRIFT_AMP
    );
  }
}

// ---------------------------------------------------------------------------
// API

// Advances the single shared clock and breathes the mist. Called once per
// frame from main; everything water-animated hangs off this.
function update(dt) {
  const step = dt > 0 ? Math.min(dt, DT_CLAMP) : 0;
  uTime.value += step;
  const t = uTime.value;
  for (const g of mists) g.userData.update(t);
}

// Toon water plane for ponds, harbors, seas. Opaque, fogged, ACES-output.
// - width/depth: plane extent in world units; level: surface height (y).
// - origin {x,z}: world-space CENTER of the plane. The mesh is positioned at
//   (origin.x, level, origin.z) and shore distances are baked in world space.
// - isLand(x, z): queried with INTEGER world cell coords (same convention as
//   world.js isGround); return true where there is land. Omit for open water
//   (no shore foam).
// - segments: vertices per unit (1 reads fine at this scale; auto-coarsens
//   above MAX_SURF_VERTS).
function makeSurface({ width, depth, level = 0, isLand = null, segments = 1, origin = { x: 0, z: 0 } }) {
  let wSeg = Math.max(1, Math.round(width * segments));
  let dSeg = Math.max(1, Math.round(depth * segments));
  while ((wSeg + 1) * (dSeg + 1) > MAX_SURF_VERTS && (wSeg > 1 || dSeg > 1)) {
    wSeg = Math.max(1, Math.ceil(wSeg / 2));
    dSeg = Math.max(1, Math.ceil(dSeg / 2));
  }
  const geo = new THREE.PlaneGeometry(width, depth, wSeg, dSeg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const shore = new Float32Array(pos.count);
  if (typeof isLand === 'function') {
    for (let i = 0; i < pos.count; i++) {
      shore[i] = shoreDistance(isLand, origin.x + pos.getX(i), origin.z + pos.getZ(i));
    }
  } else {
    shore.fill(SHORE_DIST_MAX);
  }
  geo.setAttribute('aShoreDist', new THREE.BufferAttribute(shore, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: waterUniforms({
      uTime,
      uBody: { value: new THREE.Color(SURF_BODY) },
      uDeep: { value: new THREE.Color(SURF_DEEP) },
      uFoam: { value: new THREE.Color(SURF_FOAM) },
    }),
    vertexShader: SURF_VERT,
    fragmentShader: SURF_FRAG,
    transparent: false,
    depthWrite: true,
    fog: true,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water-surface';
  mesh.position.set(origin.x, level, origin.z);
  return mesh;
}

// Waterfall sheet: beveled 1×4-segment plane hung from `top` (a Vector3 at
// the lip center), facing `facing` radians of yaw (local +z faces outward).
function makeWaterfall({ top, height, width, facing = 0 }) {
  const geo = new THREE.PlaneGeometry(width, height, 1, FALL_SEG_Y);
  geo.translate(0, -height / 2, 0); // lip at local y = 0, base at -height
  const rh = height / FALL_SEG_Y;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -rh * 0.5) pos.setZ(i, pos.getZ(i) - FALL_BEVEL_LIP);
    else if (y > -rh * 1.5) pos.setZ(i, pos.getZ(i) - FALL_BEVEL_MID);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: waterUniforms({
      uTime,
      uBody: { value: new THREE.Color(FALL_BODY) },
      uFoam: { value: new THREE.Color(FALL_FOAM) },
    }),
    vertexShader: FALL_VERT,
    fragmentShader: FALL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water-waterfall';
  if (top) mesh.position.copy(top);
  mesh.rotation.y = facing;
  return mesh;
}

// Soft additive mist billboards on slow individual rise loops. The registry
// drives them through water.update — no caller work.
function makeMist({ position, radius = 2.5, count = 8 } = {}) {
  const group = new THREE.Group();
  group.name = 'water-mist';
  if (position) group.position.copy(position);
  const n = Math.max(1, Math.min(count, MIST_COUNT_MAX));
  const tex = getMistTexture();
  for (let i = 0; i < n; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      color: MIST_TINT,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    }));
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    sprite.userData.mist = {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      phase: (i + Math.random() * 0.5) / n,
      spin: Math.random() * Math.PI * 2,
      drift: 0.7 + Math.random() * 0.6,
    };
    sprite.renderOrder = MIST_RENDER_ORDER;
    group.add(sprite);
  }
  group.userData.update = (t) => updateMistGroup(group, t);
  updateMistGroup(group, uTime.value);
  mists.add(group);
  return group;
}

// Unregisters and disposes anything the makers above returned. Sprites keep
// their geometry (three shares one across ALL sprites) and the mist texture
// is a module singleton — neither is disposed here.
function dispose(obj) {
  if (!obj) return;
  mists.delete(obj);
  obj.traverse((node) => {
    if (node.isSprite) {
      node.material.dispose();
      return;
    }
    if (node.geometry) node.geometry.dispose();
    if (node.material) node.material.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
}

export const water = { update, makeSurface, makeWaterfall, makeMist, dispose };
