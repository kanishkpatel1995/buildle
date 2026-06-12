// sync.js — polled sync adapter for the shared plaza (the PINNED API CONTRACT).
// Dormant until an API base is set in localStorage('buildle_api_v1'): while
// inactive every method is a safe no-op and the game stays pure-local.
//
// Owns: identity (hello), the snapshot/seed handshake, the 12s delta poll,
// and the debounced local op queue with rollback-on-denial. Does NOT touch
// world.onChange — main.js owns that.

import { plazaSeedPayload } from './world.js';
import { getDayNumber } from './prompts.js';

// ── constants ────────────────────────────────────────────────────────────────

const DEFAULT_API = '';
const API_KEY = 'buildle_api_v1';
const DEVICE_KEY = 'buildle_device_v1';

const POLL_S = 12;                          // delta poll cadence
const JITTER_S = 3;                         // + random 0..3s per poll
const DEBOUNCE_MS = 250;                    // local op queue debounce
const MAX_OPS = 24;                         // contract cap per /api/edits request
const BACKOFF_MS = [10000, 30000, 60000];   // retry ladder — capped, forever
const COOKIE_MAX_AGE_S = 31536000;          // one year

// ── small helpers ────────────────────────────────────────────────────────────

function lsGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function lsSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

function cookieGet(name) {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

function cookieSet(name, value) {
  try {
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; max-age=' + COOKIE_MAX_AGE_S + '; path=/; SameSite=Lax';
  } catch { /* cookies disabled */ }
}

// Stable per-browser identity: localStorage first, cookie fallback, else a
// fresh UUID — always re-mirrored to both stores for resilience.
function getDeviceId() {
  const id = lsGet(DEVICE_KEY) || cookieGet(DEVICE_KEY) || crypto.randomUUID();
  lsSet(DEVICE_KEY, id);
  cookieSet(DEVICE_KEY, id);
  return id;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (n) => BACKOFF_MS[Math.min(n, BACKOFF_MS.length - 1)];

// ── the adapter ──────────────────────────────────────────────────────────────

export function createSync({ world, getName, onRemoteEdit, onDenied, onDay, onStatus }) {
  const base = (lsGet(API_KEY) || DEFAULT_API).replace(/\/+$/, '');
  const active = base !== '';

  let playerId = null;
  let token = null;
  let version = 0;                // delta cursor — server's monotonic edit id
  let day = getDayNumber();       // server-reported day overrides on first contact
  let status = '';

  let started = false;            // start() was called
  let ready = false;              // snapshot loaded — polling allowed
  let startFailures = 0;

  let pollTimer = 0;
  let polling = false;
  let pollFailures = 0;

  // Local op queue: each entry pairs the wire op with its rollback record.
  const queue = [];               // [{op:{x,y,z,c|null,m?}, undo:{kind,prevEntry?}}]
  let debounceTimer = 0;
  let sendRetryTimer = 0;
  let sending = false;
  let sendFailures = 0;
  let epoch = 0;                  // bumped per snapshot load; stale results skip rollback

  function setStatus(next) {
    if (next === status) return;
    status = next;
    if (onStatus) onStatus(next);
  }

  function noteDay(d) {
    if (typeof d !== 'number' || d === day) return;
    day = d;
    if (onDay) onDay(d);
  }

  async function request(path, body, keepalive = false) {
    const init = body === undefined
      ? { method: 'GET' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          keepalive,
        };
    const res = await fetch(base + path, init);
    if (!res.ok) {
      const err = new Error('http ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function hello() {
    const body = { deviceId: getDeviceId() };
    const name = getName ? getName() : '';
    if (typeof name === 'string' && name.trim()) body.name = name.trim();
    const resp = await request('/api/hello', body);
    playerId = resp.playerId;
    token = resp.token;
    noteDay(resp.day);
    return resp;
  }

  // A full snapshot is truth: pending local intents are dropped (they may
  // contradict it) and in-flight edit results are barred from rolling back
  // against the freshly loaded world (epoch guard).
  function applySnapshot(snap) {
    queue.length = 0;
    clearTimeout(debounceTimer);
    debounceTimer = 0;
    epoch++;
    world.load(snap.blocks);
    version = snap.version;
    noteDay(snap.day);
  }

  // hello → snapshot (seeding if needed) → begin polling. Never throws:
  // failures report 'offline' and retry on the backoff ladder forever.
  async function start() {
    if (!active || started) return;
    started = true;
    for (;;) {
      try {
        await hello();
        let snap = await request('/api/world');
        if (!snap.seeded) {
          // The payload is deterministic — losing the seeding race is harmless,
          // so the {ok:false} response is deliberately ignored.
          await request('/api/seed', plazaSeedPayload());
          snap = await request('/api/world');
        }
        applySnapshot(snap);
        ready = true;
        startFailures = 0;
        setStatus('live');
        schedulePoll();
        return;
      } catch {
        setStatus('offline');
        await sleep(backoff(startFailures++));
      }
    }
  }

  // ── polling ────────────────────────────────────────────────────────────────

  function schedulePoll(delayMs) {
    clearTimeout(pollTimer);
    const wait = delayMs !== undefined ? delayMs : (POLL_S + Math.random() * JITTER_S) * 1000;
    pollTimer = setTimeout(pollNow, wait);
  }

  async function pollNow() {
    if (!ready || polling) return;
    if (document.hidden) { schedulePoll(); return; }   // visibilitychange re-polls
    polling = true;
    try {
      const resp = await request('/api/delta?since=' + version);
      if (resp.resync) {
        applySnapshot(await request('/api/world'));
      } else {
        applyEdits(resp.edits);
        if (typeof resp.version === 'number' && resp.version > version) version = resp.version;
        noteDay(resp.day);
      }
      pollFailures = 0;
      setStatus('live');
      schedulePoll();
    } catch {
      setStatus('offline');
      schedulePoll(backoff(pollFailures++));
    } finally {
      polling = false;
    }
  }

  function applyEdits(edits) {
    if (!Array.isArray(edits)) return;
    for (const e of edits) {                  // contract: ordered by v ascending
      if (!e || e.p === playerId) continue;   // own edits were applied locally
      if (e.c === null) {
        world.remove(e.x, e.y, e.z);          // false = already gone; fine
      } else {
        const extra = {};
        if (typeof e.m === 'string' && e.m) extra.m = e.m;
        if (typeof e.n === 'string' && e.n) extra.n = e.n;
        // false = occupied by a local unacked block; the next snapshot reconciles
        if (world.forcePlace(e.x, e.y, e.z, e.c, extra) && onRemoteEdit) {
          onRemoteEdit(e.y, e.c);
        }
      }
    }
  }

  // ── local op queue ─────────────────────────────────────────────────────────

  function armSend() {
    clearTimeout(debounceTimer);
    if (queue.length >= MAX_OPS) {
      debounceTimer = 0;
      sendQueue();
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = 0;
      sendQueue();
    }, DEBOUNCE_MS);
  }

  function sendPlace(x, y, z, c, extra) {
    if (!active) return;
    const op = { x, y, z, c };
    if (extra && typeof extra.m === 'string' && extra.m) op.m = extra.m;
    queue.push({ op, undo: { kind: 'place' } });
    armSend();
  }

  function sendRemove(x, y, z, prevEntry) {
    if (!active) return;
    queue.push({ op: { x, y, z, c: null }, undo: { kind: 'remove', prevEntry } });
    armSend();
  }

  async function sendQueue(keepalive = false) {
    if (!active || sending || !token || queue.length === 0) return;
    clearTimeout(sendRetryTimer);
    sendRetryTimer = 0;
    sending = true;
    try {
      while (queue.length > 0) {
        const batch = queue.slice(0, MAX_OPS);
        const ops = batch.map((b) => b.op);
        const sentEpoch = epoch;
        let resp;
        try {
          resp = await request('/api/edits', { playerId, token, ops }, keepalive);
        } catch (err) {
          if (err && err.status === 401) {
            await hello();   // secret rotated — refresh identity once, resend
            resp = await request('/api/edits', { playerId, token, ops }, keepalive);
          } else {
            throw err;       // network/server trouble — keep ops queued, back off
          }
        }
        queue.splice(0, batch.length);
        if (typeof resp.version === 'number' && resp.version > version) version = resp.version;
        const results = Array.isArray(resp.results) ? resp.results : [];
        for (let i = 0; i < batch.length; i++) {
          const r = results[i];
          if (!r || r.ok) continue;   // a missing result is trusted as landed
          if (sentEpoch === epoch) rollback(batch[i]);
          if (onDenied) onDenied(r.reason || 'rejected');
        }
      }
      sendFailures = 0;
      setStatus('live');
    } catch {
      setStatus('offline');
      clearTimeout(sendRetryTimer);
      sendRetryTimer = setTimeout(() => {
        sendRetryTimer = 0;
        sendQueue();
      }, backoff(sendFailures++));
    } finally {
      sending = false;
    }
  }

  function rollback({ op, undo }) {
    if (undo.kind === 'place') {
      world.remove(op.x, op.y, op.z);   // denied placement — take it back
    } else if (undo.prevEntry && typeof undo.prevEntry.c === 'number') {
      const extra = {};
      if (undo.prevEntry.m) extra.m = undo.prevEntry.m;
      if (undo.prevEntry.n) extra.n = undo.prevEntry.n;
      world.forcePlace(op.x, op.y, op.z, undo.prevEntry.c, extra);   // restore
    }
  }

  // ── odds & ends ────────────────────────────────────────────────────────────

  function setName(name) {
    if (!active || !token) return;   // pre-hello names ride along in the hello body
    request('/api/name', { playerId, token, name }).catch(() => {});
  }

  function flush() {
    if (!active) return;
    clearTimeout(debounceTimer);
    debounceTimer = 0;
    sendQueue(true).catch(() => {});   // keepalive carries it through pagehide
  }

  if (active && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pollNow();   // catch up the moment the tab returns
    });
  }

  return { active, start, sendPlace, sendRemove, setName, flush };
}
