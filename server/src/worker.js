// Buildle shared-plaza backend.
// One Durable Object (IslandDO, SQLite storage) holds the whole world; the
// Worker routes every /api/* request to the single 'plaza' instance.

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

// Built once at module scope (cold-start cost only).
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const MS_PER_DAY = 86400000;
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / MS_PER_DAY); // BUILDLE epoch (prompts.js)
const dayNumber = (ms) => Math.floor(ms / MS_PER_DAY) - EPOCH_DAY + 1;

const BUDGET_CAP = 40;
const REGEN_SECONDS = 20; // +1 budget per 20s
const PLACE_COST = 1;
const REMOVE_COST = 3;
const MAX_OPS = 24;
const NOTE_MAX = 140;
const NAME_MAX = 16;
const DELTA_LIMIT = 500;
const HELLO_PER_HOUR = 30;
const FALLBACK_NAME = 'wanderer';

// Plaza bounds (LOCAL coords): x,z in [-32,31], y in [0,31].
const MIN_XZ = -32, MAX_XZ = 31, MIN_Y = 0, MAX_Y = 31;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

const enc = new TextEncoder();

function hex(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

const hmacKeys = new Map(); // secret -> CryptoKey
async function hmacHex(secret, msg) {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    hmacKeys.set(secret, key);
  }
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function cleanName(raw) {
  if (typeof raw !== 'string') return FALLBACK_NAME;
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) return FALLBACK_NAME;
  if (matcher.hasMatch(name)) return FALLBACK_NAME;
  return name;
}

// --- hello throttle: max 30/hour/IP, in-memory (per isolate, fine per contract) ---
const helloHits = new Map(); // ip -> [timestamps]
function helloThrottled(ip) {
  const now = Date.now();
  const cutoff = now - 3600000;
  let hits = helloHits.get(ip);
  if (!hits) helloHits.set(ip, (hits = []));
  while (hits.length && hits[0] < cutoff) hits.shift();
  if (hits.length >= HELLO_PER_HOUR) return true;
  hits.push(now);
  if (helloHits.size > 20000) {
    for (const [k, v] of helloHits) if (!v.length || v[v.length - 1] < cutoff) helloHits.delete(k);
  }
  return false;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    if (url.pathname === '/api/hello' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (helloThrottled(ip)) return json({ error: 'slow down' }, 429);
    }
    const stub = env.PLAZA.get(env.PLAZA.idFromName('plaza'));
    return stub.fetch(request);
  },
};

export class IslandDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS blocks(k TEXT PRIMARY KEY, c INTEGER, m TEXT, n TEXT);
        CREATE TABLE IF NOT EXISTS edits(v INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER, ts INTEGER, p TEXT, x INTEGER, y INTEGER, z INTEGER, c INTEGER, m TEXT, n TEXT);
        CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, name TEXT, budget REAL, budget_ts INTEGER, created INTEGER);
        CREATE TABLE IF NOT EXISTS protectedcols(k TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS protectedblocks(k TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS archive(day INTEGER PRIMARY KEY, blob TEXT);
      `);
      // In-memory cache of meta (DO is single-threaded; write-through below).
      this._version = Number(this.getMeta('version') ?? this.setMeta('version', 0));
      this._seeded = Number(this.getMeta('seeded') ?? this.setMeta('seeded', 0));
      this._day = Number(this.getMeta('day') ?? this.setMeta('day', dayNumber(Date.now())));
      this._dayStartVersion = Number(
        this.getMeta('dayStartVersion') ?? this.setMeta('dayStartVersion', this._version),
      );
      if ((await ctx.storage.getAlarm()) === null) await this.scheduleNextAlarm();
    });
  }

  getMeta(key) {
    const rows = this.sql.exec('SELECT value FROM meta WHERE key = ?', key).toArray();
    return rows.length ? rows[0].value : undefined;
  }

  setMeta(key, value) {
    this.sql.exec(
      'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key, String(value),
    );
    return String(value);
  }

  setVersion(v) { this._version = v; this.setMeta('version', v); }

  async scheduleNextAlarm() {
    // Next UTC midnight (+250ms so we never fire a hair before the boundary).
    const next = (Math.floor(Date.now() / MS_PER_DAY) + 1) * MS_PER_DAY + 250;
    await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    this.ensureDay();
    await this.scheduleNextAlarm();
  }

  // Daily reset. Runs from the alarm, and lazily on every request so a missed
  // alarm can never serve yesterday's world.
  ensureDay() {
    const cur = dayNumber(Date.now());
    if (cur === this._day) return;
    const closing = this._day;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'INSERT INTO archive(day, blob) VALUES(?, ?) ON CONFLICT(day) DO UPDATE SET blob = excluded.blob',
        closing, JSON.stringify(this.readBlocks()),
      );
      this.sql.exec('DELETE FROM blocks');
      this.sql.exec('DELETE FROM edits');
      this.sql.exec('DELETE FROM protectedcols');
      this.sql.exec('DELETE FROM protectedblocks');
      this._seeded = 0; this.setMeta('seeded', 0);
      this._day = cur; this.setMeta('day', cur);
      this._dayStartVersion = this._version; this.setMeta('dayStartVersion', this._version);
    });
  }

  readBlocks() {
    const out = {};
    for (const row of this.sql.exec('SELECT k, c, m, n FROM blocks')) {
      const entry = { c: row.c };
      if (row.m) entry.m = row.m;
      if (row.n) entry.n = row.n;
      out[row.k] = entry;
    }
    return out;
  }

  async verify(playerId, token) {
    if (typeof playerId !== 'string' || !/^[0-9a-f]{16}$/.test(playerId)) return false;
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
    const expected = await hmacHex(this.env.TOKEN_SECRET, playerId);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    return diff === 0;
  }

  async fetch(request) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      this.ensureDay();
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      if (path === '/api/hello' && method === 'POST') return await this.hello(request);
      if (path === '/api/world' && method === 'GET') return this.world();
      if (path === '/api/delta' && method === 'GET') return this.delta(url);
      if (path === '/api/edits' && method === 'POST') return await this.edits(request);
      if (path === '/api/seed' && method === 'POST') return await this.seed(request);
      if (path === '/api/name' && method === 'POST') return await this.name(request);
      const m = path.match(/^\/api\/archive\/(-?\d+)$/);
      if (m && method === 'GET') return this.archiveDay(Number(m[1]));
      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'internal error' }, 500);
    }
  }

  // 1. POST /api/hello {deviceId, name?}
  async hello(request) {
    const body = await readJson(request);
    const deviceId = body && typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!deviceId || deviceId.length > 256) return json({ error: 'bad deviceId' }, 400);
    const secret = this.env.TOKEN_SECRET;
    const playerId = (await sha256Hex(deviceId + secret)).slice(0, 16);
    const token = await hmacHex(secret, playerId);
    const now = Date.now();
    const existing = this.sql.exec('SELECT id FROM players WHERE id = ?', playerId).toArray();
    if (!existing.length) {
      this.sql.exec(
        'INSERT INTO players(id, name, budget, budget_ts, created) VALUES(?, ?, ?, ?, ?)',
        playerId, cleanName(body.name), BUDGET_CAP, now, now,
      );
    } else if (body.name !== undefined) {
      this.sql.exec('UPDATE players SET name = ? WHERE id = ?', cleanName(body.name), playerId);
    }
    return json({
      playerId, token, day: this._day, version: this._version, seeded: this._seeded === 1,
    });
  }

  // 2. GET /api/world
  world() {
    return json({
      day: this._day,
      version: this._version,
      seeded: this._seeded === 1,
      blocks: this.readBlocks(),
      protectedColumns: this.sql.exec('SELECT k FROM protectedcols').toArray().map((r) => r.k),
      protectedBlocks: this.sql.exec('SELECT k FROM protectedblocks').toArray().map((r) => r.k),
    });
  }

  // 3. GET /api/delta?since=V
  delta(url) {
    const day = this._day;
    const version = this._version;
    const since = Number(url.searchParams.get('since'));
    const resync = () => json({ resync: true, day, version });
    // Pre-rollover state, garbage, or from-the-future => full resync.
    if (!Number.isInteger(since) || since < this._dayStartVersion || since > version) return resync();
    if (since === version) return json({ day, version, edits: [] });
    const rows = this.sql.exec(
      'SELECT v, x, y, z, c, m, n, p FROM edits WHERE v > ? ORDER BY v ASC LIMIT ?',
      since, DELTA_LIMIT,
    ).toArray();
    // Gap before the first retained edit (rollover or the seed's version bump
    // sits between since and the log) => resync.
    if (!rows.length || rows[0].v !== since + 1) return resync();
    const edits = rows.map((r) => {
      const e = { v: r.v, x: r.x, y: r.y, z: r.z, c: r.c === null ? null : r.c, p: r.p };
      if (r.m) e.m = r.m;
      if (r.n) e.n = r.n;
      return e;
    });
    // When LIMIT truncates, report the last delivered v so clients keep paging.
    return json({ day, version: edits[edits.length - 1].v, edits });
  }

  // 4. POST /api/edits {playerId, token, ops}
  async edits(request) {
    const body = await readJson(request);
    if (!body) return json({ error: 'bad request' }, 400);
    if (!(await this.verify(body.playerId, body.token))) {
      return json({ error: 'unauthorized' }, 401);
    }
    const ops = body.ops;
    if (!Array.isArray(ops) || ops.length < 1 || ops.length > MAX_OPS) {
      return json({ error: 'bad ops' }, 400);
    }
    const playerId = body.playerId;
    const now = Date.now();
    let player = this.sql.exec(
      'SELECT name, budget, budget_ts FROM players WHERE id = ?', playerId,
    ).toArray()[0];
    if (!player) {
      // Valid token but no record (shouldn't happen via hello; heal anyway).
      this.sql.exec(
        'INSERT INTO players(id, name, budget, budget_ts, created) VALUES(?, ?, ?, ?, ?)',
        playerId, FALLBACK_NAME, BUDGET_CAP, now, now,
      );
      player = { name: FALLBACK_NAME, budget: BUDGET_CAP, budget_ts: now };
    }
    // Lazy regen: +1 per 20s, capped.
    let budget = Math.min(
      BUDGET_CAP,
      player.budget + Math.max(0, now - player.budget_ts) / 1000 / REGEN_SECONDS,
    );
    const playerName = player.name || FALLBACK_NAME;
    const day = this._day;
    let version = this._version;
    const results = [];
    this.ctx.storage.transactionSync(() => {
      for (const op of ops) {
        const r = (() => {
          if (!op || typeof op !== 'object') return { ok: false, reason: 'bounds' };
          const { x, y, z } = op;
          const isRemoval = op.c === null || op.c === undefined;
          // 1) bounds (strict integer types; placements need an integer color)
          if (
            !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) ||
            x < MIN_XZ || x > MAX_XZ || z < MIN_XZ || z > MAX_XZ || y < MIN_Y || y > MAX_Y ||
            (!isRemoval && (!Number.isInteger(op.c) || op.c < 0 || op.c > 4095))
          ) return { ok: false, reason: 'bounds' };
          const k = `${x},${y},${z}`;
          // 2) protection
          if (!isRemoval && this.sql.exec(
            'SELECT 1 FROM protectedcols WHERE k = ?', `${x},${z}`,
          ).toArray().length) return { ok: false, reason: 'protected' };
          if (isRemoval && this.sql.exec(
            'SELECT 1 FROM protectedblocks WHERE k = ?', k,
          ).toArray().length) return { ok: false, reason: 'protected' };
          // 3) occupancy
          const occupied = this.sql.exec('SELECT 1 FROM blocks WHERE k = ?', k).toArray().length > 0;
          if (!isRemoval && occupied) return { ok: false, reason: 'occupied' };
          if (isRemoval && !occupied) return { ok: false, reason: 'missing' };
          // 4) budget
          const cost = isRemoval ? REMOVE_COST : PLACE_COST;
          if (budget < cost) return { ok: false, reason: 'budget' };
          budget -= cost;
          version += 1;
          if (isRemoval) {
            this.sql.exec('DELETE FROM blocks WHERE k = ?', k);
            this.sql.exec(
              'INSERT INTO edits(v, day, ts, p, x, y, z, c, m, n) VALUES(?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)',
              version, day, now, playerId, x, y, z,
            );
          } else {
            // Note: trim to 140 chars; if it trips the filter the block lands plain.
            let note = null;
            if (typeof op.m === 'string') {
              const t = op.m.trim().slice(0, NOTE_MAX);
              if (t && !matcher.hasMatch(t)) note = t;
            }
            this.sql.exec(
              'INSERT INTO blocks(k, c, m, n) VALUES(?, ?, ?, ?)', k, op.c, note, playerName,
            );
            this.sql.exec(
              'INSERT INTO edits(v, day, ts, p, x, y, z, c, m, n) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              version, day, now, playerId, x, y, z, op.c, note, playerName,
            );
          }
          return { ok: true };
        })();
        results.push(r);
      }
      if (version !== this._version) this.setVersion(version);
      this.sql.exec(
        'UPDATE players SET budget = ?, budget_ts = ? WHERE id = ?', budget, now, playerId,
      );
    });
    return json({ version, budget: Math.round(budget * 1000) / 1000, results });
  }

  // 5. POST /api/seed {blocks, protectedColumns, protectedBlocks}
  async seed(request) {
    const body = await readJson(request);
    if (!body || typeof body.blocks !== 'object' || body.blocks === null) {
      return json({ error: 'bad seed' }, 400);
    }
    const empty = this.sql.exec('SELECT COUNT(*) AS n FROM blocks').one().n === 0;
    if (this._seeded === 1 || !empty) return json({ ok: false });
    let version;
    this.ctx.storage.transactionSync(() => {
      for (const [k, entry] of Object.entries(body.blocks)) {
        if (!/^-?\d+,-?\d+,-?\d+$/.test(k)) continue;
        if (!entry || !Number.isInteger(entry.c)) continue;
        const m = typeof entry.m === 'string' ? entry.m.slice(0, NOTE_MAX) : null;
        const n = typeof entry.n === 'string' ? entry.n.slice(0, NAME_MAX) : null;
        this.sql.exec('INSERT OR REPLACE INTO blocks(k, c, m, n) VALUES(?, ?, ?, ?)', k, entry.c, m, n);
      }
      if (Array.isArray(body.protectedColumns)) {
        for (const k of body.protectedColumns) {
          if (typeof k === 'string') this.sql.exec('INSERT OR IGNORE INTO protectedcols(k) VALUES(?)', k);
        }
      }
      if (Array.isArray(body.protectedBlocks)) {
        for (const k of body.protectedBlocks) {
          if (typeof k === 'string') this.sql.exec('INSERT OR IGNORE INTO protectedblocks(k) VALUES(?)', k);
        }
      }
      // Seeded blocks skip the edit log but bump version by exactly 1.
      version = this._version + 1;
      this.setVersion(version);
      this._seeded = 1; this.setMeta('seeded', 1);
    });
    return json({ ok: true, version });
  }

  // 6. POST /api/name {playerId, token, name}
  async name(request) {
    const body = await readJson(request);
    if (!body) return json({ error: 'bad request' }, 400);
    if (!(await this.verify(body.playerId, body.token))) {
      return json({ error: 'unauthorized' }, 401);
    }
    const name = cleanName(body.name);
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO players(id, name, budget, budget_ts, created) VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      body.playerId, name, BUDGET_CAP, now, now,
    );
    return json({ ok: true, name });
  }

  // 7. GET /api/archive/:day
  archiveDay(day) {
    const rows = this.sql.exec('SELECT blob FROM archive WHERE day = ?', day).toArray();
    if (!rows.length) return json({ error: 'not found' }, 404);
    return json({ day, blocks: JSON.parse(rows[0].blob) });
  }
}
