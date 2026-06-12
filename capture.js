// capture.js — the one-tap share clip: a 7.5s eased sunsetRing drone orbit
// rendered into a vertical composite canvas with a Fredoka watermark, plus the
// share postcard held for 1s, recorded with the live soundtrack. Every touched
// resource is restored in the finally block on every path, including thrown
// errors and unsupported codecs.

import * as THREE from 'three';

// ── Format ───────────────────────────────────────────────────────────────
const DESKTOP_W = 1080, DESKTOP_H = 1920;
const MOBILE_W = 720, MOBILE_H = 1280;
const MOBILE_MAX_W = 700;            // coarse pointer or narrower → mobile preset
const ORBIT_S = 7.5;                 // drone orbit duration
const HOLD_S = 1;                    // postcard end-frame hold
const STREAM_FPS = 30;
const ORBIT_RADIUS = 20;             // sunsetRing radius around the clip center
const WATCHDOG_GRACE_MS = 4000;      // stalled rAF (hidden tab) → abort + restore

// ── Encoding ─────────────────────────────────────────────────────────────
const MIME_PREFS = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
const VIDEO_BPS_DESKTOP = 10_000_000;
const VIDEO_BPS_MOBILE = 6_000_000;
const AUDIO_BPS = 128_000;

// ── Watermark & end-frame ────────────────────────────────────────────────
const MARK_SIZE_FRAC = 0.041;        // font size ×width (≈44px at 1080)
const MARK_Y_FRAC = 0.86;            // bottom-center, clear of platform UI zones
const MARK_FILL = 'rgba(255, 255, 255, 0.85)';
const END_SKY_TOP = '#3D2C5A';
const END_SKY_MID = '#C96F8E';
const END_SKY_BOTTOM = '#F2B077';

const easeInOut = (u) => u * u * (3 - 2 * u);

let busy = false;

export const capture = {
  isSupported() {
    return !!(HTMLCanvasElement.prototype.captureStream && window.MediaRecorder);
  },

  get busy() {
    return busy;
  },

  // → { blob, filename, mimeType } | null on any failure (after full restore).
  async recordClip({ renderer, scene, player, views, ui, audio, meta }) {
    if (busy || !capture.isSupported()) return null;
    busy = true;

    // Snapshots live outside the try but are ASSIGNED inside it, so an early
    // throw (bad argument, lost context) can never wedge `busy` or make the
    // finally block restore with garbage.
    let camera, source, prevRatio, prevW, prevH, prevAspect;

    let raf = 0;
    let watchdog = 0;
    let recorder = null;
    let stream = null;
    let audioTrack = null;
    let cardUrl = '';

    try {
      // Snapshot everything the finally block restores, before touching anything.
      camera = player.camera;
      source = renderer.domElement;
      prevRatio = renderer.getPixelRatio();
      prevW = Math.round(source.width / prevRatio);
      prevH = Math.round(source.height / prevRatio);
      prevAspect = camera.aspect;

      await document.fonts.ready;   // Fredoka must be live before any compositing

      const mimeType = MIME_PREFS.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mimeType) return null;

      // 1 — postcard end-frame FIRST: makeShareCard resizes the renderer and
      // restores it itself, so it must finish before filming re-sizes anything.
      const card = await ui.makeShareCard(renderer, scene, camera, {
        day: meta.day, prompt: meta.prompt, name: meta.name, streak: meta.streak,
      });
      const endFrame = new Image();
      cardUrl = URL.createObjectURL(card.blob);
      endFrame.src = cardUrl;
      await endFrame.decode();

      const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < MOBILE_MAX_W;
      const w = mobile ? MOBILE_W : DESKTOP_W;
      const h = mobile ? MOBILE_H : DESKTOP_H;
      const aspect = w / h;
      const markFont = `500 ${Math.round(w * MARK_SIZE_FRAC)}px Fredoka, sans-serif`;
      await document.fonts.load(markFont).catch(() => {});

      // 2 — enter the vertical filming state and take the camera.
      ui.setFilming(true);
      source.classList.add('filming');
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      views._beginExternalDrive();

      const c = meta.center ?? player.position;
      const center = new THREE.Vector3(c.x, c.y ?? 0, c.z);
      const path = views.makeDronePath('sunsetRing', center, ORBIT_RADIUS);

      // 3 — composite canvas: drone render + watermark, then the end-frame.
      const composite = document.createElement('canvas');
      composite.width = w;
      composite.height = h;
      const ctx = composite.getContext('2d');
      if (!ctx) return null;

      const markText = `buildle · day ${meta.day}`;
      const markX = w / 2;
      const markY = Math.round(h * MARK_Y_FRAC);

      const fit = Math.min(w / endFrame.naturalWidth, h / endFrame.naturalHeight);
      const cardW = Math.round(endFrame.naturalWidth * fit);
      const cardH = Math.round(endFrame.naturalHeight * fit);
      const cardX = Math.round((w - cardW) / 2);
      const cardY = Math.round((h - cardH) / 2);
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, END_SKY_TOP);
      skyGrad.addColorStop(0.55, END_SKY_MID);
      skyGrad.addColorStop(1, END_SKY_BOTTOM);

      // 4 — stream + recorder; the soundtrack joins via the shared record
      // destination when audio is live (clip stays silent-video otherwise).
      stream = composite.captureStream(STREAM_FPS);
      const recStream = new MediaStream(stream.getVideoTracks());
      const live = typeof audio.getRecordStream === 'function' ? audio.getRecordStream() : null;
      const liveTrack = live && live.getAudioTracks()[0];
      if (liveTrack) {
        audioTrack = liveTrack.clone();   // stop the clone later, never the shared track
        recStream.addTrack(audioTrack);
      }
      recorder = new MediaRecorder(recStream, {
        mimeType,
        videoBitsPerSecond: mobile ? VIDEO_BPS_MOBILE : VIDEO_BPS_DESKTOP,
        audioBitsPerSecond: AUDIO_BPS,
      });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();

      // 5 — the eased orbit, then the postcard letterboxed over a dusk
      // gradient, held while still recording.
      const camPos = new THREE.Vector3();
      const camLook = new THREE.Vector3();
      const drawOrbitFrame = (elapsed) => {
        // a mid-capture window resize must never distort the recording
        if (source.width !== w || source.height !== h) renderer.setSize(w, h, false);
        if (camera.aspect !== aspect) {
          camera.aspect = aspect;
          camera.updateProjectionMatrix();
        }
        path.getPose(easeInOut(Math.min(1, elapsed / ORBIT_S)), camPos, camLook);
        camera.position.copy(camPos);
        camera.lookAt(camLook);
        renderer.render(scene, camera);
        ctx.drawImage(source, 0, 0, w, h);
        ctx.font = markFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = MARK_FILL;
        ctx.fillText(markText, markX, markY);
      };
      const drawEndFrame = () => {
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(endFrame, cardX, cardY, cardW, cardH);
      };
      await new Promise((resolve, reject) => {
        watchdog = setTimeout(
          () => reject(new Error('clip capture stalled')),
          (ORBIT_S + HOLD_S) * 1000 + WATCHDOG_GRACE_MS);
        recorder.onerror = (e) => reject(e.error ?? new Error('MediaRecorder failed'));
        const t0 = performance.now();
        const frame = () => {
          try {
            const elapsed = (performance.now() - t0) / 1000;
            if (elapsed >= ORBIT_S + HOLD_S) { resolve(); return; }
            if (elapsed < ORBIT_S) drawOrbitFrame(elapsed);
            else drawEndFrame();
            raf = requestAnimationFrame(frame);
          } catch (err) {
            reject(err);
          }
        };
        raf = requestAnimationFrame(frame);
      });

      // 6 — finish: stop → blob.
      recorder.stop();
      await stopped;
      if (chunks.length === 0) return null;
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      return { blob, filename: `buildle-day-${meta.day}-clip.${ext}`, mimeType };
    } catch {
      return null;
    } finally {
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already torn down */ }
      }
      if (audioTrack) audioTrack.stop();
      if (stream) for (const track of stream.getTracks()) track.stop();
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      if (source) source.classList.remove('filming');
      if (renderer && prevRatio !== undefined) {
        renderer.setPixelRatio(prevRatio);
        renderer.setSize(prevW, prevH, false);
      }
      if (camera && prevAspect !== undefined) {
        camera.aspect = prevAspect;
        camera.updateProjectionMatrix();
      }
      if (views) {
        views._endExternalDrive();
        views.setMode('follow');  // glides the camera home — never snaps back
      }
      if (ui) ui.setFilming(false);
      busy = false;
      // always let main re-fit to the live window — the cheapest way to be
      // right no matter what resized while capture owned the renderer
      window.dispatchEvent(new Event('resize'));
    }
  },
};
