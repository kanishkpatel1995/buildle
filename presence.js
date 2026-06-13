// presence.js — live wanderers (CONTRACT-W4 §2). See other people walking and
// building around you, in real time. Strictly ADDITIVE and GATED: the room WS
// is per-island and ephemeral; if it can't open (or errors, or the server is
// dead) presence is simply absent and the game plays exactly as solo. Nothing
// in here is ever allowed to throw into gameplay — every socket touchpoint is
// wrapped, and a closed socket retries on a 5/15/30s ladder while still on the
// same island.
//
// Wire shapes (mirror of CONTRACT-W4 §1, the PresenceDO):
//   client→server  {t:'hello', name, body}          once on open
//                  {t:'state', p:[x,y,z], y:yaw, a}  1Hz + on anim change
//   server→client  {t:'world', n, av:[{id,name,body,p,y,a}, …]}  ~1Hz roster
//                  {t:'leave', id}                   a wanderer dropped
// Coordinates are GLOBAL world units (same space as player.position). Remotes
// on other islands are never broadcast to this room, so everyone we render is
// already "here".

import * as THREE from 'three';
import { createCharacter } from './player.js';
import { audio } from './audio.js';

// ── constants ────────────────────────────────────────────────────────────────

const DEFAULT_API = 'https://buildle-api.buildle.workers.dev';
const API_KEY = 'buildle_api_v1';

const SEND_EVERY_MS = 1000;                 // 1Hz state cadence (contract)
const BACKOFF_MS = [5000, 15000, 30000];    // reconnect ladder — capped, forever
const RENDER_DELAY = 1.2;                    // s — render this far in the past

const MAX_AVATARS = 24;                      // hard render cap (server also caps av)
const MAX_LABELS = 8;                        // nearest labels shown at once
const LABEL_NEAR = 20;                       // u — full label opacity within this
const LABEL_FAR = 28;                        // u — label fully faded past this

const JOIN_MS = 500;                         // scale/fade-in on first sight
const LEAVE_MS = 400;                        // fade-out before dispose
const GONE_ROSTERS = 2;                      // missing from this many rosters → leave

// Animation feel — copied from player.js / bot.js so remotes move like locals.
const SPEED_WALK = 0.3;                      // u/s — above this, play the walk swing
const STRIDE = 0.85;
const WALK_SWING = 0.55;
const ARM_SWING = 0.42;
const BOB_AMP = 0.045;
const BREATH_AMP = 0.02;
const BREATH_RATE = 1.7;
const BLINK_EVERY_MIN = 3, BLINK_EVERY_MAX = 6, BLINK_TIME = 0.12;
const REACH_ARM = -2.1;                      // arm raise for the build pose (a===2)
const REACH_RATE = 2.6;                      // build-pose ease (1/s)
const YAW_RATE = 10;                         // facing damping (1/s)
const MOVE_BLEND_RATE = 10;                  // walk/idle blend (1/s)
const LABEL_Y = 2.05;
const LABEL_HEX = '#F7F1E8';                 // Cloud White — same as the player's

const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_BUILD = 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const shortestAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function lsGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

// ── the adapter ──────────────────────────────────────────────────────────────

export function createPresence({ scene, reducedMotion = false }) {
  const base = (lsGet(API_KEY) || DEFAULT_API).replace(/\/+$/, '');
  // base may be http(s); the room speaks ws(s). Empty base ⇒ presence is off.
  const wsBase = base ? base.replace(/^http/i, 'ws') : '';

  // Connection state -----------------------------------------------------------
  let ws = null;
  let island = null;            // the island this socket belongs to
  let helloPayload = null;      // { name, body } sent on (re)open
  let getState = null;          // () => { p:[x,y,z], y:yaw, a }
  let sendTimer = 0;
  let backoffTimer = 0;
  let backoffStep = 0;
  let lastAnim = -1;            // drives the immediate send on anim change
  let totalCount = 0;           // last reported n (the ambient HUD reads this)

  // Remote avatars -------------------------------------------------------------
  // One record per remote id. Records are reused across rosters; the only
  // allocation churn is on join/leave, never per frame. The server never echoes
  // our own entry (CONTRACT §1), so everything in this map is someone else.
  const avatars = new Map();    // id -> record

  // Scratch — update() and the roster handler allocate nothing steady-state.
  const _pos = { x: 0, y: 0, z: 0 };

  // ── connection ──────────────────────────────────────────────────────────────

  // Open the room socket for `island`. Closes any prior socket first (an island
  // change reuses this path), so callers never juggle two rooms. A complete
  // no-op when presence is off or `getState` is missing — never throws.
  function connect(nextIsland, opts) {
    if (!wsBase || !nextIsland || !opts || typeof opts.getState !== 'function') return;
    // Same island, live socket: just refresh identity/state source.
    if (nextIsland === island && ws &&
        (ws.readyState === 0 || ws.readyState === 1)) {
      helloPayload = { name: String(opts.name ?? ''), body: opts.body | 0 };
      getState = opts.getState;
      return;
    }
    teardown(true);             // fade out the previous room's wanderers
    island = nextIsland;
    helloPayload = { name: String(opts.name ?? ''), body: opts.body | 0 };
    getState = opts.getState;
    backoffStep = 0;
    open();
  }

  function open() {
    if (!wsBase || !island) return;
    let sock;
    try {
      sock = new WebSocket(wsBase + '/api/presence?island=' + encodeURIComponent(island));
    } catch {
      scheduleReconnect();      // construction itself can throw (bad URL, CSP)
      return;
    }
    ws = sock;
    try {
      sock.onopen = () => {
        if (sock !== ws) return;
        backoffStep = 0;
        safeSend({ t: 'hello', name: helloPayload.name, body: helloPayload.body });
        sendState();            // first state right away
        clearInterval(sendTimer);
        sendTimer = setInterval(sendState, SEND_EVERY_MS);
      };
      sock.onmessage = (ev) => {
        if (sock !== ws) return;
        onMessage(ev);
      };
      sock.onerror = () => { /* close fires next; nothing to do but stay quiet */ };
      sock.onclose = () => {
        if (sock !== ws) return;
        clearInterval(sendTimer);
        sendTimer = 0;
        lastAnim = -1;
        ws = null;
        // The room is gone: fade out the now-stale wanderers rather than letting
        // them freeze. A reconnect re-spawns whoever's still actually here.
        for (const id of avatars.keys()) beginLeave(id);
        if (island) scheduleReconnect();   // still here → climb the ladder
      };
    } catch {
      // Assigning handlers should never throw, but stay defensive: drop it.
      try { sock.close(); } catch { /* already gone */ }
      ws = null;
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (!island) return;
    clearTimeout(backoffTimer);
    const wait = BACKOFF_MS[Math.min(backoffStep, BACKOFF_MS.length - 1)];
    backoffStep++;
    backoffTimer = setTimeout(() => {
      backoffTimer = 0;
      if (island) open();
    }, wait);
  }

  function safeSend(obj) {
    if (!ws || ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(obj)); } catch { /* socket died mid-send */ }
  }

  function sendState() {
    if (!getState) return;
    let s;
    try { s = getState(); } catch { return; }   // a bad sampler must not kill us
    if (!s || !Array.isArray(s.p)) return;
    const a = s.a | 0;
    lastAnim = a;
    safeSend({ t: 'state', p: [s.p[0], s.p[1], s.p[2]], y: +s.y || 0, a });
  }

  // ── inbound roster ────────────────────────────────────────────────────────

  function onMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }   // ignore non-JSON
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'world') applyRoster(msg);
    else if (msg.t === 'leave') beginLeave(msg.id);
  }

  function applyRoster(msg) {
    if (typeof msg.n === 'number') totalCount = msg.n;
    const av = Array.isArray(msg.av) ? msg.av : [];
    const now = nowS();

    // Mark everyone unseen, then refresh from the roster. Survivors stay; the
    // long-missing fade out (a {leave} usually beats this, but rosters are the
    // backstop the contract names).
    for (const rec of avatars.values()) rec._seen = false;

    for (let i = 0; i < av.length; i++) {
      const e = av[i];
      if (!e || e.id == null) continue;
      if (!Array.isArray(e.p)) continue;
      let rec = avatars.get(e.id);
      if (!rec) {
        if (avatars.size >= MAX_AVATARS) continue;   // hard cap on rendered bodies
        rec = spawn(e.id, e.name, e.body | 0);
        if (!rec) continue;
        seedSamples(rec, e, now);   // anchor the spline so it doesn't lerp from origin
      }
      rec._seen = true;
      rec.missed = 0;
      if (rec.leaving) { rec.leaving = false; rec.leaveT = 0; }   // came back mid-fade
      pushSample(rec, e, now);
      rec.targetAnim = e.a | 0;
    }

    for (const [id, rec] of avatars) {
      if (rec.leaving) continue;
      if (!rec._seen) {
        rec.missed++;
        if (rec.missed >= GONE_ROSTERS) beginLeave(id);
      }
    }
  }

  // Three timestamped snapshots per record drive the cubic spline: s0 (latest),
  // s1 (previous), s2 (the one before). Velocity is never transmitted, so the
  // tangent at each end of the rendered segment [s2 → s1] is the CENTERED
  // finite difference across its neighbours (Catmull-Rom) — a genuine C¹ curve,
  // not the linear collapse a single-secant Hermite would give. Slots are
  // rotated in place: no per-sample allocation.
  function pushSample(rec, e, now) {
    copySample(rec.s2, rec.s1);   // s1 → s2
    copySample(rec.s1, rec.s0);   // s0 → s1
    const next = rec.s0;          // write newest into s0
    next.t = now;
    next.x = e.p[0]; next.y = e.p[1]; next.z = e.p[2];
    next.yaw = +e.y || 0;
  }

  function copySample(dst, src) {
    dst.t = src.t; dst.x = src.x; dst.y = src.y; dst.z = src.z; dst.yaw = src.yaw;
  }

  // First sight: anchor all three samples to the current pose, staggered one
  // send-interval apart, so the spline starts flat (still) instead of lerping
  // in from a stale slot.
  function seedSamples(rec, e, now) {
    const x = e.p[0], y = e.p[1], z = e.p[2], yaw = +e.y || 0;
    const dt = SEND_EVERY_MS / 1000;
    const set = (s, k) => { s.t = now - dt * k; s.x = x; s.y = y; s.z = z; s.yaw = yaw; };
    set(rec.s0, 0); set(rec.s1, 1); set(rec.s2, 2);
    rec.group.position.set(x, y, z);
    rec.yaw = yaw;
    rec.prevX = x; rec.prevZ = z;
  }

  // ── avatar lifecycle ────────────────────────────────────────────────────────

  function spawn(id, name, body) {
    let parts, label, labelTex;
    try {
      parts = createCharacter({ bodyColorIndex: body });
      const built = buildLabel(name);
      label = built.sprite;
      labelTex = built.texture;
    } catch {
      // createCharacter / canvas creation should never fail, but if it does we
      // simply skip this wanderer rather than letting it bubble into the loop.
      return null;
    }
    parts.group.add(label);
    parts.group.scale.setScalar(reducedMotion ? 1 : 0.001);   // grows in on join
    try { scene.add(parts.group); } catch { return null; }

    const rec = {
      id,
      group: parts.group,
      rig: parts.rig,
      legL: parts.legL, legR: parts.legR,
      armL: parts.armL, armR: parts.armR,
      body: parts.body,
      eyeL: parts.eyeL, eyeR: parts.eyeR,
      label, labelTex,
      // interpolation ring: s0 = latest, s1 = previous, s2 = the one before
      s0: { t: 0, x: 0, y: 0, z: 0, yaw: 0 },
      s1: { t: 0, x: 0, y: 0, z: 0, yaw: 0 },
      s2: { t: 0, x: 0, y: 0, z: 0, yaw: 0 },
      yaw: 0,
      prevX: 0, prevZ: 0,       // for per-frame speed (label/anim), reused
      phase: 0,
      moveBlend: 0,
      reachBlend: 0,
      targetAnim: ANIM_IDLE,
      blinkT: BLINK_EVERY_MIN + Math.random() * (BLINK_EVERY_MAX - BLINK_EVERY_MIN),
      missed: 0,
      _seen: true,
      // join/leave envelope: appear 0→1 over JOIN_MS, leave 1→0 over LEAVE_MS
      appear: reducedMotion ? 1 : 0,
      leaving: false,
      leaveT: 0,
    };
    avatars.set(id, rec);
    if (!reducedMotion) { try { audio.ui(); } catch { /* audio off */ } }
    return rec;
  }

  function beginLeave(id) {
    const rec = avatars.get(id);
    if (!rec || rec.leaving) return;
    rec.leaving = true;
    rec.leaveT = 0;
    if (reducedMotion) dispose(rec);   // no fade — drop immediately
  }

  // Dispose only what THIS avatar created: every geometry/material made inside
  // createCharacter, plus the label sprite's material and canvas texture.
  function dispose(rec) {
    avatars.delete(rec.id);
    try { scene.remove(rec.group); } catch { /* not in scene */ }
    try {
      rec.group.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
      });
      if (rec.label && rec.label.material) rec.label.material.dispose();
      if (rec.labelTex) rec.labelTex.dispose();
    } catch { /* best-effort cleanup; never throw */ }
  }

  function buildLabel(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false,
    }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = LABEL_Y;
    const clean = String(name ?? '').trim() || 'wanderer';
    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 128);
      let size = 56;            // 28px at the canvas's 2x resolution
      ctx.font = `600 ${size}px Nunito, sans-serif`;
      const w = ctx.measureText(clean).width;
      if (w > 460) {
        size = Math.max(22, Math.floor((size * 460) / w));
        ctx.font = `600 ${size}px Nunito, sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(43, 45, 58, 0.55)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = LABEL_HEX;
      ctx.fillText(clean, 256, 66);
      texture.needsUpdate = true;
    };
    draw();
    if (document.fonts) document.fonts.ready.then(draw).catch(() => {});
    return { sprite, texture };
  }

  // ── per-frame update ─────────────────────────────────────────────────────────

  // Interpolate + animate every remote. Allocation-free: interpolated positions
  // land in the shared _pos scratch; the player's camera is never touched here.
  function update(dt, t) {
    if (avatars.size === 0) return;
    const renderT = nowS() - RENDER_DELAY;

    // One getState() call per frame does double duty: it's the proximity anchor
    // for label ranging (presence has no camera handle, so we use the same
    // source we send from), AND it lets us fire an immediate state send the
    // moment the anim flips (idle⇄walk⇄build) so stops/starts read crisply
    // rather than waiting up to a second for the 1Hz tick. Height never factors
    // into the planar label distance, so only x/z are kept.
    let px = 0, pz = 0, haveAnchor = false;
    if (getState && ws && ws.readyState === 1) {
      let s;
      try { s = getState(); } catch { s = null; }
      if (s && Array.isArray(s.p)) {
        px = s.p[0]; pz = s.p[2]; haveAnchor = true;
        if ((s.a | 0) !== lastAnim) sendState();   // anim changed → push now
      }
    }

    // First pass: animate bodies and record each avatar's planar distance² to us.
    for (const rec of avatars.values()) {
      stepAvatar(rec, dt, t, renderT);
      if (haveAnchor) {
        const dx = rec.group.position.x - px;
        const dz = rec.group.position.z - pz;
        rec._d2 = dx * dx + dz * dz;
      } else {
        rec._d2 = Infinity;
      }
    }

    // Second pass: show the nearest ≤MAX_LABELS inside LABEL_FAR, fade 20→28u.
    applyLabels(haveAnchor);
  }

  function stepAvatar(rec, dt, t, renderT) {
    // ── join / leave envelope ──
    if (rec.leaving) {
      rec.leaveT += dt;
      const k = clamp(rec.leaveT / (LEAVE_MS / 1000), 0, 1);
      rec.appear = 1 - k;
      applyAppear(rec);
      if (k >= 1) { dispose(rec); return; }
    } else if (rec.appear < 1) {
      rec.appear = clamp(rec.appear + dt / (JOIN_MS / 1000), 0, 1);
      applyAppear(rec);
    }

    // ── cubic (Catmull-Rom) position at renderT, ~1.2s in the past ──
    const s0 = rec.s0, s1 = rec.s1, s2 = rec.s2;
    const gp = rec.group.position;
    rec.prevX = gp.x; rec.prevZ = gp.z;     // for this frame's speed estimate

    if (s1.t === 0 || s1.t >= s0.t) {
      // Fewer than two real samples (or degenerate times): hold the latest pose.
      gp.set(s0.x, s0.y, s0.z);
    } else {
      // Catmull-Rom needs four control points p0..p3 around the rendered
      // segment [p1 → p2]; the spline passes through p1 and p2 with tangents
      // (p2-p0)/2 and (p3-p1)/2. Pick which sample-pair brackets renderT. With
      // 1Hz samples and a 1.2s delay renderT normally lands in [s2 → s1];
      // a lagging feed pushes it into [s1 → s0]. Missing slots fall back to a
      // neighbour, which makes the end tangent a one-sided difference (smooth,
      // slightly straighter) instead of throwing.
      let p0, p1, p2, p3;
      if (s2.t === 0 || renderT >= s1.t) {
        p0 = (s2.t === 0) ? s1 : s2; p1 = s1; p2 = s0; p3 = s0;
      } else {
        p0 = s2; p1 = s2; p2 = s1; p3 = s0;
      }
      const span = p2.t - p1.t;
      const u = span > 0 ? clamp((renderT - p1.t) / span, 0, 1.25) : 0;
      catmullRom(p0, p1, p2, p3, u, _pos);
      gp.set(_pos.x, _pos.y, _pos.z);
    }

    // ── speed from the realized frame delta (drives walk swing + facing) ──
    const moved = Math.hypot(gp.x - rec.prevX, gp.z - rec.prevZ);
    const speed = dt > 0 ? moved / dt : 0;

    // ── facing: along travel when walking, else ease toward the sample yaw ──
    let targetYaw = rec.yaw;
    if (speed > SPEED_WALK) {
      targetYaw = Math.atan2(gp.x - rec.prevX, gp.z - rec.prevZ);
    } else if (s0.t !== 0) {
      targetYaw = s0.yaw;
    }
    rec.yaw += shortestAngle(targetYaw - rec.yaw) * (1 - Math.exp(-YAW_RATE * dt));
    rec.group.rotation.y = rec.yaw;

    // Reduced motion: position lerp + facing only — no swing, bob, breath or
    // blink. The body glides as a still pose, which is the calm, motion-safe
    // read the contract asks for.
    if (reducedMotion) return;

    // ── walk swing vs idle, blended (matches player.js / bot.js) ──
    const walking = rec.targetAnim === ANIM_WALK || speed > SPEED_WALK;
    rec.phase += moved * (Math.PI / STRIDE);
    rec.moveBlend += ((walking ? 1 : 0) - rec.moveBlend) * (1 - Math.exp(-MOVE_BLEND_RATE * dt));
    const swing = Math.tanh(Math.sin(rec.phase) * 2.4) * rec.moveBlend;
    rec.legL.rotation.x = swing * WALK_SWING;
    rec.legR.rotation.x = -swing * WALK_SWING;
    rec.armL.rotation.x = -swing * ARM_SWING;

    // ── build/reach pose (a===2): right arm raises, eased in and out ──
    const reaching = rec.targetAnim === ANIM_BUILD ? 1 : 0;
    rec.reachBlend += (reaching - rec.reachBlend) * (1 - Math.exp(-REACH_RATE * dt));
    rec.armR.rotation.x = lerp(swing * ARM_SWING, REACH_ARM, rec.reachBlend);

    // ── walk bob + idle breathing (matches player.js / bot.js) ──
    rec.rig.position.y = Math.abs(Math.sin(rec.phase)) * BOB_AMP * rec.moveBlend;
    const breath = BREATH_AMP * (0.5 + 0.5 * Math.sin(t * BREATH_RATE)) * (1 - rec.moveBlend);
    rec.body.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);

    // ── blink: a quick scale-y squash, the same one the player and gardener share ──
    rec.blinkT -= dt;
    if (rec.blinkT <= -BLINK_TIME) {
      rec.blinkT = BLINK_EVERY_MIN + Math.random() * (BLINK_EVERY_MAX - BLINK_EVERY_MIN);
    }
    const eyeY = rec.blinkT < 0
      ? 1 - 0.88 * Math.sin(Math.PI * (-rec.blinkT / BLINK_TIME))
      : 1;
    rec.eyeL.scale.y = eyeY;
    rec.eyeR.scale.y = eyeY;
  }

  // Cubic Catmull-Rom through p1 and p2, with tangents (p2-p0)/2 and (p3-p1)/2.
  // Written on the Hermite basis so the endpoint tangents come straight from the
  // neighbouring samples — the finite-difference velocity the contract asks for,
  // since velocity is never transmitted. Evaluates all three axes into `out`.
  function catmullRom(p0, p1, p2, p3, u, out) {
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    out.x = h00 * p1.x + h10 * 0.5 * (p2.x - p0.x) + h01 * p2.x + h11 * 0.5 * (p3.x - p1.x);
    out.y = h00 * p1.y + h10 * 0.5 * (p2.y - p0.y) + h01 * p2.y + h11 * 0.5 * (p3.y - p1.y);
    out.z = h00 * p1.z + h10 * 0.5 * (p2.z - p0.z) + h01 * p2.z + h11 * 0.5 * (p3.z - p1.z);
  }

  function applyAppear(rec) {
    const e = rec.appear;
    // ease-out cubic for a soft pop
    const s = reducedMotion ? 1 : (e <= 0 ? 0 : 1 - Math.pow(1 - e, 3));
    rec.group.scale.setScalar(Math.max(0.001, s));
  }

  // Nearest ≤MAX_LABELS labels within LABEL_FAR; opacity fades LABEL_NEAR→LABEL_FAR.
  function applyLabels(haveAnchor) {
    // Hide all first, then re-enable the nearest few. With ≤24 avatars this is a
    // tiny pass; we avoid sorting an array by scanning for the k smallest.
    for (const rec of avatars.values()) {
      rec.label.visible = false;
    }
    if (!haveAnchor) return;
    const far2 = LABEL_FAR * LABEL_FAR;
    // Repeatedly take the nearest not-yet-shown within range (≤MAX_LABELS passes
    // over ≤24 records — cheaper and allocation-free vs. sorting an array).
    for (let pass = 0; pass < MAX_LABELS; pass++) {
      let best = null, bestD2 = far2;
      for (const rec of avatars.values()) {
        if (rec.label.visible || rec.leaving) continue;
        if (rec._d2 < bestD2) { bestD2 = rec._d2; best = rec; }
      }
      if (!best) break;
      best.label.visible = true;
      const d = Math.sqrt(best._d2);
      const fade = clamp((LABEL_FAR - d) / (LABEL_FAR - LABEL_NEAR), 0, 1);
      best.label.material.opacity = fade * best.appear;
    }
  }

  // ── teardown ──────────────────────────────────────────────────────────────

  // Stop the socket and (optionally) fade everyone out. `fade=false` disposes
  // immediately (page teardown); `fade=true` lets the leave envelope play.
  function teardown(fade) {
    clearTimeout(backoffTimer);
    backoffTimer = 0;
    clearInterval(sendTimer);
    sendTimer = 0;
    backoffStep = 0;
    lastAnim = -1;
    const sock = ws;
    ws = null;                  // null first so handlers see sock !== ws and bail
    if (sock) {
      try { sock.onopen = sock.onmessage = sock.onerror = sock.onclose = null; } catch { /* */ }
      try { sock.close(); } catch { /* already closed */ }
    }
    if (fade) {
      for (const id of avatars.keys()) beginLeave(id);
    } else {
      for (const rec of [...avatars.values()]) dispose(rec);
    }
  }

  // Close the room and fade out everyone (island change handled inside connect()).
  function disconnect() {
    island = null;
    teardown(true);
  }

  function nowS() {
    return (typeof performance !== 'undefined' && performance.now
      ? performance.now() : Date.now()) / 1000;
  }

  return {
    connect,
    disconnect,
    update,
    onNote: null,               // settable (y, colorIndex) for remote notes — unused v1
    get count() { return totalCount; },
  };
}
