# buildle

**One prompt. One world. Build together.**

**Play it now → [buildle.zonivan.com](https://buildle.zonivan.com)** (or [buildle.vercel.app](https://buildle.vercel.app))

Buildle is a daily building ritual that lives in your browser. Every day there's one prompt — "build something cozy", "build your breakfast" — and one shared plaza floating above a sea of sunset clouds. You wander in as a tiny voxel person, place blocks from a sixteen-color palette tuned to the golden hour, leave a small note for whoever comes next, and keep a streak going one day at a time. Think Wordle's daily ritual, Minecraft's blocks, and r/place's shared canvas, wearing Monument Valley's light.

A few things make it feel alive:

- **The voyage** — tap the compass and the camera rises above the clouds until the whole archipelago becomes your map. Pick an island, sail there on a cinematic arc, and arrive to its name fading in over the dock.
- **Seven islands** — the shared plaza, the gardener's isle, and five hand-authored worlds to wander: ember canyon and its waterfall leaping into the sky, the half-drowned ruins of lowtide, wicklight harbor's lantern strings, the hanging orchard's terraces, and the astronomer's reach piercing the fog.
- **The foundry** — sail to the foundry, pick an AI model (DeepSeek, Gemini, GPT, Claude…), type what you want — "a cherry blossom tree", "a small cottage" — and watch the builder raise it block by block on the plinth. Different models build differently; it's a playable model garden.
- **Live wanderers** — when someone else is on your island, you see them walking and building in real time, name and all.
- **The song of the day** — a generative soundtrack (warm pads, slow phasing notes, rare chimes) is seeded from the date and phase-locked to UTC midnight, so everyone on Earth hears the same notes at the same moments. Your blocks play notes too: the higher you build, the higher the pitch.
- **The gardener's island** — a little gardener builds something new every day, block by block, finishing around sunset.
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
| `islands.js` | the archipelago registry, island loader, impostor baker |
| `islands/*.js` | the hand-authored showcase islands |
| `voyage.js` | the map mode, island flights, arrival cards |
| `foundry.js` | the AI build animator + the builder NPC |
| `presence.js` | live wanderers — remote avatars, interpolation |
| `sync.js` | the shared-plaza client (polled deltas, charge meter) |
| `prompts.js` | the 60 daily prompts + date logic |
| `storage.js` | local save/load (streak, name) |
| `server/` | the Cloudflare Worker — shared world, AI builds, presence |

## The backend

The [`server/`](server/) Cloudflare Worker is live at `buildle-api.buildle.workers.dev`:

- **`IslandDO`** (SQLite) holds the shared plaza — polled deltas, a charge meter, daily reset with archives.
- **`/api/build`** turns a prompt into a validated voxel build via OpenRouter (the foundry). The API key is a Worker secret; builds are rate-limited and moderated.
- **`PresenceDO`** relays live positions over WebSockets — one ephemeral room per island.

Deploy with `wrangler deploy` from `server/`; secrets via `wrangler secret put`.

## Roadmap

- ✅ **The ritual** — daily prompts, building, message blocks, streaks, share cards.
- ✅ **Shared persistence** — one true plaza on Cloudflare, polled sync, daily reset.
- ✅ **The worlds** — the archipelago, the voyage, living water, the foundry's AI builds.
- ✅ **Live wanderers** — see other people in real time.
- **Next** — the model garden (vote on rival AI builds of the daily prompt), a gallery of past days, and a portal to neighboring worlds.

Built with vanilla JavaScript and three.js. Beauty first.
