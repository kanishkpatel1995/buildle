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
const SHARE_URL = 'buildle.vercel.app';
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
let swatchEls = [];
let messageSlotEl = null;

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
  init({ onSelectColor, onSelectMessage, onShare, onToggleSound, onHelp }) {
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

    $('btn-share').addEventListener('click', onShare);
    soundBtn.addEventListener('click', () => {
      onToggleSound();
      syncSoundIcon();
    });
    syncSoundIcon();
    $('btn-help').addEventListener('click', onHelp);
    $('ctxlost-reload').addEventListener('click', () => location.reload());

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
