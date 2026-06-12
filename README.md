# buildle

**One prompt. One world. Build together.**

Buildle is a daily building ritual that lives in your browser. Every day there's one prompt — "build something cozy", "build your breakfast" — and one shared plaza floating above a sea of sunset clouds. You wander in as a tiny voxel person, place blocks from a sixteen-color palette tuned to the golden hour, leave a small note for whoever comes next, and keep a streak going one day at a time. Think Wordle's daily ritual, Minecraft's blocks, and r/place's shared canvas, wearing Monument Valley's light.

A few things make it feel alive:

- **The song of the day** — a generative soundtrack (warm pads, slow phasing notes, rare chimes) is seeded from the date and phase-locked to UTC midnight, so everyone on Earth hears the same notes at the same moments. Your blocks play notes too: the higher you build, the higher the pitch.
- **The gardener's island** — a smaller island floats off to the north-east where a little gardener builds something new every day, block by block, finishing around sunset. Tap the compass to visit. Look, don't touch.
- **Photo mode and sky view** — hide the HUD, drift around your build with a tilt-shift lens, or rise into a slow overhead orbit. P and O on a keyboard, or the aperture button.
- **The share clip** — one tap films an 8-second drone orbit of the island as a vertical video (with the soundtrack), ending on your postcard. Made for sharing.

## Run it locally

No build step, no install. Serve the folder with any static server and open it:

```sh
python3 -m http.server
# or
npx serve
```

Then visit `http://localhost:8000` (or whatever port your server prints).

## Deploy to Vercel

Zero config, two ways:

- **Drag and drop** — go to [vercel.com/new](https://vercel.com/new) and drop the project folder onto the page.
- **CLI** — run `vercel` in the project root and accept the defaults.

It's a static site; Vercel figures out the rest.

## Controls

**Desktop**

| input | action |
|---|---|
| WASD / arrow keys | move |
| left drag | orbit camera |
| scroll | zoom |
| left click | place block |
| right click / shift+click | remove block |
| 1–9 | select color |
| M | select message block |
| P | photo mode |
| O | sky view |
| Escape | back to walking |

**Mobile**

| input | action |
|---|---|
| left half drag | joystick (move) |
| right half drag | orbit camera |
| tap | place block |
| long press | remove block |
| pinch | zoom |

Placement reaches six blocks from your character, so you'll do some walking. That's the point.

## Files

| file | what it does |
|---|---|
| `index.html` | markup, import map, UI skeleton |
| `style.css` | all UI styling |
| `main.js` | bootstrap, environment, input, game loop |
| `world.js` | voxel data, chunk meshing, place/remove |
| `player.js` | character, camera, movement, collision |
| `ui.js` | HUD, palette, overlays, share card |
| `audio.js` | WebAudio synth sounds |
| `music.js` | the generative song of the day (Tone.js) |
| `views.js` | photo mode, sky view, drone paths |
| `capture.js` | the 8-second vertical share clip |
| `bot.js` | the gardener — walks, builds, admires |
| `botbuilds.js` | seven hand-authored daily builds |
| `prompts.js` | the 60 daily prompts + date logic |
| `storage.js` | load/save abstraction (localStorage today, API tomorrow) |

## Roadmap

- **Phase 1 — the ritual**: daily prompts, building, message blocks, streaks, share cards. Saved locally in your browser.
- **Phase 2 — shared persistence** (built, awaiting deploy): a Cloudflare Worker + Durable Object backend lives in [`server/`](server/) — one shared world, polled sync, charge meter, daily reset with archives. The game ships with the sync adapter dormant; deploying the worker and setting its URL in `sync.js` turns the plaza truly shared.
- **Phase 3 — live multiplayer**: see other wanderers walking and building around you in real time.
- **Phase 4 — billboards + Vibeverse portal**: a few tasteful in-world billboards, and a portal to hop between worlds in the Vibeverse.

Built with vanilla JavaScript and three.js. Beauty first.
