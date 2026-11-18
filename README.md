# Shohoku Fantasy

NBA fantasy tools for my Yahoo league. Slam Dunk theme.

[Project page](https://shohoku-fantasy-companion.milchyboi.chatgpt.site)

Planned: daily briefing, lineups, waiver picks, weekly matchups, and streaming.

The public link is the landing page. The dashboard runs locally; Yahoo API access is pending.

Open `index.html` to preview.

Dashboard: `npm start`, then open http://127.0.0.1:4173.

Data stays outside this repo in `../../data/private`. Set `FANTASY_DATA_DIR` to use a different folder. No Yahoo credentials are stored.

`npm test` checks the lineup and streaming calculations. `npm run check` checks the snapshot.
