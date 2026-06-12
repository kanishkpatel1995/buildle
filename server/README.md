# buildle-api

Cloudflare Workers backend for the Buildle shared plaza: one Durable Object (SQLite) holds
the day's blocks, edit log, player budgets, and protection lists, and resets at UTC midnight
(archiving the closing day for the gallery).

Local dev: `npm install` then `npx wrangler dev` (serves http://localhost:8787).

Production: `npx wrangler deploy`, then set the real secret with
`npx wrangler secret put TOKEN_SECRET` (the dev value in wrangler.toml is a placeholder).

After deploying, put the workers.dev URL (e.g. https://buildle-api.<account>.workers.dev)
into `DEFAULT_API` in the game's sync.js.
