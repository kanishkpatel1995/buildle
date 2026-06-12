# buildle

**One prompt. One world. Build together.**

Buildle is a daily building ritual that lives in your browser. Every day there's one prompt — "build something cozy", "build your breakfast" — and one shared plaza floating above a sea of sunset clouds. You wander in as a tiny voxel person, place blocks from a sixteen-color palette tuned to the golden hour, leave a small note for whoever comes next, and keep a streak going one day at a time. Think Wordle's daily ritual, Minecraft's blocks, and r/place's shared canvas, wearing Monument Valley's light.

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
| `prompts.js` | the 60 daily prompts + date logic |
| `storage.js` | load/save abstraction (localStorage today, API tomorrow) |

## Roadmap

- **Phase 1 — the ritual** (you are here): one shared-looking world, daily prompts, building, message blocks, streaks, share cards. Saved locally in your browser.
- **Phase 2 — shared persistence**: swap `storage.js` for a small API so everyone's blocks land in the same world for real.
- **Phase 3 — live multiplayer**: see other wanderers walking and building around you in real time.
- **Phase 4 — billboards + Vibeverse portal**: a few tasteful in-world billboards, and a portal to hop between worlds in the Vibeverse.

Built with vanilla JavaScript and three.js. Beauty first.
