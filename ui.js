// ui.js — HUD, palette, overlays, toasts, joystick visuals, share card.
// Presentation layer only: DOM + canvas2d. No three.js here — the share card
// receives renderer/scene/camera as arguments from main.js.

import { PALETTE, GLOW_INDEX } from './world.js';
import { audio } from './audio.js';

// ── Tunables ────────────────────────────────────────────────────────────
const NAME_MAX = 16;
const NOTE_MAX = 140;
const JOY_TRAVEL = 56;        // knob travel radius in px; matches input radius in main.js
const TOAST_MS = 2200;
const TOAST_GAP_MS = 320;     // fade-out breather between queued toasts
const CELEBRATE_MS = 1900;
const ARRIVAL_MS = 2400;      // arrival card fade in / hold / out (matches CSS)
const SHARE_URL = 'buildle.zonivan.com';
const CLOUD_WHITE = '#F7F1E8';
const CARD_W = 2400;          // 1200×1500 postcard rendered at 2× for crispness
const CARD_H = 3000;
const CARD_INSET = 30;        // border inset from card edge (15px at 1×)
const CARD_STROKE = 12;       // border thickness (6px at 1×)
const CARD_RADIUS = 32;       // border corner radius (16px at 1×)
const CARD_TEXT_MAX_W = CARD_W - 360;
const SCRIM_START = 0.56;     // scrim begins at this fraction of card height

const ENVELOPE_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1.6"/>' +
  '<path d="m2.4 4.6 5.6 4.2 5.6-4.2"/></svg>';

const $ = (id) => document.getElementById(id);

let promptTextEl, dayLineEl, paletteEl, soundBtn;
let joyEl, knobEl, toastEl, celebrateEl;
let overlayHelp, overlayNote, overlayComposer, overlayCtxlost;
let shareMenuEl, viewsMenuEl, photoExitEl, filmingEl;
let voyageCardEl, voyageNameEl, voyageEpithetEl, voyageSailEl, voyageStayEl;
let arrivalEl, arrivalNameEl, arrivalEpithetEl;
let voyageOnSail = null;
let voyageOnStay = null;
let arrivalTimer = 0;

// ── the Commons (live chat) ──────────────────────────────────────────────
let chatEl, chatFeedEl, chatInputEl, chatBuildEl, chatGearEl, chatModelEl;
let chatAcEl, chatSuggestEl, chatCountEl;
let chatOnSend = null, chatOnBuild = null, chatOnReport = null, chatOnExpand = null;
let chatExpanded = false;
let chatBuildBusy = false;
let chatPlaceholderTimer = 0;
let chatPlaceholderIdx = 0;
let chatSuggestTimer = 0;
const CHAT_ROWS_MAX = 90;           // DOM rows kept; older ones are pruned
const CHAT_NAME_MAX = 16;

// Distinct, warm-but-readable hues for name colouring (hashed per sender id).
const CHAT_NAME_COLORS = [
  '#EBB44E', '#D98E73', '#E5A0B0', '#C79BE0', '#8FB8E8', '#6FD0C2',
  '#8FD08A', '#D7C56A', '#F0A878', '#B5C98E', '#E89BC4', '#7FC8E0',
];
// Rotating ghost-text that teaches /build without a tutorial.
const CHAT_PLACEHOLDERS = [
  'say something…', '/build a cherry blossom tree', 'say hi 🌅',
  '/build a tiny lighthouse', 'roast my build…', '/build a floating island',
];
const CHAT_COMMANDS = [
  { cmd: '/build', hint: 'make something with AI' },
  { cmd: '/me', hint: 'do an action' },
  { cmd: '/clear', hint: 'clear your view' },
];
// "build me a …", "can you make an …" — the soft fallback to a real /build.
const CHAT_SOFT_BUILD =
  /^(?:can (?:you|someone|we) )?(?:please )?(?:build|make|create) (?:me |us )?(?:a |an |the |some )?(.+?)[?.!]*$/i;

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
function chatNameColor(id) {
  return CHAT_NAME_COLORS[djb2(String(id || 'x')) % CHAT_NAME_COLORS.length];
}

function makeReportBtn() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rep';
  b.title = 'report';
  b.setAttribute('aria-label', 'report message');
  b.textContent = '⚑';
  return b;
}

// One feed row. Styling + structure vary by kind; user content (chat/action)
// gets a report affordance, system lines never do.
function buildChatRow(msg, noAnim) {
  const kind = msg.kind || 'chat';
  const row = document.createElement('div');
  row.className = 'chat-row k-' + kind;
  if (msg.mid) row.dataset.mid = msg.mid;
  if (noAnim) row.style.animation = 'none';
  const name = String(msg.name || '').slice(0, CHAT_NAME_MAX);
  const text = String(msg.text || '');
  const nameSpan = (fallback) => {
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.style.color = chatNameColor(msg.id || name);
    nm.textContent = name || fallback;
    return nm;
  };
  const textSpan = (t) => {
    const tx = document.createElement('span');
    tx.className = 'tx';
    tx.textContent = t;
    return tx;
  };
  const icon = (ch) => {
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = ch;
    return ic;
  };
  if (kind === 'chat') {
    row.append(nameSpan('wanderer'), textSpan(text), makeReportBtn());
  } else if (kind === 'action') {
    row.append(textSpan(`${name || 'someone'} ${text}`), makeReportBtn());
  } else if (kind === 'build') {
    row.append(icon('🔨'), nameSpan('a wanderer'), textSpan(text));
  } else if (kind === 'note') {
    row.append(icon('📌'), nameSpan('a wanderer'), textSpan(text));
  } else if (kind === 'join' || kind === 'leave') {
    row.append(textSpan(`${name || 'a wanderer'} ${text || (kind === 'join' ? 'wandered in' : 'drifted off')}`));
  } else {
    row.append(textSpan(text));   // sys
  }
  return row;
}

function scrollChatToEnd() {
  if (chatFeedEl) chatFeedEl.scrollTop = chatFeedEl.scrollHeight;
}

function markChatUnread() {
  const b = $('btn-chat');
  if (b) b.classList.add('has-unread');
}
function clearChatUnread() {
  const b = $('btn-chat');
  if (b) b.classList.remove('has-unread');
}

// Reflect open/hidden state on the two toggle controls (screen-reader + title).
function syncChatToggleAria() {
  const b = $('btn-chat');
  if (b) {
    b.setAttribute('aria-expanded', String(chatExpanded));
    const label = chatExpanded ? 'hide chat' : 'live chat';
    b.setAttribute('aria-label', label);
    b.title = chatExpanded ? 'hide chat' : 'live chat — talk & build';
  }
  const c = $('chat-collapse');
  if (c) c.setAttribute('aria-expanded', String(chatExpanded));
}

// Slash-command autocomplete, filtered by the typed prefix.
function showChatAc(prefix) {
  if (!chatAcEl) return;
  const p = String(prefix || '').toLowerCase();
  const items = CHAT_COMMANDS.filter((c) => c.cmd.startsWith(p));
  if (!items.length) { hideChatAc(); return; }
  chatAcEl.replaceChildren(...items.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chat-ac-item';
    const cmd = document.createElement('span'); cmd.className = 'cmd'; cmd.textContent = c.cmd;
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = c.hint;
    b.append(cmd, hint);
    b.addEventListener('mousedown', (e) => e.preventDefault());   // keep input focus
    b.addEventListener('click', () => {
      chatInputEl.value = c.cmd + ' ';
      chatInputEl.focus();
      hideChatAc();
    });
    return b;
  }));
  chatAcEl.classList.remove('hidden');
}
function hideChatAc() {
  if (chatAcEl) chatAcEl.classList.add('hidden');
}

function showChatSuggest(subject) {
  if (!chatSuggestEl) return;
  chatSuggestEl.dataset.subject = subject;
  chatSuggestEl.textContent = `🔨 build “${subject}”?`;
  chatSuggestEl.classList.remove('hidden');
  clearTimeout(chatSuggestTimer);
  chatSuggestTimer = setTimeout(hideChatSuggest, 12000);
}
function hideChatSuggest() {
  if (chatSuggestEl) chatSuggestEl.classList.add('hidden');
  clearTimeout(chatSuggestTimer);
  chatSuggestTimer = 0;
}

function startChatPlaceholder() {
  stopChatPlaceholder();
  chatPlaceholderTimer = setInterval(() => {
    if (!chatInputEl || document.activeElement === chatInputEl || chatInputEl.value) return;
    chatPlaceholderIdx = (chatPlaceholderIdx + 1) % CHAT_PLACEHOLDERS.length;
    chatInputEl.placeholder = CHAT_PLACEHOLDERS[chatPlaceholderIdx];
  }, 4200);
}
function stopChatPlaceholder() {
  clearInterval(chatPlaceholderTimer);
  chatPlaceholderTimer = 0;
}
function restoreChatPlaceholder() {
  if (!chatInputEl) return;
  chatInputEl.placeholder = document.activeElement === chatInputEl
    ? 'say something… or /build'
    : CHAT_PLACEHOLDERS[chatPlaceholderIdx];
}

// Keep the expanded sheet's composer above the on-screen keyboard (phones).
// No-ops (and resets) when the chat isn't an open sheet, or when a modal overlay
// owns the screen — otherwise two inputs would fight over the inset.
function syncChatViewport() {
  if (!chatEl || !window.visualViewport) return;
  const overlayOpen = !!document.querySelector('.overlay:not(.hidden)');
  if (!chatExpanded || overlayOpen || !matchMedia('(max-width: 759px)').matches) {
    chatEl.style.bottom = '';
    return;
  }
  const vv = window.visualViewport;
  const overlap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
  // keep a minimum visible slice so the sheet never gets shoved fully off-screen
  const maxShift = Math.max(0, window.innerHeight - 200);
  chatEl.style.bottom = Math.min(overlap, maxShift) + 'px';
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\\]]/g, '\\$&');
}
let swatchEls = [];
let brushEls = [];
let messageSlotEl = null;
let openMenuCleanup = null;

let currentDay = 0;
let currentStreak = 0;
let toastActive = false;
const toastQueue = [];
let celebrateTimer = 0;
let noteCloser = null;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function renderDayLine() {
  dayLineEl.textContent = currentStreak > 0
    ? `day ${currentDay} · 🔥 ${currentStreak}`
    : `day ${currentDay}`;
}

function applySelection(sel) {
  swatchEls.forEach((el, i) => el.classList.toggle('selected', sel === i));
  messageSlotEl.classList.toggle('selected', sel === 'message');
}

function nextToast() {
  const item = toastQueue.shift();
  if (!item) { toastActive = false; return; }
  toastActive = true;
  toastEl.textContent = item.text;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(nextToast, TOAST_GAP_MS);
  }, item.ms);
}

// Skip autofocus on touch devices so the keyboard doesn't bury the card.
function autoFocus(el) {
  if (matchMedia('(pointer: coarse)').matches) return;
  requestAnimationFrame(() => {
    el.focus({ preventScroll: true });
    if (el.select) el.select();
  });
}

function syncSoundIcon() {
  soundBtn.classList.toggle('muted', !!audio.muted);
}

// One mini-menu open at a time; closes on outside pointerdown or Escape.
function openMenu(menuEl, items) {
  closeMenus();
  menuEl.replaceChildren(...items.map(({ label, onPick }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      closeMenus();
      onPick();
    });
    return b;
  }));
  show(menuEl);
  const onDown = (e) => {
    if (!menuEl.contains(e.target)) closeMenus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeMenus();
  };
  openMenuCleanup = () => {
    hide(menuEl);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey);
    openMenuCleanup = null;
  };
  // capture phase + deferred so the opening tap itself can't instantly close it
  requestAnimationFrame(() => {
    if (!openMenuCleanup) return;
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
  });
}

function closeMenus() {
  if (openMenuCleanup) openMenuCleanup();
}

// ── Share-card drawing helpers ──────────────────────────────────────────

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shrink the quoted prompt to fit one line; past the floor size, wrap to two.
function fitPrompt(ctx, text) {
  let size = 150;
  ctx.font = `600 ${size}px Fredoka`;
  while (size > 104 && ctx.measureText(text).width > CARD_TEXT_MAX_W) {
    size -= 6;
    ctx.font = `600 ${size}px Fredoka`;
  }
  if (ctx.measureText(text).width <= CARD_TEXT_MAX_W) return { size, lines: [text] };
  const words = text.split(' ');
  let head = words[0];
  let i = 1;
  while (i < words.length && ctx.measureText(`${head} ${words[i]}`).width <= CARD_TEXT_MAX_W) {
    head = `${head} ${words[i]}`;
    i += 1;
  }
  return { size, lines: [head, words.slice(i).join(' ')] };
}

function drawCardOverlay(ctx, { day, prompt, name, streak }) {
  const cx = CARD_W / 2;

  const scrim = ctx.createLinearGradient(0, CARD_H * SCRIM_START, 0, CARD_H);
  scrim.addColorStop(0, 'rgba(43, 29, 58, 0)');
  scrim.addColorStop(0.5, 'rgba(40, 25, 56, 0.45)');
  scrim.addColorStop(1, 'rgba(33, 20, 48, 0.85)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, CARD_H * SCRIM_START, CARD_W, CARD_H - CARD_H * SCRIM_START);

  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(30, 18, 42, 0.5)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;

  const { size, lines } = fitPrompt(ctx, `“${prompt}”`);
  const stacked = lines.length > 1;

  ctx.fillStyle = 'rgba(247, 241, 232, 0.92)';
  ctx.letterSpacing = '6px';
  ctx.font = '500 84px Fredoka';
  ctx.fillText(`buildle · day ${day}`, cx, stacked ? 2466 : 2562);

  ctx.fillStyle = CLOUD_WHITE;
  ctx.letterSpacing = '0px';
  ctx.font = `600 ${size}px Fredoka`;
  if (stacked) {
    ctx.fillText(lines[0], cx, 2642);
    ctx.fillText(lines[1], cx, 2642 + size * 1.18);
  } else {
    ctx.fillText(lines[0], cx, 2756);
  }

  const nameLine = streak > 0 ? `${name} · 🔥 ${streak}` : name;
  if (nameLine) {
    ctx.fillStyle = 'rgba(247, 241, 232, 0.9)';
    ctx.letterSpacing = '2px';
    ctx.font = '500 64px Fredoka';
    ctx.fillText(nameLine, cx, 2904);
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.letterSpacing = '0px';
  ctx.strokeStyle = CLOUD_WHITE;
  ctx.lineWidth = CARD_STROKE;
  roundRectPath(ctx, CARD_INSET, CARD_INSET, CARD_W - CARD_INSET * 2, CARD_H - CARD_INSET * 2, CARD_RADIUS);
  ctx.stroke();
}

// ── Public API ──────────────────────────────────────────────────────────

export const ui = {
  init({ onSelectColor, onSelectMessage, onShare, onToggleSound, onHelp, onViews, onCompass, onExitView, onChat, onSky, onBuildY, onBrush, onMusicMode }) {
    promptTextEl = $('prompt-text');
    dayLineEl = $('day-line');
    paletteEl = $('palette');
    soundBtn = $('btn-sound');
    joyEl = $('joystick');
    knobEl = $('joystick-knob');
    toastEl = $('toast');
    overlayHelp = $('overlay-help');
    overlayNote = $('overlay-note');
    overlayComposer = $('overlay-composer');
    overlayCtxlost = $('overlay-ctxlost');
    shareMenuEl = $('share-menu');
    viewsMenuEl = $('views-menu');
    photoExitEl = $('photo-exit');
    filmingEl = $('filming');
    voyageCardEl = $('voyage-card');
    voyageNameEl = $('voyage-name');
    voyageEpithetEl = $('voyage-epithet');
    voyageSailEl = $('voyage-sail');
    voyageStayEl = $('voyage-stay');
    arrivalEl = $('arrival-card');
    arrivalNameEl = $('arrival-name');
    arrivalEpithetEl = $('arrival-epithet');
    voyageSailEl.addEventListener('click', () => {
      audio.ui();
      if (voyageOnSail) voyageOnSail();
    });
    voyageStayEl.addEventListener('click', () => {
      audio.ui();
      if (voyageOnStay) voyageOnStay();
    });

    celebrateEl = document.createElement('div');
    celebrateEl.id = 'celebrate';
    document.body.appendChild(celebrateEl);

    swatchEls = PALETTE.map((entry, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = entry.hex;
      b.title = entry.name.toLowerCase();
      b.setAttribute('aria-label', entry.name.toLowerCase());
      b.addEventListener('click', () => {
        applySelection(i);
        onSelectColor(i);
      });
      paletteEl.appendChild(b);
      return b;
    });

    messageSlotEl = document.createElement('button');
    messageSlotEl.type = 'button';
    messageSlotEl.className = 'swatch message-slot';
    messageSlotEl.style.background = PALETTE[GLOW_INDEX].hex;
    messageSlotEl.title = 'leave a note';
    messageSlotEl.setAttribute('aria-label', 'leave a note');
    messageSlotEl.innerHTML = ENVELOPE_SVG;
    messageSlotEl.addEventListener('click', () => {
      applySelection('message');
      onSelectMessage();
    });
    paletteEl.appendChild(messageSlotEl);

    // Brush size — single / 2×2×2 / 3×3 blob, for clouds and big masses. Rides
    // the end of the palette row (scrolls with it on phones).
    brushEls = [1, 2, 3].map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'brush-pick';
      b.title = n === 1 ? 'single block' : `${n}×${n} brush`;
      b.setAttribute('aria-label', b.title);
      const dots = document.createElement('span');
      dots.className = 'dots';
      dots.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      for (let i = 0; i < n * n; i++) dots.appendChild(document.createElement('i'));
      b.appendChild(dots);
      b.addEventListener('click', () => { ui.selectBrush(n); if (onBrush) onBrush(n); });
      paletteEl.appendChild(b);
      return b;
    });

    $('btn-share').addEventListener('click', onShare);
    soundBtn.addEventListener('click', () => {
      onToggleSound();
      syncSoundIcon();
    });
    syncSoundIcon();
    $('btn-help').addEventListener('click', onHelp);
    $('ctxlost-reload').addEventListener('click', () => location.reload());
    if (onViews) $('btn-views').addEventListener('click', onViews);
    if (onCompass) $('btn-compass').addEventListener('click', onCompass);
    if (onExitView) photoExitEl.addEventListener('click', onExitView);
    if (onChat) $('btn-chat').addEventListener('click', onChat);
    if (onSky) $('btn-sky').addEventListener('click', onSky);
    if (onBuildY) {
      $('sky-up').addEventListener('click', () => onBuildY(1));
      $('sky-down').addEventListener('click', () => onBuildY(-1));
    }
    if (onMusicMode) $('btn-music').addEventListener('click', onMusicMode);

    // The mobile palette scrolls; a right-edge fade signals the clipped run
    // and lifts once the user reaches the end.
    const updatePaletteMask = () => {
      paletteEl.classList.toggle(
        'at-end', paletteEl.scrollLeft >= paletteEl.scrollWidth - paletteEl.clientWidth - 1);
    };
    paletteEl.addEventListener('scroll', updatePaletteMask, { passive: true });
    window.addEventListener('resize', updatePaletteMask);
    updatePaletteMask();
  },

  setPrompt(promptText, day) {
    currentDay = day;
    promptTextEl.textContent = `today's prompt: ${promptText}`;
    renderDayLine();
  },

  setStreak(n) {
    currentStreak = n;
    renderDayLine();
  },

  selectSwatch(i) {
    applySelection(i);
  },

  selectBrush(n) {
    brushEls.forEach((el, i) => el.classList.toggle('selected', i + 1 === n));
  },

  setSkyActive(b) {
    $('btn-sky').classList.toggle('active', !!b);
    $('sky-bar').classList.toggle('hidden', !b);
  },

  setBuildY(y) {
    const el = $('sky-y');
    if (el) el.textContent = String(y | 0);
  },

  setMusicMode(mode) {
    const b = $('btn-music');
    if (!b) return;
    const lofi = mode === 'lofi';
    b.classList.toggle('lofi', lofi);
    b.title = lofi ? 'lo-fi beats — tap for golden-hour ambient' : 'golden-hour ambient — tap for lo-fi beats';
  },

  setMessageUsed(used) {
    messageSlotEl.disabled = !!used;
    if (used) messageSlotEl.classList.remove('selected');
  },

  showHelp(defaultName) {
    const fallback = `wanderer-${100 + Math.floor(Math.random() * 900)}`;
    const input = $('help-name');
    const startBtn = $('help-start');
    input.value = ((defaultName || '').trim() || fallback).slice(0, NAME_MAX);
    show(overlayHelp);
    autoFocus(input);
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        hide(overlayHelp);
        overlayHelp.removeEventListener('click', onClick);
        input.removeEventListener('keydown', onKey);
        startBtn.removeEventListener('click', finish);
        resolve(input.value.trim().slice(0, NAME_MAX) || fallback);
      };
      // Dismissible by clicking anywhere — except the name field itself.
      // Dismissal rides the click (not pointerdown) so the tap can't fall
      // through to whatever HUD control sits underneath the overlay.
      const onClick = (e) => {
        if (!e.target.closest('input, label')) finish();
      };
      const onKey = (e) => {
        if (e.key === 'Enter') finish();
      };
      overlayHelp.addEventListener('click', onClick);
      input.addEventListener('keydown', onKey);
      startBtn.addEventListener('click', finish);
    });
  },

  showComposer() {
    const text = $('composer-text');
    const count = $('composer-count');
    const send = $('composer-send');
    const cancel = $('composer-cancel');
    text.value = '';
    count.textContent = `0 / ${NOTE_MAX}`;
    send.disabled = true;
    show(overlayComposer);
    autoFocus(text);
    return new Promise((resolve) => {
      let settled = false;
      let downTarget = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        hide(overlayComposer);
        text.removeEventListener('input', onInput);
        send.removeEventListener('click', onSend);
        cancel.removeEventListener('click', onCancel);
        overlayComposer.removeEventListener('pointerdown', onDown);
        overlayComposer.removeEventListener('click', onBackdrop);
        window.removeEventListener('keydown', onKey);
        resolve(value);
      };
      const onInput = () => {
        count.textContent = `${text.value.length} / ${NOTE_MAX}`;
        send.disabled = text.value.trim().length === 0;
      };
      const onSend = () => finish(text.value.trim().slice(0, NOTE_MAX));
      const onCancel = () => finish(null);
      // Dismiss on click (not pointerdown) so nothing falls through to the
      // HUD, and only when the press also STARTED on the backdrop — a text
      // selection dragged out of the textarea must not close the card.
      const onDown = (e) => { downTarget = e.target; };
      const onBackdrop = (e) => {
        if (e.target === overlayComposer && downTarget === overlayComposer) finish(null);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') finish(null);
      };
      text.addEventListener('input', onInput);
      send.addEventListener('click', onSend);
      cancel.addEventListener('click', onCancel);
      overlayComposer.addEventListener('pointerdown', onDown);
      overlayComposer.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKey);
    });
  },

  showNote({ text, author }) {
    $('note-text').textContent = text;
    $('note-author').textContent = `— ${author}`;
    if (noteCloser) overlayNote.removeEventListener('click', noteCloser);
    show(overlayNote);
    // close on click, not pointerdown, so the tap can't ghost-click the HUD
    noteCloser = () => {
      hide(overlayNote);
      overlayNote.removeEventListener('click', noteCloser);
      noteCloser = null;
    };
    overlayNote.addEventListener('click', noteCloser);
  },

  toast(text, ms = TOAST_MS) {
    toastQueue.push({ text, ms });
    if (!toastActive) nextToast();
  },

  celebrate(streak) {
    celebrateEl.textContent = `${streak} day streak!`;
    celebrateEl.classList.remove('go');
    void celebrateEl.offsetWidth; // restart the animation
    celebrateEl.classList.add('go');
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => celebrateEl.classList.remove('go'), CELEBRATE_MS);
  },

  showContextLost() {
    show(overlayCtxlost);
  },

  setHudHidden(b) {
    document.body.classList.toggle('hud-hidden', !!b);
  },

  // ── the voyage ────────────────────────────────────────────────────────

  setVoyaging(b) {
    closeMenus();
    document.body.classList.toggle('voyaging', !!b);
    if (!b) ui.hideVoyageCard();
  },

  voyageCard({ name, epithet, current, onSail, onStay }) {
    voyageNameEl.textContent = name;
    voyageEpithetEl.textContent = epithet;
    voyageSailEl.textContent = current ? 'you are here' : 'sail';
    voyageSailEl.disabled = !!current;
    voyageOnSail = onSail;
    voyageOnStay = onStay;
    show(voyageCardEl);
  },

  hideVoyageCard() {
    hide(voyageCardEl);
    voyageOnSail = null;
    voyageOnStay = null;
  },

  arrivalCard(name, epithet) {
    arrivalNameEl.textContent = name;
    arrivalEpithetEl.textContent = epithet;
    arrivalEl.classList.remove('go');
    void arrivalEl.offsetWidth; // restart the animation
    arrivalEl.classList.add('go');
    clearTimeout(arrivalTimer);
    arrivalTimer = setTimeout(() => arrivalEl.classList.remove('go'), ARRIVAL_MS);
  },

  // ── the Commons (live chat: talk + /build) ───────────────────────────────

  initChat({ models, expanded, onSend, onBuild, onReport, onExpand }) {
    chatEl = $('chat');
    chatFeedEl = $('chat-feed');
    chatInputEl = $('chat-input');
    chatBuildEl = $('chat-build');
    chatGearEl = $('chat-gear');
    chatModelEl = $('chat-model');
    chatAcEl = $('chat-ac');
    chatSuggestEl = $('chat-suggest');
    chatCountEl = $('chat-count');
    chatOnSend = onSend;
    chatOnBuild = onBuild;
    chatOnReport = onReport;
    chatOnExpand = onExpand;

    chatModelEl.replaceChildren(...(models || []).map(({ id, label, blurb }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = blurb ? `${label} — ${blurb}` : label;
      return opt;
    }));

    // ── submit: one input that chats AND builds ──
    const doBuild = (prompt) => {
      if (!prompt) return;
      if (chatBuildBusy) { ui.chatSys('still building — one at a time'); return; }
      audio.ui();
      if (chatOnBuild) chatOnBuild(chatModelEl.value, prompt);
    };
    const submit = () => {
      const raw = chatInputEl.value.trim();
      hideChatAc();
      hideChatSuggest();
      if (!raw) return;
      if (raw === '/clear') { ui.chatReset(); chatInputEl.value = ''; return; }
      if (/^\/build\b/i.test(raw)) {
        const p = raw.replace(/^\/build\b\s*/i, '').trim();
        if (p) { doBuild(p); chatInputEl.value = ''; restoreChatPlaceholder(); }
        else { chatInputEl.value = '/build '; showChatAc('/build'); }
        return;
      }
      if (/^\/me\b/i.test(raw)) {
        const a = raw.replace(/^\/me\b\s*/i, '').trim();
        if (a && chatOnSend) chatOnSend(a, 'action');
        chatInputEl.value = '';
        restoreChatPlaceholder();
        return;
      }
      // plain chat
      audio.ui();
      if (chatOnSend) chatOnSend(raw, 'chat');
      chatInputEl.value = '';
      restoreChatPlaceholder();
      // soft "build it?" offer for build-y phrasing
      const m = raw.match(CHAT_SOFT_BUILD);
      if (m && m[1] && m[1].trim().length >= 2 && m[1].trim().length <= 80) {
        showChatSuggest(m[1].trim());
      }
    };

    chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
      if (e.key === 'Escape') { hideChatAc(); chatInputEl.blur(); }
    });
    chatInputEl.addEventListener('input', () => {
      const v = chatInputEl.value;
      if (v.startsWith('/') && !/\s/.test(v)) showChatAc(v);
      else hideChatAc();
      if (v) hideChatSuggest();
    });
    chatInputEl.addEventListener('focus', () => {
      stopChatPlaceholder();
      chatInputEl.placeholder = 'say something… or /build';
    });
    chatInputEl.addEventListener('blur', () => {
      setTimeout(hideChatAc, 120);
      if (!chatInputEl.value) startChatPlaceholder();
    });

    chatBuildEl.addEventListener('click', () => {
      const raw = chatInputEl.value.trim();
      if (raw && !/^\/(me|clear)\b/i.test(raw)) {
        const p = raw.replace(/^\/build\b\s*/i, '').trim();
        if (p) { doBuild(p); chatInputEl.value = ''; restoreChatPlaceholder(); return; }
      }
      chatInputEl.value = '/build ';
      chatInputEl.focus();
      showChatAc('/build');
    });

    chatGearEl.addEventListener('click', () => {
      const open = chatModelEl.classList.toggle('hidden') === false;
      chatGearEl.classList.toggle('on', open);
      audio.ui();
    });

    chatSuggestEl.addEventListener('click', () => {
      const subject = chatSuggestEl.dataset.subject || '';
      hideChatSuggest();
      doBuild(subject);
    });

    // the in-rail chevron hides the chat; the 💬 action button reopens it
    $('chat-collapse').addEventListener('click', () => ui.toggleChat(false));
    chatFeedEl.addEventListener('click', (e) => {
      const rep = e.target.closest('.rep');
      if (rep) {
        const row = rep.closest('.chat-row');
        if (row && row.dataset.mid && chatOnReport) {
          chatOnReport(row.dataset.mid);
          row.classList.add('reported');
          rep.textContent = 'reported';
        }
      }
    });

    // keep the composer above the on-screen keyboard (phones)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncChatViewport);
      window.visualViewport.addEventListener('scroll', syncChatViewport);
    }

    chatExpanded = !!expanded;
    document.body.classList.toggle('chat-expanded', chatExpanded);
    syncChatToggleAria();
    startChatPlaceholder();
  },

  // Toggle the chat between shown and fully hidden. The 💬 action button and the
  // in-rail chevron both call this; hidden = #chat display:none, reopened via 💬.
  toggleChat(force) {
    const next = typeof force === 'boolean' ? force : !chatExpanded;
    if (next === chatExpanded) return;
    chatExpanded = next;
    document.body.classList.toggle('chat-expanded', chatExpanded);
    syncChatToggleAria();
    audio.ui();
    if (chatExpanded) {
      clearChatUnread();
      // focus to chat (opens the keyboard on phones — that's the intent here)
      if (chatInputEl) requestAnimationFrame(() => chatInputEl.focus({ preventScroll: true }));
      scrollChatToEnd();
    } else if (chatInputEl) {
      chatInputEl.blur();
      if (chatEl) chatEl.style.bottom = '';   // drop any stale keyboard offset
    }
    if (chatOnExpand) chatOnExpand(chatExpanded);
    return chatExpanded;
  },

  // Append one message. msg = { mid, id, name, text, kind, ts }.
  chatPush(msg) {
    if (!chatFeedEl || !msg) return;
    const row = buildChatRow(msg);
    chatFeedEl.appendChild(row);
    while (chatFeedEl.childElementCount > CHAT_ROWS_MAX) chatFeedEl.firstElementChild.remove();
    scrollChatToEnd();
    if (!chatExpanded && msg.kind !== 'join' && msg.kind !== 'leave') markChatUnread();
  },

  // Replay a batch (recent history on join) without per-row animation noise.
  chatLog(msgs) {
    if (!chatFeedEl) return;
    chatFeedEl.replaceChildren();
    if (Array.isArray(msgs)) for (const m of msgs) chatFeedEl.appendChild(buildChatRow(m, true));
    scrollChatToEnd();
  },

  chatReset() {
    if (chatFeedEl) chatFeedEl.replaceChildren();
  },

  chatHide(mid) {
    if (!chatFeedEl || !mid) return;
    const row = chatFeedEl.querySelector(`[data-mid="${cssEscape(mid)}"]`);
    if (row) row.remove();
  },

  // A local-only system line (errors, build status). Not sent to the room.
  chatSys(text) {
    ui.chatPush({ mid: '', id: '', name: '', text: String(text || ''), kind: 'sys', ts: Date.now() });
  },

  setChatCount(n) {
    if (!chatCountEl) return;
    const c = Math.max(0, n | 0);
    chatCountEl.textContent = c <= 1 ? 'live' : `${c} here`;
  },

  setChatBuildBusy(busy) {
    chatBuildBusy = !!busy;
    if (chatBuildEl) chatBuildEl.disabled = chatBuildBusy;
  },

  getChatModel() {
    return chatModelEl ? chatModelEl.value : '';
  },

  get chatExpanded() {
    return chatExpanded;
  },

  setPhotoMode(b) {
    document.body.classList.toggle('photo-mode', !!b);
    photoExitEl.classList.toggle('hidden', !b);
  },

  setFilming(b) {
    closeMenus();
    document.body.classList.toggle('filming', !!b);
    document.body.classList.toggle('hud-hidden', !!b || document.body.classList.contains('photo-mode'));
    filmingEl.classList.toggle('hidden', !b);
  },

  openShareMenu(items) {
    openMenu(shareMenuEl, items);
  },

  openViewsMenu(items) {
    openMenu(viewsMenuEl, items);
  },

  closeMenus() {
    closeMenus();
  },

  joystickShow(px, py) {
    joyEl.style.left = `${px}px`;
    joyEl.style.top = `${py}px`;
    knobEl.style.transform = 'translate(-50%, -50%)';
    joyEl.classList.add('active');
  },

  joystickMove(dx, dy) {
    const len = Math.hypot(dx, dy);
    const s = len > JOY_TRAVEL ? JOY_TRAVEL / len : 1;
    knobEl.style.transform = `translate(calc(-50% + ${dx * s}px), calc(-50% + ${dy * s}px))`;
  },

  joystickHide() {
    joyEl.classList.remove('active');
  },

  async makeShareCard(renderer, scene, camera, { day, prompt, name, streak }) {
    // Fonts must be resolved BEFORE the render — never between render and drawImage.
    await Promise.all([
      document.fonts.load('500 84px Fredoka'),
      document.fonts.load('600 150px Fredoka'),
    ]).catch(() => {});
    await document.fonts.ready;

    const source = renderer.domElement;
    const prevRatio = renderer.getPixelRatio();
    const prevW = Math.round(source.width / prevRatio);
    const prevH = Math.round(source.height / prevRatio);
    const prevAspect = camera.aspect;

    const card = document.createElement('canvas');
    card.width = CARD_W;
    card.height = CARD_H;
    const ctx = card.getContext('2d');

    // Re-render at postcard resolution and copy in the same task — the WebGL
    // buffer is not preserved, so no awaits between render and drawImage.
    camera.aspect = CARD_W / CARD_H;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(1);
    renderer.setSize(CARD_W, CARD_H, false);
    renderer.render(scene, camera);
    ctx.drawImage(source, 0, 0, CARD_W, CARD_H);

    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevW, prevH, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera); // refill the on-screen buffer, no flicker

    drawCardOverlay(ctx, { day, prompt, name, streak });

    const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
    const flame = streak > 0 ? ` · 🔥${streak}` : '';
    return {
      blob,
      shareText: `buildle day ${day} · "${prompt}"${flame} · ${SHARE_URL}`,
      filename: `buildle-day-${day}.png`,
    };
  },
};
