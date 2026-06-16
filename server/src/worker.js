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

// --- live wanderers (presence) ---
// Room allowlist mirrors the island ids in islands.js (ISLANDS) so an unknown
// ?island= can never spin up a stray room. Kept inline (the Worker has no
// import of the client registry) — keep in step with islands.js.
const PRESENCE_ISLANDS = new Set([
  'plaza', 'gardeners', 'ember-canyon', 'lowtide', 'wicklight',
  'orchard', 'astronomers', 'foundry', 'test-isle',
]);
const PRESENCE_TICK_MS = 1000;   // 1Hz batched roster broadcast
const PRESENCE_SWEEP_MS = 60000; // stale-socket sweep cadence
const PRESENCE_STALE_MS = 90000; // drop sockets silent longer than this
const PRESENCE_AV_CAP = 24;      // most-recently-updated avatars carried in `av`
const PRESENCE_NAME_MAX = 16;    // matches NAME_MAX for the shared world
const PRESENCE_BODY_MAX = 63;    // palette colour index ceiling (generous)

// --- live chat (rides the same per-island presence socket) ---
const CHAT_MAX = 240;            // chars per line after sanitising
const CHAT_RING = 50;            // recent lines replayed to a new arrival
const CHAT_PAGE = 40;            // older lines returned per scroll-up pagination request
// Chat history is kept FOREVER (never pruned) and paged in as the user scrolls up.
const CHAT_WINDOW_MS = 10000;    // rolling rate-limit window
const CHAT_BURST = 8;            // most lines allowed inside that window
const CHAT_GAP_MS = 600;         // floor between two consecutive lines
const CHAT_NEW_MS = 20000;       // probation window for a brand-new socket
const CHAT_NEW_MAX = 3;          // lines allowed during probation
const CHAT_DEDUP_MS = 4000;      // identical line inside this is dropped
const CHAT_KINDS = new Set(['chat', 'build', 'note', 'action']);
const CHAT_REPORT_HIDE = 2;      // distinct reporters needed to shadow-hide a line
// Strip anything that smells like a link (phishing lesson from wplace.live): a
// scheme, a www., or a bare host.tld[/path]. Replaced with a small placeholder.
const CHAT_URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:com|net|org|io|gg|xyz|app|co|me|dev|link|click|live|ru|cn|info|tv|to)\b\S*/gi;

// Collapse whitespace, defang links, clamp length. Returns null when nothing
// printable survives.
function sanitizeChat(raw) {
  if (typeof raw !== 'string') return null;
  let t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  t = t.replace(CHAT_URL_RE, '▢');
  t = t.slice(0, CHAT_MAX).trim();
  return t || null;
}

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

// --- AI build (/api/build): a stateless OpenRouter proxy. The foundry island
// is client-local, so no world state is touched — we just turn a prompt into a
// validated list of blocks for the client to animate into place. ---

// The curated featured lineup (verified live on OpenRouter, 5 labs). Order = list
// order; the first is the cost-safe DEFAULT (free). tier drives the premium cap.
// Players can also search the whole OpenRouter catalog (see modelsList()).
const BUILD_MODELS = [
  { id: 'anthropic/claude-haiku-4.5', label: 'The Sprinter', blurb: 'fast, reliable — a great start', tier: 'cheap' },
  { id: 'anthropic/claude-opus-4.8', label: 'The Architect', blurb: 'frontier polish, rock-solid ✦', tier: 'premium' },
  { id: 'openai/gpt-5.5', label: 'The Showrunner', blurb: 'bold, ambitious layouts', tier: 'premium' },
  { id: 'google/gemini-3.5-flash', label: 'The Speedrunner', blurb: 'builds almost instantly', tier: 'mid' },
  { id: 'x-ai/grok-4.3', label: 'The Wildcard', blurb: 'loose & chaotic — roast it', tier: 'mid' },
  { id: 'qwen/qwen3.7-max', label: 'The Engineer', blurb: 'precise & symmetric (a touch slow)', tier: 'mid' },
  { id: 'openai/gpt-5.4-mini', label: 'The Apprentice', blurb: 'clean, literal & cheap', tier: 'cheap' },
  { id: 'deepseek/deepseek-v4-flash', label: 'The Quick One', blurb: 'tiny, quick & clever', tier: 'cheap' },
  { id: 'qwen/qwen3-coder:free', label: 'The Volunteer', blurb: 'free · sometimes busy', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'The Open One', blurb: 'free · a different flavour', tier: 'free' },
];
const BUILD_MODEL_IDS = new Set(BUILD_MODELS.map((m) => m.id));
const BUILD_MODEL_TIER = new Map(BUILD_MODELS.map((m) => [m.id, m.tier]));
// A model is "premium" (subject to the tighter daily sub-cap) if it's a featured
// premium pick OR anything NOT in the featured cheap/free/mid set — i.e. any
// exotic model chosen via search defaults to the capped tier.
function isPremiumModel(id) {
  const t = BUILD_MODEL_TIER.get(id);
  return t ? t === 'premium' : true;
}
// Accept the featured ids, or any well-formed OpenRouter id (provider/model[:tag])
// chosen via search; anything else falls back to the free default.
function resolveModel(raw) {
  if (typeof raw === 'string') {
    if (BUILD_MODEL_IDS.has(raw)) return raw;
    if (raw.length <= 80 && /^[\w.-]+\/[\w.:-]+$/.test(raw)) return raw;
  }
  return BUILD_MODELS[0].id;
}

// Cached OpenRouter catalog (text-output chat models) for the search picker.
// Refetched at most every ~30 min per isolate; image/audio/embedding skipped.
let _catalog = null;
let _catalogAt = 0;
const CATALOG_TTL_MS = 1800000;
async function openRouterCatalog(env) {
  const now = Date.now();
  if (_catalog && now - _catalogAt < CATALOG_TTL_MS) return _catalog;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } : {},
    });
    if (!res.ok) return _catalog || [];
    const data = await res.json().catch(() => null);
    const list = data && Array.isArray(data.data) ? data.data : [];
    const out = [];
    for (const m of list) {
      const id = typeof m.id === 'string' ? m.id : '';
      if (!id || id.startsWith('~')) continue;   // skip the "-latest" alias rows
      const outMods = m.architecture && Array.isArray(m.architecture.output_modalities)
        ? m.architecture.output_modalities : null;
      if (outMods && !outMods.includes('text')) continue;
      if (/image|audio|tts|embedding|moderation|rerank|whisper|sora/i.test(id)) continue;
      out.push({ id, label: typeof m.name === 'string' ? m.name : id });
    }
    _catalog = out;
    _catalogAt = now;
    return out;
  } catch {
    return _catalog || [];
  }
}

const BUILD_ENVELOPE = 24;        // builds fit in a 24×24×24 box, origin corner (0,0,0)
const BUILD_CENTER = 12;          // builds are centred on x,z = 12 in that box
const BUILD_MAX_OPS = 96;         // primitives the model may emit
const BUILD_MAX_BLOCKS = 600;     // expanded-cell cap (drops the rest; also bounds commit work)
const BUILD_PROMPT_MAX = 200;
const BUILD_TIMEOUT_MS = 45000;
const BUILD_PER_HOUR = 40;        // per-IP, soft (isolate-local) — the real caps are the DO gate
// Persistent daily ceilings (in the plaza DO's SQLite — survive isolate recycling
// and IP/identity rotation), checked BEFORE the paid model call. The global cap
// is the hard bill ceiling; the per-player/per-IP caps bound any one actor.
const BUILD_GLOBAL_DAILY = 3000;  // total model calls/day — the overall ceiling
const BUILD_PREMIUM_DAILY = 300;  // tighter sub-cap on premium/exotic models (the costly ones)
const BUILD_PLAYER_DAILY = 40;    // builds/day per identity
const BUILD_IP_DAILY = 60;        // builds/day per IP (catches identity rotation)
// Committing an AI build into the shared world (the plaza): how many cells one
// build may write, the per-IP daily cell budget (grief cap), and the cooldown.
const BUILD_WORLD_CAP = 180;      // cells one build may commit (≪ the 4096-column floor)
const BUILD_IP_CELLS_DAILY = 1500;// committed cells/day per IP
const BUILD_COMMIT_COOLDOWN_MS = 8000;

// One filled box per op (a single block is 1×1×1) — a uniform shape keeps the
// JSON schema strict-mode friendly and trivial to expand.
const PALETTE_LEGEND =
  '0 cloud white, 1 sandstone, 2 terracotta, 3 rose clay, 4 dusty plum, ' +
  '5 twilight blue, 6 teal lagoon, 7 sage green, 8 olive gold, 9 honey, ' +
  '10 ember orange, 11 brick red, 12 cocoa brown, 13 slate grey, 14 ink black, ' +
  '15 glow lantern (emissive, use sparingly for lights)';

// We use plain JSON mode (json_object) rather than a strict json_schema: strict
// schemas aren't portable across providers (Anthropic rejects maxItems, Gemini's
// compiler chokes on integer-heavy arrays). The shape is pinned by the prompt's
// example instead, and expandOps() clamps every field defensively.
const BUILD_EXAMPLE =
  '{"name":"little tree","ops":[' +
  '{"x":11,"y":0,"z":11,"w":2,"h":4,"d":2,"c":12},' +
  '{"x":9,"y":4,"z":9,"w":6,"h":4,"d":6,"c":7},' +
  '{"x":10,"y":8,"z":10,"w":4,"h":2,"d":4,"c":8}]}';

const buildHits = new Map();
function buildThrottled(ip) {
  const now = Date.now();
  const cutoff = now - 3600000;
  let hits = buildHits.get(ip);
  if (!hits) buildHits.set(ip, (hits = []));
  while (hits.length && hits[0] < cutoff) hits.shift();
  if (hits.length >= BUILD_PER_HOUR) return true;
  hits.push(now);
  if (buildHits.size > 20000) {
    for (const [k, v] of buildHits) if (!v.length || v[v.length - 1] < cutoff) buildHits.delete(k);
  }
  return false;
}

function clampInt(v, lo, hi) {
  v = Math.round(Number(v));
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

// Expand filled-box ops into a deduped cell list (last-write-wins), clamped to
// the build envelope and the block cap.
function expandOps(ops) {
  const cells = new Map();
  const E = BUILD_ENVELOPE - 1;
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const c = clampInt(op.c, 0, 15);
    const x0 = clampInt(op.x, 0, E), y0 = clampInt(op.y, 0, E), z0 = clampInt(op.z, 0, E);
    const w = clampInt(op.w, 1, BUILD_ENVELOPE), h = clampInt(op.h, 1, BUILD_ENVELOPE), d = clampInt(op.d, 1, BUILD_ENVELOPE);
    for (let dx = 0; dx < w; dx++) {
      const x = x0 + dx; if (x > E) break;
      for (let dy = 0; dy < h; dy++) {
        const y = y0 + dy; if (y > E) break;
        for (let dz = 0; dz < d; dz++) {
          const z = z0 + dz; if (z > E) break;
          cells.set(x + ',' + y + ',' + z, [x, y, z, c]);
          if (cells.size >= BUILD_MAX_BLOCKS) break;
        }
        if (cells.size >= BUILD_MAX_BLOCKS) break;
      }
      if (cells.size >= BUILD_MAX_BLOCKS) break;
    }
    if (cells.size >= BUILD_MAX_BLOCKS) break;
  }
  return [...cells.values()];
}

function parseBuildJson(content) {
  if (typeof content !== 'string') return null;
  try { return JSON.parse(content); } catch { /* fall through to brace-scan */ }
  const a = content.indexOf('{');
  const b = content.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(content.slice(a, b + 1)); } catch { /* give up */ }
  }
  return null;
}

// Single OpenRouter call with a timeout. Returns the Response (ok or not), or
// null on network/timeout failure.
async function callModel(env, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUILD_TIMEOUT_MS);
  try {
    return await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://buildle.zonivan.com',
        'X-Title': 'Buildle',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget log of a build attempt to the plaza DO's builds table.
async function logBuild(env, ctx, ip, rec) {
  if (!ctx) return;
  ctx.waitUntil((async () => {
    try {
      rec.iphash = (await sha256Hex(ip + (env.TOKEN_SECRET || ''))).slice(0, 32);
      const stub = env.PLAZA.get(env.PLAZA.idFromName('plaza'));
      await stub.fetch('https://do.internal/internal/log', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec),
      });
    } catch { /* analytics are best-effort, never block a build */ }
  })());
}

async function aiBuild(request, env, ctx) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const country = request.headers.get('CF-IPCountry') || '';
  if (buildThrottled(ip)) return json({ error: 'the foundry is catching its breath — try again soon' }, 429);
  if (!env.OPENROUTER_API_KEY) return json({ error: 'the foundry is offline' }, 503);

  const body = await readJson(request);
  if (!body) return json({ error: 'bad request' }, 400);

  const model = resolveModel(body.model);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 1) return json({ error: 'tell the builder what to make' }, 400);
  if (prompt.length > BUILD_PROMPT_MAX) return json({ error: 'keep the request short and sweet' }, 400);
  if (matcher.hasMatch(prompt)) {
    logBuild(env, ctx, ip, { ts: Date.now(), model, prompt, blocks: 0, ok: false, reason: 'blocked', country });
    return json({ error: "let's keep it kind" }, 400);
  }
  const logResult = (ok, blocks, reason) =>
    logBuild(env, ctx, ip, { ts: Date.now(), model, prompt, blocks, ok, reason, country });

  // Gate the PAID model call behind a valid identity + persistent daily ceilings
  // (global bill cap + per-identity + per-IP), enforced in the plaza DO so they
  // survive isolate recycling and IP/identity rotation. Fails closed.
  const iphash = (await sha256Hex(ip + (env.TOKEN_SECRET || ''))).slice(0, 32);
  try {
    const stub = env.PLAZA.get(env.PLAZA.idFromName('plaza'));
    const gr = await stub.fetch('https://do.internal/internal/buildgate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: body.playerId, token: body.token, iphash, premium: isPremiumModel(model) }),
    });
    const gate = await gr.json().catch(() => null);
    if (!gate || !gate.ok) {
      const reason = (gate && gate.reason) || 'fail';
      logResult(false, 0, 'gate-' + reason);
      if (reason === 'auth') return json({ error: 'reconnecting — try again in a moment' }, 401);
      if (reason === 'busy') return json({ error: 'the foundry hit its limit for today — back tomorrow' }, 429);
      if (reason === 'premium') return json({ error: 'the premium models are resting for today — try a free one' }, 429);
      return json({ error: 'building a lot — give it a little while' }, 429);
    }
  } catch {
    logResult(false, 0, 'gate-err');
    return json({ error: 'the foundry is resting — try again' }, 503);
  }

  const system =
    'You are the foundry builder in Buildle, a cozy golden-hour voxel game. ' +
    'Turn the player\'s request into a small, charming voxel sculpture made of filled boxes.\n' +
    `Coordinates: integers in a ${BUILD_ENVELOPE}x${BUILD_ENVELOPE}x${BUILD_ENVELOPE} box, corner at (0,0,0). ` +
    'y is up; the build rests on the ground at y=0. Center the build horizontally around x,z = 12.\n' +
    `Each op is one filled box: x,y,z is its near-bottom-left corner, w,h,d its size (>=1), c its color. ` +
    'A single block is w=h=d=1. Use big boxes for masses (walls, trunks, roofs) and single blocks for detail.\n' +
    `Palette (c = index): ${PALETTE_LEGEND}.\n` +
    'Pick colors that suit the subject and the warm sunset world. Keep it readable and well-proportioned; ' +
    `a good build is 15-60 ops, at most ${BUILD_MAX_OPS}.\n` +
    `Reply with ONLY a JSON object of this exact shape, no markdown, no prose:\n${BUILD_EXAMPLE}`;

  const base = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    // The build JSON (up to 96 ops) runs ~3-4k tokens once a model pretty-prints
    // it — 2000 truncates mid-array and fails to parse. 4096 fits a full build
    // with margin; it's only a CEILING (you bill actual output), and the daily
    // gate is the real cost control, so this doesn't raise normal-build cost.
    max_tokens: 4096,
  };

  // Try with json_object mode first; if a provider rejects it, retry once on
  // pure prompt-driven JSON (the brace-scan parser handles either).
  let res = await callModel(env, { ...base, response_format: { type: 'json_object' } });
  if (res && !res.ok && res.status >= 400 && res.status < 500) {
    res = await callModel(env, base);
  }
  if (!res) { logResult(false, 0, 'timeout'); return json({ error: 'the builder took too long — try again' }, 504); }
  if (!res.ok) {
    logResult(false, 0, 'model');
    return json({ error: 'that model is busy right now — try another' }, 502);
  }
  const data = await res.json().catch(() => null);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  const parsed = parseBuildJson(content);
  if (!parsed || !Array.isArray(parsed.ops)) {
    logResult(false, 0, 'parse');
    return json({ error: 'the builder got confused — try rephrasing' }, 422);
  }
  const blocks = expandOps(parsed.ops.slice(0, BUILD_MAX_OPS));
  if (blocks.length === 0) {
    logResult(false, 0, 'empty');
    return json({ error: 'the builder drew a blank — try rephrasing' }, 422);
  }
  const name = typeof parsed.name === 'string' && parsed.name.trim()
    ? parsed.name.trim().slice(0, 60)
    : prompt.slice(0, 60);

  // Commit the build into the shared world when asked (the player is on the
  // plaza and authenticated) so it persists, syncs to everyone, and is
  // deletable. Otherwise return the raw build for the client's preview pad.
  const wantCommit = body.commit === true &&
    typeof body.playerId === 'string' && typeof body.token === 'string' &&
    Number.isFinite(body.ox) && Number.isFinite(body.oz);
  if (wantCommit) {
    let committed = null;
    try {
      const stub = env.PLAZA.get(env.PLAZA.idFromName('plaza'));
      const r = await stub.fetch('https://do.internal/internal/commitbuild', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: body.playerId, token: body.token, ox: body.ox, oz: body.oz, name, blocks, iphash }),
      });
      committed = await r.json().catch(() => null);
      if (r.status === 401) { logResult(false, 0, 'unauth'); return json({ error: 'reconnecting — try again in a moment' }, 401); }
      if (r.status === 429) { logResult(false, 0, 'cooldown'); return json({ error: (committed && committed.error) || 'building too fast — give it a breath' }, 429); }
    } catch { committed = null; }
    if (committed && Array.isArray(committed.blocks) && committed.blocks.length) {
      logResult(true, committed.blocks.length, 'ok');
      return json({ name, model, count: committed.blocks.length, blocks: committed.blocks, version: committed.version, committed: true });
    }
    // commit produced nothing (e.g. the whole footprint was occupied) — fall
    // back to the raw build so the client can still preview it on the pad.
    logResult(true, blocks.length, committed ? 'commit-empty' : 'commit-fail');
    return json({ name, model, count: blocks.length, blocks, committed: false });
  }

  logResult(true, blocks.length, 'ok');
  return json({ name, model, count: blocks.length, blocks });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    // /internal/* is DO-only; never reachable from the public edge.
    if (url.pathname.startsWith('/internal/')) return json({ error: 'not found' }, 404);
    if (!url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    if (url.pathname === '/api/build' && request.method === 'POST') {
      return await aiBuild(request, env, ctx);
    }
    if (url.pathname === '/api/models' && request.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (!q) return json({ models: BUILD_MODELS, featured: true });
      const all = await openRouterCatalog(env);
      const hits = all.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)).slice(0, 40);
      return json({ models: hits, featured: false });
    }
    if (url.pathname === '/api/presence') {
      const island = url.searchParams.get('island') || '';
      if (!PRESENCE_ISLANDS.has(island)) return json({ error: 'unknown island' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const room = env.PRESENCE.get(env.PRESENCE.idFromName('presence:' + island));
      return room.fetch(request);
    }
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
        CREATE TABLE IF NOT EXISTS builds(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, model TEXT, prompt TEXT, blocks INTEGER, ok INTEGER, reason TEXT, iphash TEXT, country TEXT);
        CREATE TABLE IF NOT EXISTS buildquota(k TEXT, day INTEGER, n INTEGER, PRIMARY KEY(k, day));
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
      this.sql.exec('DELETE FROM buildquota WHERE day < ?', cur);   // prune yesterday's gate counters
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
      if (path === '/internal/log' && method === 'POST') return await this.logBuild(request);
      if (path === '/internal/buildgate' && method === 'POST') return await this.buildGate(request);
      if (path === '/internal/commitbuild' && method === 'POST') return await this.commitBuild(request);
      if (path === '/api/admin/builds' && method === 'GET') return this.adminBuilds(request, url);
      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'internal error' }, 500);
    }
  }

  // Build analytics: every foundry/whisper request is logged here (prompt,
  // model, outcome, country, and a SALTED HASH of the IP — never the raw IP).
  async logBuild(request) {
    const r = await readJson(request);
    if (!r) return json({ ok: false }, 400);
    this.sql.exec(
      'INSERT INTO builds(ts, model, prompt, blocks, ok, reason, iphash, country) VALUES(?,?,?,?,?,?,?,?)',
      Number(r.ts) || Date.now(),
      String(r.model || '').slice(0, 80),
      String(r.prompt || '').slice(0, 240),
      Number(r.blocks) || 0,
      r.ok ? 1 : 0,
      String(r.reason || '').slice(0, 40),
      String(r.iphash || '').slice(0, 64),
      String(r.country || '').slice(0, 4),
    );
    return json({ ok: true });
  }

  // Read/bump a persistent daily counter (survives isolate recycling and IP /
  // identity rotation — unlike the Worker's in-memory Maps).
  quotaGet(k) {
    const row = this.sql.exec('SELECT n FROM buildquota WHERE k = ? AND day = ?', k, this._day).toArray()[0];
    return row ? row.n : 0;
  }
  quotaBump(k, by = 1) {
    this.sql.exec(
      'INSERT INTO buildquota(k, day, n) VALUES(?, ?, ?) ON CONFLICT(k, day) DO UPDATE SET n = n + excluded.n',
      k, this._day, by,
    );
  }

  // Gate the PAID model call: require a valid identity and enforce persistent
  // daily ceilings (a hard global bill cap + per-identity + per-IP) BEFORE the
  // Worker spends anything on OpenRouter. Counts the attempt on success.
  async buildGate(request) {
    const r = await readJson(request);
    if (!r) return json({ ok: false, reason: 'bad' }, 400);
    if (!(await this.verify(r.playerId, r.token))) return json({ ok: false, reason: 'auth' }, 401);
    const iphash = typeof r.iphash === 'string' ? r.iphash.slice(0, 64) : 'noip';
    const premium = r.premium === true;
    if (this.quotaGet('g') >= BUILD_GLOBAL_DAILY) return json({ ok: false, reason: 'busy' }, 429);
    if (premium && this.quotaGet('pg') >= BUILD_PREMIUM_DAILY) return json({ ok: false, reason: 'premium' }, 429);
    if (this.quotaGet('p:' + r.playerId) >= BUILD_PLAYER_DAILY) return json({ ok: false, reason: 'player' }, 429);
    if (this.quotaGet('ip:' + iphash) >= BUILD_IP_DAILY) return json({ ok: false, reason: 'ip' }, 429);
    this.ctx.storage.transactionSync(() => {
      this.quotaBump('g');
      if (premium) this.quotaBump('pg');
      this.quotaBump('p:' + r.playerId);
      this.quotaBump('ip:' + iphash);
    });
    return json({ ok: true });
  }

  // Commit an AI build into the shared world. Called only from the Worker
  // (internal route) after it has generated the blocks via OpenRouter — so the
  // cell list is trustworthy, not client-supplied. Maps the build-local cells
  // (0..23, centred on 12) to world coords at the player's chosen anchor,
  // refuses to overwrite occupied/protected cells, caps the size, charges a
  // per-IP daily cell budget (grief cap), and writes real edit-log entries so
  // every client receives the build through the normal delta poll. Attributed to
  // the player (so their own client skips the echo and animates it locally).
  async commitBuild(request) {
    const r = await readJson(request);
    if (!r) return json({ error: 'bad request' }, 400);
    if (!(await this.verify(r.playerId, r.token))) return json({ error: 'unauthorized' }, 401);
    const blocks = Array.isArray(r.blocks) ? r.blocks : [];
    if (!blocks.length) return json({ blocks: [], version: this._version });

    const now = Date.now();
    if (!this._buildCooldown) this._buildCooldown = new Map();
    if (now - (this._buildCooldown.get(r.playerId) || 0) < BUILD_COMMIT_COOLDOWN_MS) {
      return json({ error: 'building too fast — give it a breath' }, 429);
    }
    this._buildCooldown.set(r.playerId, now);   // charge the cooldown even on a no-op commit

    const iphash = typeof r.iphash === 'string' ? r.iphash.slice(0, 64) : 'noip';
    const ipCellsUsed = this.quotaGet('cells:' + iphash);
    let cellBudget = Math.max(0, Math.min(BUILD_WORLD_CAP, BUILD_IP_CELLS_DAILY - ipCellsUsed));
    if (cellBudget <= 0) return json({ blocks: [], version: this._version, error: 'daily build space used up' });

    const ox = clampInt(r.ox, MIN_XZ, MAX_XZ);
    const oz = clampInt(r.oz, MIN_XZ, MAX_XZ);
    const prow = this.sql.exec('SELECT name FROM players WHERE id = ?', r.playerId).toArray()[0];
    const playerName = (prow && prow.name) || FALLBACK_NAME;
    const day = this._day;
    let version = this._version;
    const committed = [];
    // Examine at most BUILD_MAX_BLOCKS cells (the generation cap) — and stop once
    // the cell budget is spent — so an all-occupied footprint can't run a read
    // storm against the single-threaded DO.
    const candidates = blocks.slice(0, BUILD_MAX_BLOCKS);
    this.ctx.storage.transactionSync(() => {
      for (const b of candidates) {
        if (committed.length >= cellBudget) break;
        if (!Array.isArray(b) || b.length < 4) continue;
        const wx = ox + (clampInt(b[0], 0, BUILD_ENVELOPE) - BUILD_CENTER);
        const wy = clampInt(b[1], MIN_Y, MAX_Y);
        const wz = oz + (clampInt(b[2], 0, BUILD_ENVELOPE) - BUILD_CENTER);
        const c = clampInt(b[3], 0, 15);
        if (wx < MIN_XZ || wx > MAX_XZ || wz < MIN_XZ || wz > MAX_XZ) continue;
        const k = `${wx},${wy},${wz}`;
        // never overwrite protected columns/cells or anything already placed
        if (this.sql.exec('SELECT 1 FROM protectedcols WHERE k = ?', `${wx},${wz}`).toArray().length) continue;
        if (this.sql.exec('SELECT 1 FROM protectedblocks WHERE k = ?', k).toArray().length) continue;
        if (this.sql.exec('SELECT 1 FROM blocks WHERE k = ?', k).toArray().length) continue;
        version += 1;
        this.sql.exec('INSERT INTO blocks(k, c, m, n) VALUES(?, ?, NULL, ?)', k, c, playerName);
        this.sql.exec(
          'INSERT INTO edits(v, day, ts, p, x, y, z, c, m, n) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
          version, day, now, r.playerId, wx, wy, wz, c, playerName,
        );
        committed.push([wx, wy, wz, c]);
      }
      if (version !== this._version) this.setVersion(version);
      if (committed.length) this.quotaBump('cells:' + iphash, committed.length);
    });
    return json({ blocks: committed, version });
  }

  // GET /api/admin/builds — token-gated (header x-admin-key === TOKEN_SECRET).
  // Returns the most recent builds for the dashboard.
  adminBuilds(request, url) {
    const key = request.headers.get('x-admin-key') || url.searchParams.get('key') || '';
    const secret = this.env.TOKEN_SECRET || '';
    if (key.length !== secret.length || key.length === 0) return json({ error: 'forbidden' }, 403);
    let diff = 0;
    for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ key.charCodeAt(i);
    if (diff !== 0) return json({ error: 'forbidden' }, 403);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
    const rows = this.sql.exec(
      'SELECT ts, model, prompt, blocks, ok, reason, country FROM builds ORDER BY id DESC LIMIT ?', limit,
    ).toArray();
    const total = this.sql.exec('SELECT COUNT(*) AS n FROM builds').toArray()[0].n;
    return json({ total, builds: rows });
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

// PresenceDO — one ephemeral room per island. Pure relay: it holds the latest
// position of every connected socket in memory and fans out a single batched
// roster at 1Hz. Nothing is persisted (no SQLite); a tab closing forgets you.
// Uses the WebSocket Hibernation API so an idle room costs nothing.
export class PresenceDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Per-connection live state, keyed by short connection id. Rebuilt lazily
    // from serialized attachments after a hibernation wake (a busy room — one
    // with the 1Hz alarm pending — never hibernates).
    this.peers = new Map();
    this.seq = 0;
    // Live chat: a ring of recent lines (replayed to new arrivals) and a report
    // tally per line. PresenceDO is SQLite-backed, so the history is DURABLE —
    // it survives reloads, island changes, and DO eviction. The in-memory ring
    // is just a warm cache loaded from that store here on (re)construction.
    this.chatRing = [];
    this.msgSeq = 0;
    this.reports = new Map();   // mid -> Set(reporterId)
    try {
      this.sql = ctx.storage.sql;
      this.sql.exec('CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY AUTOINCREMENT, mid TEXT, name TEXT, text TEXT, kind TEXT, ts INTEGER)');
      const rows = this.sql.exec(
        'SELECT id, mid, name, text, kind, ts FROM chat ORDER BY id DESC LIMIT ?', CHAT_RING,
      ).toArray().reverse();
      this.chatRing = rows.map((r) => ({ t: 'msg', cid: r.id, mid: r.mid, id: '', name: r.name, text: r.text, kind: r.kind, ts: r.ts }));
      const mx = this.sql.exec('SELECT MAX(id) AS m FROM chat').toArray()[0];
      this.msgSeq = (mx && mx.m) ? mx.m : 0;
    } catch {
      this.sql = null;   // storage unavailable — fall back to in-memory only
    }
    // Idle keepalives (ping/pong) are answered without waking the DO.
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    } catch {
      /* older runtimes / repeated set — non-fatal */
    }
  }

  // Allocate a short, room-unique connection id. Survives hibernation via the
  // counter being re-seeded from existing attachments in rebuild().
  nextId() {
    this.seq = (this.seq + 1) & 0xffffff;
    return this.seq.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  }

  // After a hibernation wake the in-memory map is empty; rebuild skeleton peer
  // records from each socket's serialized attachment so the roster is whole.
  rebuild() {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      let att = null;
      try { att = ws.deserializeAttachment(); } catch { att = null; }
      const id = att && typeof att.id === 'string' ? att.id : null;
      if (!id) continue;
      if (!this.peers.has(id)) {
        this.peers.set(id, {
          ws, id,
          name: typeof att.name === 'string' ? att.name : FALLBACK_NAME,
          body: Number.isInteger(att.body) ? att.body : 0,
          uid: typeof att.uid === 'string' ? att.uid : null,
          p: [0, 0, 0], y: 0, a: 0,
          updated: Date.now(),
          connectedAt: Date.now(), joined: true,   // already here pre-wake
          chatTimes: [], lastText: '', lastTextTs: 0, lastChatAt: 0,
        });
      } else {
        this.peers.get(id).ws = ws;
      }
    }
  }

  // The room only schedules an alarm while occupied; the alarm self-perpetuates
  // (1Hz roster) and stops scheduling once empty.
  async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + PRESENCE_TICK_MS);
    }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const id = this.nextId();
    // Hibernation API: the DO adopts the socket; no ws.accept().
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name: FALLBACK_NAME, body: 0 });
    this.peers.set(id, {
      ws: server, id, name: FALLBACK_NAME, body: 0, uid: null,
      p: [0, 0, 0], y: 0, a: 0, updated: Date.now(),
      connectedAt: Date.now(), joined: false,
      chatTimes: [], lastText: '', lastTextTs: 0, lastChatAt: 0,
    });
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  // Resolve the peer record for a socket, healing the map after a wake.
  peerFor(ws) {
    for (const peer of this.peers.values()) {
      if (peer.ws === ws) return peer;
    }
    let att = null;
    try { att = ws.deserializeAttachment(); } catch { att = null; }
    const id = att && typeof att.id === 'string' ? att.id : null;
    if (!id) return null;
    const peer = {
      ws, id,
      name: typeof att.name === 'string' ? att.name : FALLBACK_NAME,
      body: Number.isInteger(att.body) ? att.body : 0,
      uid: typeof att.uid === 'string' ? att.uid : null,
      p: [0, 0, 0], y: 0, a: 0, updated: Date.now(),
      connectedAt: Date.now(), joined: true,   // healed an existing socket
      chatTimes: [], lastText: '', lastTextTs: 0, lastChatAt: 0,
    };
    this.peers.set(id, peer);
    return peer;
  }

  async webSocketMessage(ws, raw) {
    // Defensive throughout: a malformed frame is ignored, never thrown.
    if (typeof raw !== 'string') return;
    let msg = null;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const peer = this.peerFor(ws);
    if (!peer) return;

    if (msg.t === 'hello') {
      peer.name = cleanName(msg.name);
      peer.body = Number.isInteger(msg.body) && msg.body >= 0 && msg.body <= PRESENCE_BODY_MAX
        ? msg.body : 0;
      // Stable device identity — the roster collapses to one avatar per uid, so
      // a person's reloads / extra tabs / reconnects don't show up as a crowd.
      peer.uid = typeof msg.uid === 'string' && msg.uid ? msg.uid.slice(0, 64) : null;
      peer.updated = Date.now();
      try { ws.serializeAttachment({ id: peer.id, name: peer.name, body: peer.body, uid: peer.uid }); } catch { /* ignore */ }
      // Replay recent chat to this arrival only (more=true if older history exists
      // to page in), then announce them once.
      let more = false;
      if (this.sql) {
        try {
          const n = this.sql.exec('SELECT COUNT(*) AS n FROM chat').toArray()[0].n;
          more = n > this.chatRing.length;
        } catch { /* ignore */ }
      }
      try { ws.send(JSON.stringify({ t: 'log', msgs: this.chatRing, more })); } catch { /* socket died */ }
      if (!peer.joined) {
        peer.joined = true;
        this.sysLine('join', peer.name, 'wandered in');
      }
      await this.ensureAlarm();
      return;
    }
    if (msg.t === 'chat') { this.handleChat(peer, msg); return; }
    if (msg.t === 'report') { this.handleReport(peer, msg); return; }
    if (msg.t === 'history') { this.handleHistory(ws, msg); return; }
    if (msg.t === 'state') {
      const p = msg.p;
      if (Array.isArray(p) && p.length === 3 &&
          Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) {
        peer.p = [p[0], p[1], p[2]];
      }
      if (Number.isFinite(msg.y)) peer.y = msg.y;
      const a = msg.a;
      peer.a = a === 1 || a === 2 ? a : 0;
      peer.updated = Date.now();
      await this.ensureAlarm();
    }
  }

  // Drop a peer and tell the room promptly so others fade it out.
  dropSocket(ws) {
    let goneId = null;
    let goneName = null;
    let goneJoined = false;
    for (const [id, peer] of this.peers) {
      if (peer.ws === ws) {
        goneId = id; goneName = peer.name; goneJoined = peer.joined;
        this.peers.delete(id); break;
      }
    }
    if (!goneId) {
      let att = null;
      try { att = ws.deserializeAttachment(); } catch { att = null; }
      if (att && typeof att.id === 'string') {
        goneId = att.id;
        goneName = typeof att.name === 'string' ? att.name : null;
        this.peers.delete(goneId);
      }
    }
    try { ws.close(); } catch { /* already closed */ }
    if (goneId) {
      this.broadcast(JSON.stringify({ t: 'leave', id: goneId }));
      // Only announce a departure for someone who actually said hello (so a
      // probe socket that opens and closes never spams the feed).
      if (goneJoined && goneName) this.sysLine('leave', goneName, 'drifted off');
    }
  }

  webSocketClose(ws) {
    this.dropSocket(ws);
  }

  webSocketError(ws) {
    this.dropSocket(ws);
  }

  // Send a string frame to every live socket; prune any that are no longer open.
  broadcast(payload) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* dead socket — the close handler (or the sweep) reaps its peer */
      }
    }
  }

  // Stamp a chat line with a room-unique id, keep it in the replay ring, and fan
  // it out to everyone (including the sender, so their own line confirms).
  emitMsg(peer, text, kind) {
    const ts = Date.now();
    const mid = peer.id + '-' + (++this.msgSeq).toString(36);
    // persist permanently (history is never pruned — messages stay forever) and
    // stamp the durable row id (cid) so clients can paginate older messages.
    let cid = null;
    if (this.sql) {
      try {
        this.sql.exec('INSERT INTO chat(mid, name, text, kind, ts) VALUES(?,?,?,?,?)', mid, peer.name, text, kind, ts);
        const r = this.sql.exec('SELECT last_insert_rowid() AS id').toArray()[0];
        cid = r ? Number(r.id) : null;
      } catch { /* best-effort; the in-memory ring still serves */ }
    }
    const out = { t: 'msg', cid, mid, id: peer.id, name: peer.name, text, kind, ts };
    this.chatRing.push(out);
    if (this.chatRing.length > CHAT_RING) this.chatRing.shift();
    this.broadcast(JSON.stringify(out));
  }

  // Pagination: a client scrolled to the top and wants older lines. Returns the
  // page of messages with id < before (oldest-first), plus whether more remain.
  // Sent only to the asking socket. History is permanent, so this can page all
  // the way back to the very first message.
  handleHistory(ws, msg) {
    let rows = [];
    const before = Number(msg && msg.before);
    if (this.sql && Number.isFinite(before) && before > 1) {
      try {
        rows = this.sql.exec(
          'SELECT id, mid, name, text, kind, ts FROM chat WHERE id < ? ORDER BY id DESC LIMIT ?',
          before, CHAT_PAGE + 1,
        ).toArray();
      } catch { rows = []; }
    }
    const more = rows.length > CHAT_PAGE;
    const page = rows.slice(0, CHAT_PAGE).reverse();   // oldest-first for prepending
    const msgs = page.map((r) => ({ t: 'msg', cid: r.id, mid: r.mid, id: '', name: r.name, text: r.text, kind: r.kind, ts: r.ts }));
    try { ws.send(JSON.stringify({ t: 'history', msgs, more })); } catch { /* socket gone */ }
  }

  // Ephemeral system lines (join/leave) — broadcast but never kept in the ring,
  // so a new arrival doesn't replay stale comings and goings.
  sysLine(kind, name, text) {
    const out = {
      t: 'msg', mid: 'sys-' + (this.msgSeq++).toString(36),
      id: '', name, text, kind, ts: Date.now(),
    };
    this.broadcast(JSON.stringify(out));
  }

  // One inbound chat line. Validated, filtered, rate-limited, then relayed.
  handleChat(peer, msg) {
    const kind = CHAT_KINDS.has(msg.kind) ? msg.kind : 'chat';
    const text = sanitizeChat(msg.text);
    if (!text) return;
    const now = Date.now();
    // identical line, just now → drop (accidental double-send / spam)
    if (text === peer.lastText && now - peer.lastTextTs < CHAT_DEDUP_MS) return;
    // floor between lines
    if (now - peer.lastChatAt < CHAT_GAP_MS) return;
    // rolling window
    peer.chatTimes = peer.chatTimes.filter((ts) => now - ts < CHAT_WINDOW_MS);
    if (peer.chatTimes.length >= CHAT_BURST) return;
    // brand-new sockets get a stricter cap (drive-by spam guard)
    if (now - peer.connectedAt < CHAT_NEW_MS && peer.chatTimes.length >= CHAT_NEW_MAX) return;
    // profanity → shadow-drop: the sender alone gets a gentle nudge, the room
    // never sees it (applies to chat AND /build prompts, which arrive as text).
    if (matcher.hasMatch(text)) {
      try { peer.ws.send(JSON.stringify({ t: 'sys', text: "let's keep it kind" })); } catch { /* gone */ }
      return;
    }
    peer.chatTimes.push(now);
    peer.lastChatAt = now;
    peer.lastText = text;
    peer.lastTextTs = now;
    this.emitMsg(peer, text, kind);
  }

  // A peer flags a line; once enough distinct peers agree, hide it for everyone.
  handleReport(peer, msg) {
    const mid = typeof msg.mid === 'string' ? msg.mid : '';
    if (!mid || mid.startsWith('sys-')) return;
    let set = this.reports.get(mid);
    if (!set) this.reports.set(mid, (set = new Set()));
    set.add(peer.id);
    if (set.size >= CHAT_REPORT_HIDE) {
      this.chatRing = this.chatRing.filter((m) => m.mid !== mid);  // no replay
      if (this.sql) { try { this.sql.exec('DELETE FROM chat WHERE mid = ?', mid); } catch { /* */ } }
      this.broadcast(JSON.stringify({ t: 'hide', mid }));
      this.reports.delete(mid);
    }
    if (this.reports.size > 500) this.reports.clear();   // unbounded-growth guard
  }

  async alarm() {
    // A wake may find an empty in-memory map (post-hibernation) — rebuild it.
    if (this.peers.size === 0) this.rebuild();

    const now = Date.now();
    // Stale sweep: drop sockets silent past the threshold (each emits a leave).
    if (now - (this._lastSweep || 0) >= PRESENCE_SWEEP_MS) {
      this._lastSweep = now;
      for (const peer of [...this.peers.values()]) {
        if (now - peer.updated > PRESENCE_STALE_MS) this.dropSocket(peer.ws);
      }
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) {
      this.peers.clear();
      return; // empty room: stop scheduling
    }

    // Build the roster, collapsing each stable identity (uid) to a SINGLE
    // wanderer — the most-recently-updated connection wins, so a person's
    // reloads / extra tabs / lingering reconnects show up once, not as a crowd.
    // (Connections with no uid — older clients — are each kept as-is.) The dead
    // duplicates simply stop appearing and the stale sweep reaps them.
    const seen = new Map();   // uid -> the live peer we'll show for it
    const unique = [];
    for (const peer of this.peers.values()) {
      if (!peer.uid) { unique.push(peer); continue; }
      const prev = seen.get(peer.uid);
      if (!prev) { seen.set(peer.uid, peer); unique.push(peer); }
      else if (peer.updated > prev.updated) {
        unique[unique.indexOf(prev)] = peer;
        seen.set(peer.uid, peer);
      }
    }
    const n = unique.length;
    unique.sort((a, b) => b.updated - a.updated);
    const av = unique.slice(0, PRESENCE_AV_CAP).map((peer) => ({
      id: peer.id, name: peer.name, body: peer.body, p: peer.p, y: peer.y, a: peer.a,
    }));
    this.broadcast(JSON.stringify({ t: 'world', n, av }));

    await this.ctx.storage.setAlarm(now + PRESENCE_TICK_MS);
  }
}
