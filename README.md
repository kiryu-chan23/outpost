# Outpost — personal chess training

A local-first chess trainer for one person: play the engine, review your games,
retry the moments that cost you, drill tactics with spaced repetition, learn
endgames and openings, and see what keeps going wrong.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev            # http://127.0.0.1:5180 with hot reload
# or a production build:
npm run build && npm run serve   # http://127.0.0.1:5180
```

The `dist/` folder is a plain static site (all paths relative), so any static
host works. Don't open `index.html` from the file system: the engine worker
needs http(s).

### Syncing games from chess.com and Lichess

Both sites publish games without a login, and the app fetches them straight from the browser. That works when the app runs from your own computer (`npm run dev`, or `npm run build` and serve `dist/` with any static server) or from a normal website such as GitHub Pages. The preview inside the chat runs in a sandbox that blocks connections to other sites; there the Data page shows download links for your newest games and a box to drop the files into.

### Put it online with GitHub Pages (free)

1. Create an empty repository on GitHub (for example `outpost`). Don't add a README or licence.
2. In this folder: `git remote add origin https://github.com/<you>/outpost.git` then `git push -u origin main`.
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. The **Deploy to GitHub Pages** workflow runs the tests, builds the app and publishes it to `https://<you>.github.io/outpost/`. Every later push to `main` updates the site.

Your training data lives in each browser, per site. To move it from another copy, use **Data → Export training data** there and **Import a backup file** on the new site.

## Checks

```bash
npm test               # unit tests: rules, PGN, backups, spaced repetition, insights, content integrity
npm run build && npm run serve &   # then:
npm run e2e            # headless-Chrome run of every workflow at desktop and mobile widths
npm run content:verify # re-checks lessons, drills and seed lines with Stockfish (slow)
```

`npm run e2e` needs Playwright and Chrome. Set `PW_MODULES` to the folder holding
`node_modules/playwright` and `CHROME` to the browser path if they differ from the defaults.

## What's inside

| Area | What it does |
|---|---|
| Home | One next action picked from your data (resume game → review last game → due puzzles → most common mistake theme → convert a thrown win → lesson → rated training), shown on the actual position, then stats, recent games and activity |
| Play | Engine opponent (8 levels), side choice, clocks, coach hints with blunder warnings and takebacks, **blunder check** (mark what's in danger before every move, scored), PGN copy/save, practice from any FEN |
| Review | Bulk PGN import (several files, drag and drop, duplicates skipped, your usernames ticked automatically), background batch analysis, Stockfish in a Web Worker with progress and cancel, evaluation graph, turning points, missed tactics, plain-English explanations, **Try again**, **Save for practice**, **clock review** from `[%clk]` data, blunder-check results, **guided review** (walks you through your biggest mistakes and the chances you missed, asking you to find the move before showing it), **threat arrows** (what your opponent was threatening when you went wrong, plus your move, their answer and the better move), **missed punishments** (moves where your opponent blundered and you didn't take advantage) |
| Tactics | 4,115 puzzles (4,000 rated Lichess puzzles + 115 Outpost puzzles), an adaptive **puzzle rating**, staged hints (what to look for → which piece → the move), wrong moves refuted on the board, spaced repetition for misses, positions saved from your own games |
| Learn | **Your path** (5 stages, 20 steps; the next stage opens when half of the one before is done, or skip ahead; a “do this next” pick based on the mistakes in your recent reviewed games), lessons that **end with positions from your own games** where that idea mattered, a **calculation trainer** (read a line while the board stays still, then answer where pieces ended up, what's on a square, the material count, check or mate; depth goes up after two perfect lines and down after two misses), **Theme academy** (all 63 Lichess puzzle themes, each with a lesson, real examples to step through and practice at your level), **Convert your wins** (positions where you were winning and didn't win, played out against the engine), 7 interactive lessons and 6 endgame drills |
| Openings | Repertoire lines for White and Black with per-move notes; rehearse from memory across branching lines |
| Insights | Recurring mistakes, puzzle accuracy by theme, results by opening, accuracy trend, 4-week activity; thrown wins, clock and blunder-check stats, **punishing mistakes** (how often you cash in on your opponent's errors); each finding links to practice |
| Live training | **Post-game debrief** (while Outpost is open it checks your accounts every few minutes; a just-finished game is analysed ahead of any backlog and you get a one-minute fix-it on its biggest moment, with an optional browser notification), **live coach** in Play (an instant warning before a move that hangs material or allows mate, a verdict on every move, and training wheels that step down after three clean games in a row), **goals and trends** (hung pieces, blunders, mistakes, missed tactics and accuracy over your last 10 vs last 50 reviewed games; one goal tied to your biggest weakness, on Home and Insights) |
| Data | **Account sync** (chess.com + Lichess usernames; new games come in on open, at most every 3 hours, with your side set, then get analysed in the background; when the page can't reach the sites it offers one-click download links and a drop box instead), export/import (merge or replace) of all training data, settings, licences |

Data lives in the browser: games in IndexedDB (database `outpost`), everything else in localStorage (`outpost:v1:*`). Older versions kept games in localStorage; they're moved across automatically. Export a backup now and then.

## Content and licences

- Rules: chess.js (BSD-2). Board: chessground (GPL-3.0). Engine: Stockfish 19 via stockfish.js (GPL-3.0, `public/engine/COPYING.txt`).
- Pieces: Colin M.L. Burnett's set (GPLv2+), recoloured by `scripts/build-pieces.mjs`.
- Fonts: Inter, Fraunces, JetBrains Mono (OFL).
- Rated puzzles: the Lichess puzzle database (CC0), a 4,000-puzzle selection in `src/data/lichess-puzzles.json`.
- Starter puzzles: mined from Stockfish self-play (`scripts/mine-*.mjs`) and rebuilt/verified by `scripts/build-puzzles.mjs`; lessons, notes and seed repertoire are original.
- The app as a whole is GPL-3.0-or-later.
