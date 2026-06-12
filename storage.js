// storage.js — load/save abstraction (CONTRACT §3).
// localStorage when available, an in-memory mirror otherwise (or when a write
// throws mid-session), so the rest of the game never thinks about persistence.

const WORLD_KEY = 'buildle_world_v1';
const PLAYER_KEY = 'buildle_player_v1';

const PLAYER_DEFAULTS = {
  name: '',
  streak: 0,
  bestStreak: 0,
  lastBuildDay: 0,
  muted: false,
  helpSeen: false,
  bodyColor: -1,
};

function probeStorage() {
  try {
    const key = '__buildle_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const storageAvailable = probeStorage();

// Writes always land here too, so reads survive quota errors within a session.
const memoryStore = new Map();

function readRaw(key) {
  if (storageAvailable) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) return raw;
    } catch {
      // fall through to the memory mirror
    }
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function writeRaw(key, value) {
  memoryStore.set(key, value);
  if (storageAvailable) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // quota or private-mode hiccup; the memory mirror keeps the session alive
    }
  }
}

function readJSON(key) {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function loadWorld() {
  return readJSON(WORLD_KEY);
}

export function saveWorld(obj) {
  writeRaw(WORLD_KEY, JSON.stringify(obj));
}

export function loadPlayer() {
  const player = { ...PLAYER_DEFAULTS, ...(readJSON(PLAYER_KEY) ?? {}) };
  for (const key of ['streak', 'bestStreak', 'lastBuildDay', 'bodyColor']) {
    if (!Number.isFinite(player[key])) player[key] = PLAYER_DEFAULTS[key];
  }
  if (typeof player.name !== 'string') player.name = PLAYER_DEFAULTS.name;
  player.muted = Boolean(player.muted);
  player.helpSeen = Boolean(player.helpSeen);
  return player;
}

export function savePlayer(p) {
  writeRaw(PLAYER_KEY, JSON.stringify(p));
}
