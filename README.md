# Shohoku Fantasy

NBA fantasy tools for my Yahoo league. Slam Dunk theme.

[Project page](https://shohoku-fantasy-companion.milchyboi.chatgpt.site)

Planned: daily briefing, lineups, waiver picks, weekly matchups, and streaming.

The dashboard is published with GitHub Pages. ESPN games and player logs refresh hourly through GitHub Actions. Scheduled runs can be delayed by GitHub.

Pages loads the public Yahoo league snapshot automatically. Use the team picker to choose a roster. The Yahoo snapshot was captured November 18, 2026. ESPN updates separately.

Dashboard: `npm start`, then open http://127.0.0.1:4173.

For local manager sign-in, place `manager-accounts.json` in the private data folder. Generate each entry with `makeAccount({id, name}, password)` from `manager-auth.mjs` and save the entries as a JSON array. Use the Yahoo team name as the username. The server binds to loopback for local use.

Raw captures and manager accounts stay outside this repo in `../../data/private`. Set `FANTASY_DATA_DIR` to use a different folder. The reviewed public snapshot is `dashboard/public-league.json`.

`npm test` checks the lineup and streaming calculations. `npm run check` checks the snapshot.

Export a league file: `node server.mjs --export-snapshot`. It is saved in the private data folder, outside this repo.

Public refresh: `node public-feed.mjs`. Pages build: `node build-pages.mjs`. Each push to main deploys automatically; the hourly workflow refreshes ESPN and redeploys without changing source history. Failed updates keep the cached feed when available.

Slam Dunk font by Sensatype Studio, embedded for personal use. See `dashboard/fonts/LICENSE.txt`. Commercial use requires a separate license.
