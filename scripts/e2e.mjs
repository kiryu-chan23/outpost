// End-to-end check of the built app in headless Chrome.
//   npm run build && npm run serve   (in another terminal)
//   npm run e2e
// Env: PW_MODULES (folder holding node_modules/playwright), CHROME (browser path), URL.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { Chess } from 'chess.js';

const require = createRequire(process.env.PW_MODULES || '/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:5180/';
const SHOTS = new URL_('./.cache/shots/');
function URL_(p) {
  const u = new globalThis.URL(p, import.meta.url);
  fs.mkdirSync(u, { recursive: true });
  return u;
}
const MINED = JSON.parse(fs.readFileSync(new globalThis.URL('../src/data/puzzles.json', import.meta.url)));
const LICHESS = JSON.parse(fs.readFileSync(new globalThis.URL('../src/data/lichess-puzzles.json', import.meta.url)));
const SOLUTIONS = new Map(MINED.map((p) => [p.fen, p.solution]));
for (const [, fen, moves] of LICHESS) {
  const [lead, ...sol] = moves.split(' ');
  const c = new Chess(fen);
  c.move({ from: lead.slice(0, 2), to: lead.slice(2, 4), promotion: lead[4] });
  SOLUTIONS.set(c.fen(), sol);
}
const { SEED_LINES } = await import('../src/data/repertoire-seed.js');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 880 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
// Failed requests to chess.com / Lichess are expected here: the test machine has no route to them (sync is tested with mocked responses).
page.on('console', (m) => m.type() === 'error' && !/lichess\.org|chess\.com/.test((m.location() || {}).url || '') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const shot = (name) => page.screenshot({ path: new globalThis.URL(`${name}.png`, SHOTS).pathname });
const fen = () => page.locator('.board-box').first().getAttribute('data-fen');
const placement = async () => (await fen()).split(' ')[0];
async function squareCenter(sq) {
  const box = await page.locator('.board-box').first().boundingBox();
  const flipped = await page.locator('.cg-wrap.orientation-black').count();
  const f = sq.charCodeAt(0) - 97;
  const r = +sq[1] - 1;
  const x = flipped ? 7 - f : f;
  const y = flipped ? r : 7 - r;
  return { x: box.x + ((x + 0.5) * box.width) / 8, y: box.y + ((y + 0.5) * box.height) / 8 };
}
async function tap(from, to) {
  const a = await squareCenter(from);
  const b = await squareCenter(to);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(80);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(120);
}
async function drag(from, to) {
  const a = await squareCenter(from);
  const b = await squareCenter(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const uciTap = (u) => tap(u.slice(0, 2), u.slice(2, 4));
async function waitTurn(color, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = await fen();
    if (f && f.split(' ')[1] === color) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
const clickText = (text, opts = {}) => page.getByRole('button', { name: text, exact: !!opts.exact }).first().click();
const go = async (hash) => {
  // Click the navigation like a user would (re-selecting a section resets it).
  const nav = page.locator(`nav a.nav-item[href="#${hash}"]:visible`);
  if (await nav.count()) await nav.first().click();
  else await page.evaluate((h) => (window.location.hash = h), hash);
  await page.waitForTimeout(400);
};

// ---------------------------------------------------------------------------------
await page.goto(URL + '#home');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(600);
ok('home renders one primary next action', (await page.locator('[data-testid=next-action]').count()) === 1, await page.locator('#hero-title').innerText());

// ---- rules through the real board (Play → Start from a FEN) ----------------------------
async function fenGame(f, { coach } = {}) {
  await go('play');
  if (await page.getByRole('button', { name: 'Stop and set up a new game' }).count()) {
    await clickText('Stop and set up a new game');
    await clickText('Stop game', { exact: true });
  }
  if (await page.getByRole('button', { name: 'New game' }).count()) await clickText('New game');
  await page.getByRole('radio', { name: 'No clock' }).click();
  const fenSwitch = page.locator('label.switch', { hasText: 'Start from a FEN' }).locator('input');
  if (!(await fenSwitch.isChecked())) await page.locator('label.switch', { hasText: 'Start from a FEN' }).click();
  await page.fill('#fen-input', f);
  if (coach !== undefined) {
    const sw = page.locator('label.switch', { hasText: 'Live coach' });
    if ((await sw.locator('input').isChecked()) !== coach) await sw.click();
  }
  await page.click('[data-testid=start-game]');
  await page.waitForTimeout(300);
}
await fenGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
await tap('e1', 'g1');
ok('castling kingside (tap e1→g1)', (await placement()).endsWith('/R4RK1'), await placement());
await waitTurn('w');
await fenGame('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
await drag('e5', 'd6');
const ep = (await placement()).split('/');
ok('en passant (drag e5×d6)', ep[2] === '3P4' && ep[3] === '8', ep.join('/'));
await fenGame('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
await tap('b7', 'b8');
const picker = await page.locator('.promo').count();
await shot('promotion-picker');
ok('promotion picker opens', picker === 1);
await page.getByRole('button', { name: 'Promote to knight' }).click();
await page.waitForTimeout(200);
ok('under-promotion to a knight', (await placement()).startsWith('1N'), await placement());
await fenGame('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
const before = await fen();
await tap('a1', 'b2'); // illegal for a rook: board must not change
ok('illegal move rejected', (await fen()) === before);
await tap('a1', 'a8');
await page.waitForTimeout(500);
ok('checkmate ends the game', (await page.locator('.note', { hasText: 'You won' }).count()) > 0, await page.locator('.note h4').first().innerText().catch(() => ''));
await shot('checkmate');

// ---- live coach: warning before a blunder, verdict after each move ----------------------------------
await fenGame('r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3', { coach: true });
const coachFen = await fen();
await tap('h5', 'e5'); // Qxe5+?? drops the queen to Nxe5
await page.waitForTimeout(300);
ok('live coach stops a move that hangs the queen, before it is played', (await page.locator('[data-testid=coach-warn]').count()) === 1 && (await fen()) === coachFen);
ok('the warning says what would be lost', /queen you just moved/.test(await page.innerText('[data-testid=coach-warn]')));
await shot('coach-warn');
await page.click('[data-testid=warn-other]');
await page.waitForTimeout(150);
ok('“Choose another move” keeps the position', (await page.locator('[data-testid=coach-warn]').count()) === 0 && (await fen()) === coachFen);
await tap('h5', 'e5');
await page.waitForTimeout(250);
await page.click('[data-testid=warn-play]');
await page.waitForTimeout(300);
ok('“Play it anyway” plays the move', (await fen()) !== coachFen);
await page.waitForSelector('[data-testid=coach-verdict]', { timeout: 20000 }).catch(() => {});
ok('every move gets a verdict', /Blunder|Mistake/.test(await page.locator('[data-testid=coach-verdict]').innerText().catch(() => '')));
await page.getByRole('tab', { name: /Options|Settings|Game options/i }).first().click().catch(() => {});
ok('training-wheels control is in the game options', (await page.locator('[data-testid=wheels]').count()) >= 1);
await fenGame('r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3', { coach: false });
await tap('h5', 'e5');
await page.waitForTimeout(300);
ok('with the coach off, no warning', (await page.locator('[data-testid=coach-warn]').count()) === 0 && (await fen()) !== coachFen);

// ---- play a game vs the computer, resign, review -----------------------------------------
await go('play');
if (await page.getByRole('button', { name: 'Stop and set up a new game' }).count()) {
  await clickText('Stop and set up a new game');
  await clickText('Stop game', { exact: true });
}
if (await page.getByRole('button', { name: 'New game' }).count()) await clickText('New game');
if (await page.locator('label.switch', { hasText: 'Start from a FEN' }).locator('input').isChecked()) await page.locator('label.switch', { hasText: 'Start from a FEN' }).click();
await page.getByRole('radio', { name: '10 min' }).click();
if (!(await page.locator('label.switch', { hasText: 'Live coach' }).locator('input').isChecked())) await page.locator('label.switch', { hasText: 'Live coach' }).click();
await page.click('[data-testid=start-game]');
await page.waitForTimeout(400);
ok('clock is shown', (await page.locator('.clock').count()) === 2);
await tap('e2', 'e4');
ok('engine replies (off the main thread)', await waitTurn('w'));
await page.getByRole('button', { name: 'Hint', exact: true }).click();
await page.waitForSelector('.note:has-text("Hint")', { timeout: 15000 }).catch(() => {});
ok('coach hint points at a piece', (await page.locator('.note', { hasText: 'Look at your' }).count()) > 0);
await drag('g1', 'f3');
await waitTurn('w');
await shot('game-desktop');
// persistence of a game in progress
await page.reload();
await page.waitForTimeout(800);
ok('game in progress survives a reload', (await page.locator('.moves button').count()) >= 4);
await clickText('Resign');
await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
await page.waitForTimeout(300);
ok('resigned game is saved for review', (await page.locator('[data-testid=review-game]').count()) === 1);
await page.click('[data-testid=review-game]');
await page.waitForTimeout(300);
await page.waitForSelector('[data-testid=review-summary], [data-testid=move-feedback]', { timeout: 60000 });
ok('played game analysed', true);

// ---- import a PGN (bad, then good) and work through the critical mistake ----------------------
await go('review');
await clickText('All games').catch(() => {});
await page.waitForTimeout(300);
// progress + cancel on a longer game (the Opera Game, 1858)
await page.fill('#pgn-text', '[White "Morphy"]\n[Black "Allies"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0');
await page.click('[data-testid=import-pgn]');
await page.getByRole('dialog').getByRole('radio', { name: /Neither/ }).click().catch(() => {});
await page.click('[data-testid=confirm-import]');
await page.waitForTimeout(400);
const sawProgress = (await page.locator('[data-testid=analysis-progress]').count()) > 0;
ok('analysis shows progress', sawProgress);
if (sawProgress) {
  await page.click('[data-testid=cancel-analysis]');
  await page.waitForTimeout(300);
  ok('analysis can be cancelled', (await page.locator('[data-testid=analyse]').count()) === 1);
}
await clickText('All games').catch(() => {});
await page.waitForTimeout(300);
await page.fill('#pgn-text', '1. e4 e5 2. Nf9 Nc6');
await page.click('[data-testid=import-pgn]');
await page.waitForTimeout(200);
const badMsg = await page.locator('#pgn-errors').innerText();
ok('invalid PGN gives a readable error', /isn’t legal|couldn’t read/.test(badMsg), badMsg.replace(/\s+/g, ' ').slice(0, 120));
await page.fill('#pgn-text', '[White "Opponent"]\n[Black "ThePawnScum"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
await page.click('[data-testid=import-pgn]');
await page.getByRole('dialog').getByRole('radio', { name: /Black/ }).click();
await page.click('[data-testid=confirm-import]');
await page.waitForSelector('[data-testid=review-summary], [data-testid=move-feedback]', { timeout: 60000 });
ok('eval graph drawn', (await page.locator('.graph svg').count()) > 0);
ok('review opens on the critical mistake', (await page.locator('[data-testid=move-feedback]').count()) === 1);
await page.keyboard.press('Home');
await page.waitForTimeout(200);
ok('summary at the start of the game', (await page.locator('[data-testid=review-summary]').count()) === 1);
await shot('review-summary');
await page.click('[data-testid=go-critical]');
await page.waitForTimeout(300);
const expl = await page.locator('[data-testid=explanation]').innerText().catch(() => '');
ok('blunder flagged with a plain-English reason', /checkmate|mate/i.test(expl), expl);
await shot('review-mistake');
// keyboard replay
const f0 = await fen();
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(150);
const f1 = await fen();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
ok('arrow keys step through moves', f0 !== f1 && (await fen()) === f0);
await page.click('[data-testid=try-again]');
await page.waitForTimeout(250);
const hidden = await page.locator('.cg-shapes line, .cg-shapes circle').count();
ok('“Try again” hides the suggested move', hidden === 0 && (await page.locator('[data-testid=retry-panel]').count()) === 1);
await tap('g8', 'f6');
await page.waitForTimeout(300);
ok('replaying the game move is called out', (await page.locator('.note', { hasText: 'what you played' }).count()) > 0);
await tap('g7', 'g6');
await page.waitForSelector('.note:has-text("That’s the one"), .note:has-text("Not quite")', { timeout: 30000 });
ok('a good retry is accepted', (await page.locator('.note', { hasText: 'That’s the one' }).count()) > 0);
await page.click('[data-testid=save-practice]');
await page.waitForTimeout(200);
ok('position saved for practice', (await page.locator('.chip', { hasText: 'In your practice queue' }).count()) > 0);
await shot('review-retry');

// ---- guided review ----------------------------------------------------------------------------
await clickText('Back to the review');
await page.waitForTimeout(150);
await page.keyboard.press('Home');
await page.waitForTimeout(250);
await page.click('[data-testid=start-guide]');
await page.waitForTimeout(300);
ok('guided review asks before revealing anything', (await page.locator('[data-testid=guide-panel]').count()) === 1 && (await page.locator('.cg-shapes line').count()) === 0);
await tap('g7', 'g6');
await page.waitForSelector('[data-testid=guide-next]', { timeout: 30000 });
ok('guided review judges your move', (await page.locator('.note', { hasText: /exactly right|works/ }).count()) > 0);
await page.waitForSelector('[data-testid=guide-threat]', { timeout: 20000 }).catch(() => {});
ok('guided review names the threat you missed', /Qxf7/.test(await page.locator('[data-testid=guide-threat]').innerText().catch(() => '')), await page.locator('[data-testid=guide-threat]').innerText().catch(() => 'none'));
await page.waitForFunction(() => document.querySelectorAll('.cg-shapes line').length >= 3, null, { timeout: 5000 }).catch(() => {});
ok('arrows show your move, their answer and the better move', (await page.locator('.cg-shapes line').count()) >= 3);
await shot('guide-explain');
await page.click('[data-testid=guide-next]');
await page.waitForTimeout(250);
ok('guided review ends with what the game teaches', (await page.locator('[data-testid=guide-done]').count()) === 1);
await shot('guide-done');

// ---- missed punishment -------------------------------------------------------------------------
await go('review');
await clickText('All games').catch(() => {});
await page.waitForTimeout(200);
await page.fill('#pgn-text', '[White "ThePawnScum"]\n[Black "Gifter"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Qg5 3. d3 Qd8 4. Nc3 Nf6 *');
await page.click('[data-testid=import-pgn]');
await page.click('[data-testid=confirm-import]');
await page.waitForSelector('[data-testid=review-summary], [data-testid=move-feedback]', { timeout: 60000 });
await page.keyboard.press('Home');
await page.waitForTimeout(250);
ok('review flags the chance you missed', (await page.locator('[data-testid=missed-chance]').count()) === 1, await page.locator('.note', { hasText: 'Chances your opponent' }).innerText().catch(() => 'none'));
await page.click('[data-testid=missed-chance]');
await page.waitForTimeout(400);
ok('missed chance explained (the free queen)', /queen|Nxg5/i.test(await page.locator('[data-testid=explanation]').innerText().catch(() => '')));

// ---- tactics ---------------------------------------------------------------------------------------
await go('home');
await go('tactics');
await page.click('[data-testid=start-mine]');
await page.waitForTimeout(400);
await tap('d8', 'e7');
await page.waitForSelector('.turn-pill:has-text("Solved"), .note:has-text("Not quite")', { timeout: 30000 });
ok('saved position plays as a puzzle (engine-judged)', (await page.locator('.turn-pill', { hasText: 'Solved' }).count()) > 0);
await clickText('End session');

await page.click('[data-testid=theme-fork]');
await page.waitForTimeout(1300);
for (let n = 0; n < 2; n++) {
  const f = await fen();
  const sol = SOLUTIONS.get(f);
  ok(`fork puzzle ${n + 1} found on the board`, !!sol, f);
  if (!sol) break;
  if (n === 0) {
    const c = new Chess(f);
    const wrong = c.moves({ verbose: true }).find((m) => m.from + m.to !== sol[0].slice(0, 4) && !(() => { const d = new Chess(f); d.move(m); return d.isCheckmate(); })());
    await tap(wrong.from, wrong.to);
    await page.waitForSelector('.note:has-text("Back to the puzzle")', { timeout: 15000 }).catch(() => {});
    ok('wrong move is refuted with the opponent’s reply', /answers|level|stalemate|off the hook/.test(await page.locator('.note', { hasText: 'Not quite' }).first().innerText()));
    await page.waitForTimeout(2200);
    ok('board goes back to the puzzle after the refutation', (await fen()) === f);
    await page.click('[data-testid=puzzle-hint]');
    await page.waitForTimeout(150);
    ok('first hint says what to look for, not the move', (await page.locator('.note', { hasText: 'Scan before you move' }).count()) > 0);
    await page.click('[data-testid=puzzle-hint]');
    await page.waitForTimeout(150);
    ok('second hint names the piece', (await page.locator('.note', { hasText: 'Use your' }).count()) > 0);
  }
  for (let i = 0; i < sol.length; i += 2) {
    await page.waitForTimeout(100);
    await uciTap(sol[i]);
    if (sol[i][4] && (await page.locator('.promo').count())) await page.getByRole('button', { name: /Promote to queen/ }).click();
    if (i + 1 < sol.length) await page.waitForTimeout(700);
  }
  await page.waitForTimeout(300);
  ok(`fork puzzle ${n + 1} solved, opponent replies played`, (await page.locator('[data-testid=puzzle-next]').count()) === 1);
  ok(`puzzle rating updates after puzzle ${n + 1}`, (await page.locator('[data-testid=rating-change]').count()) === 1, await page.locator('[data-testid=rating-change]').innerText().catch(() => ''));
  if (n === 0) await shot('puzzle-solved');
  await page.click('[data-testid=puzzle-next]');
  await page.waitForTimeout(1300);
}
await clickText('End session');

// ---- bulk import with clocks, background analysis ---------------------------------------
const bulkPgn = [1, 2, 3].map((n) => `[White "ThePawnScum"]\n[Black "Rival${n}"]\n[Result "0-1"]\n[TimeControl "600"]\n[Link "https://www.chess.com/game/live/9${n}"]\n\n1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:55]} 2. Qh5 {[%clk 0:08:10]} 2... Nc6 {[%clk 0:09:50]} 3. Bc4 {[%clk 0:08:00]} 3... Nf6 {[%clk 0:09:45]} 4. Qxf7# {[%clk 0:07:59]} 1-0`.replace('[Result "0-1"]', '[Result "1-0"]')).join('\n\n');
fs.writeFileSync('/tmp/outpost-bulk.pgn', bulkPgn);
await go('review');
await clickText('All games').catch(() => {});
await page.waitForTimeout(300);
await page.setInputFiles('[data-testid=pgn-files]', '/tmp/outpost-bulk.pgn');
await page.waitForSelector('[role=dialog]');
const dlg = await page.getByRole('dialog').innerText();
ok('bulk import finds 3 games and ticks my username', /Import 3 games/.test(dlg) && (await page.getByRole('dialog').locator('input[type=checkbox]').first().isChecked()), dlg.replace(/\s+/g, ' ').slice(0, 90));
await page.click('[data-testid=confirm-import]');
await page.waitForTimeout(400);
const sawBatch = (await page.locator('[data-testid=batch-panel]').count()) > 0 || (await page.locator('.batch-pill').count()) > 0;
await page.waitForFunction(() => !document.querySelector('[data-testid=batch-panel]'), null, { timeout: 60000 }).catch(() => {});
const rivals = page.locator('.list-row', { hasText: 'Rival' });
ok('imported games analysed in the background', (await rivals.count()) === 3 && (await rivals.locator('.chip', { hasText: 'Not reviewed' }).count()) === 0, sawBatch ? 'progress seen' : 'finished before the first check');
await page.setInputFiles('[data-testid=pgn-files]', '/tmp/outpost-bulk.pgn');
await page.waitForSelector('[role=dialog]');
ok('re-importing skips duplicates', /already in your library/.test(await page.getByRole('dialog').innerText()));
await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
await page.locator('.list-row', { hasText: 'Rival1' }).first().click();
await page.waitForTimeout(500);
ok('clock review drawn from %clk data', (await page.locator('[data-testid=clock-section] svg').count()) > 0 && /longest think 1:48/.test(await page.locator('[data-testid=clock-section]').innerText()));
await shot('review-clock');

// ---- blunder check ----------------------------------------------------------------------------------
await fenGame('4k3/8/8/8/3b4/8/1N6/4K3 w - - 0 1');
await page.locator('label.switch', { hasText: 'Blunder check' }).locator('input').isChecked().then(async (on) => { if (!on) await page.locator('label.switch', { hasText: 'Blunder check' }).click(); });
await page.waitForTimeout(200);
await tap('b2', 'd3');
ok('blunder check: no move before the scan', (await placement()) === '4k3/8/8/8/3b4/8/1N6/4K3');
await page.click('[data-testid=scan-done]');
await page.waitForTimeout(200);
ok('blunder check: tapping the hanging knight scores the scan', (await page.locator('.note', { hasText: 'Scan correct' }).count()) > 0);
await shot('blunder-check');
await tap('b2', 'd1');
ok('blunder check: move allowed after scanning', (await placement()).includes('3NK3'));

// ---- lesson & drill -----------------------------------------------------------------------------------
await go('learn');
ok('Learn shows “Convert your wins”', (await page.locator('#h-convert').count()) === 1);
ok('Learn shows the path with one “do this next” step', (await page.locator('[data-testid=path-next]').count()) === 1 && (await page.locator('.path-stage').count()) === 5);
ok('later path stages start locked', (await page.locator('[data-testid=stage-tactics].locked').count()) === 1 && !(await page.locator('[data-testid=step-knight-forks]').isVisible()));
await page.click('[data-testid=skip-tactics]');
await page.waitForTimeout(150);
ok('“Skip ahead” opens a locked stage', (await page.locator('[data-testid=stage-tactics].locked').count()) === 0 && (await page.locator('[data-testid=step-knight-forks]').isEnabled()));
await shot('learn-path');
await page.click('[data-testid=open-academy]');
await page.waitForTimeout(400);
ok('theme academy lists all 63 themes', (await page.locator('[data-testid^=topic-]').count()) === 63);
await page.click('[data-testid=topic-pin]');
await page.waitForTimeout(500);
const pf0 = await fen();
await page.click('[data-testid=academy-step]');
await page.waitForTimeout(200);
ok('academy lesson steps through a real example', (await page.locator('[data-testid=academy-lesson]').count()) === 1 && (await fen()) !== pf0);
await shot('academy-pin');
await go('learn');
await page.click('[data-testid=lesson-loose-pieces]');
await page.waitForTimeout(300);
await tap('c3', 'd5');
ok('lesson move accepted', (await page.locator('.note', { hasText: 'Exactly' }).count()) > 0);
await shot('lesson');
await page.click('[data-testid=lesson-next]');
await page.waitForTimeout(250);
await tap('c3', 'd5');
await page.waitForTimeout(250);
await page.click('[data-testid=lesson-next]');
await page.waitForTimeout(250);
await page.click('[data-testid=lesson-next]'); // last step is explanation only → finish
await page.waitForTimeout(400);
const ownN = await page.locator('[data-testid=own-panel]').count();
console.log('  (positions from my games after the lesson:', ownN ? 'yes' : 'none', ')');
if (ownN) {
  ok('lesson ends with a position from my own games', /You played/.test(await page.locator('[data-testid=own-task]').innerText()));
  await shot('lesson-own');
  for (let k = 0; k < 3 && (await page.locator('[data-testid=own-panel]').count()); k++) {
    await page.click('[data-testid=own-show]');
    await page.waitForTimeout(150);
    await page.click('[data-testid=own-next]');
    await page.waitForTimeout(300);
  }
  ok('lesson-done shows how many of my positions I found', (await page.locator('.note', { hasText: 'from your own games' }).count()) === 1);
}
ok('a lesson can be completed to the end', (await page.locator('[data-testid=lesson-done]').count()) === 1 && (await page.locator('[data-testid=view-error]').count()) === 0);
await go('learn');
ok('finished lesson is marked done', (await page.locator('[data-testid=lesson-loose-pieces] .chip', { hasText: 'Done' }).count()) === 1);
await page.click('[data-testid=drill-kqk]');
await page.waitForTimeout(300);
await tap('d1', 'd3');
ok('drill: engine defends', await waitTurn('w'));
await shot('drill');

// ---- calculation trainer --------------------------------------------------------------------------
await go('learn');
await page.click('[data-testid=open-calc]');
await page.waitForSelector('[data-testid=calc-line]', { timeout: 8000 });
const calcFen0 = await fen();
ok('calculation trainer shows a line to read on a still board', (await page.locator('[data-testid=calc-line] .calc-move').count()) >= 1);
await shot('calc-read');
await page.click('[data-testid=calc-ready]');
await page.waitForTimeout(150);
ok('the board does not move while you answer', (await fen()) === calcFen0);
for (let k = 0; k < 2; k++) {
  if (await page.locator('[data-testid=calc-option]').count()) await page.locator('[data-testid=calc-option]').first().click();
  else {
    const c = await squareCenter('e4');
    await page.mouse.click(c.x, c.y);
  }
  await page.waitForTimeout(200);
}
ok('after answering, results are shown for both questions', (await page.locator('.calc-results li').count()) === 2);
await page.waitForTimeout(2500);
ok('the line then plays out on the board', (await fen()) !== calcFen0);
await shot('calc-done');
await page.click('[data-testid=calc-next]');
await page.waitForTimeout(300);
ok('next line starts a new round', (await page.locator('[data-testid=calc-ready]').count()) === 1);

// ---- repertoire rehearsal --------------------------------------------------------------------------
await go('repertoire');
await page.click('[data-testid=rehearse-w]');
await page.waitForTimeout(300);
const lines = SEED_LINES.filter((l) => l.color === 'w');
const nextFor = (f) => {
  const key = f.split(' ').slice(0, 2).join(' ');
  for (const l of lines) {
    const c = new Chess();
    for (let i = 0; i < l.moves.length; i++) {
      if (c.fen().split(' ').slice(0, 2).join(' ') === key) {
        const m = new Chess(c.fen()).move(l.moves[i]);
        return m.from + m.to;
      }
      c.move(l.moves[i]);
    }
  }
  return null;
};
let slipped = false;
for (let i = 0; i < 12; i++) {
  if (await page.locator('[data-testid=rehearse-again]').count()) break;
  const ready = await waitTurn('w', 4000);
  if (!ready) break;
  const f = await fen();
  const u = nextFor(f);
  if (!u) break;
  if (!slipped && i === 1) {
    const c = new Chess(f);
    const bad = c.moves({ verbose: true }).find((m) => m.from + m.to !== u);
    await tap(bad.from, bad.to);
    await page.waitForTimeout(200);
    ok('rehearsal flags a move outside the repertoire', (await page.locator('.note', { hasText: 'isn’t in your repertoire' }).count()) > 0);
    await page.click('[data-testid=rehearse-continue]');
    slipped = true;
    await page.waitForTimeout(600);
    continue;
  }
  await uciTap(u);
  await page.waitForTimeout(650);
}
ok('rehearsal reaches the end of a line', (await page.locator('[data-testid=rehearse-again]').count()) === 1);
await shot('rehearse');

// ---- insights, export, import, reload ----------------------------------------------------------------------
await go('insights');
await page.waitForTimeout(300);
ok('insights show a recurring mistake with a practice button', (await page.locator('[data-testid=insight-mistake]').count()) > 0);
ok('insights show puzzle themes from real attempts', (await page.locator('.meter-row').count()) > 0);
ok('insights show how often you punish mistakes', /You punished/.test(await page.locator('[data-testid=insight-punish]').innerText()));
await shot('insights');
// ---- account sync ------------------------------------------------------------------------------------
await go('prefs');
ok('Data shows my chess.com and Lichess accounts', (await page.inputValue('[data-testid=acct-chesscom]')) === 'ThePawnScum' && (await page.inputValue('[data-testid=acct-lichess]')) === 'ThePawnScum12');
await page.waitForTimeout(800);
ok('when the sites can’t be reached, download links are offered', (await page.locator('[data-testid=sync-blocked]').count()) === 1 && (await page.locator('[data-testid=dl-link]').count()) === 3);
const gamesBeforeSync = await page.evaluate(() => JSON.parse(localStorage.getItem('outpost:v1:core')).gameOrder.length);
const cors = { 'Access-Control-Allow-Origin': '*' };
const syncPgn = (site, w, b, id) => `[Event "Rated Blitz game"]\n[Site "${site}/${id}"]\n[Date "2026.11.18"]\n[UTCDate "2026.11.18"]\n[UTCTime "19:00:00"]\n[White "${w}"]\n[Black "${b}"]\n[Result "0-1"]\n[TimeControl "180+2"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n`;
await page.route('https://lichess.org/**', (r) => r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/x-chess-pgn' }, body: syncPgn('https://lichess.org', 'Rival', 'ThePawnScum12', 'zzSync01') }));
await page.route('https://api.chess.com/**', (r) =>
  r.request().url().endsWith('/archives')
    ? r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ archives: ['https://api.chess.com/pub/player/thepawnscum/games/2026/11'] }) })
    : r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/x-chess-pgn' }, body: syncPgn('https://www.chess.com', 'Victim', 'ThePawnScum', 'game/live/99') }),
);
await page.click('[data-testid=sync-now]');
await page.waitForFunction(() => /Synced/.test(document.querySelector('[data-testid=acct-lichess-status]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
const gamesAfterSync = await page.evaluate(() => JSON.parse(localStorage.getItem('outpost:v1:core')).gameOrder.length);
ok('“Sync now” imports new games from both sites', gamesAfterSync === gamesBeforeSync + 2);
ok('after a good sync, the blocked note goes away and status says what came in', (await page.locator('[data-testid=sync-blocked]').count()) === 0 && /1 new/.test(await page.innerText('[data-testid=acct-lichess-status]')));
await shot('accounts');
await page.click('[data-testid=sync-now]');
await page.waitForTimeout(800);
ok('syncing again doesn’t duplicate games', (await page.evaluate(() => JSON.parse(localStorage.getItem('outpost:v1:core')).gameOrder.length)) === gamesAfterSync);
await page.unroute('https://lichess.org/**');
await page.unroute('https://api.chess.com/**');
await go('review');
if (await page.locator('button', { hasText: 'All games' }).count()) await page.locator('button', { hasText: 'All games' }).first().click();
await page.waitForTimeout(300);
ok('Review shows the synced accounts with a Sync button', (await page.locator('[data-testid=review-sync]').count()) === 1);
const syncedRow = page.locator('.list li', { hasText: 'Rival' }).first();
ok('synced games appear in the library with my side set', (await syncedRow.count()) === 1);

// ---- debrief right after a synced game, then goals ----------------------------------------------
{
  const t = new Date(Date.now() - 10 * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  const ud = `${t.getUTCFullYear()}.${pad(t.getUTCMonth() + 1)}.${pad(t.getUTCDate())}`;
  const ut = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00`;
  const fresh = `[Event "Rated Blitz game"]\n[Site "https://lichess.org/zzDebrf1"]\n[Date "${ud}"]\n[UTCDate "${ud}"]\n[UTCTime "${ut}"]\n[White "ThePawnScum12"]\n[Black "Gifter"]\n[Result "0-1"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 4. d4 Nc6 5. d5 Nd4 6. Bd3 d6 7. c3 Nb5 8. Ne2 Nf6 9. O-O Be7 0-1\n`;
  await page.route('https://lichess.org/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/x-chess-pgn' }, body: fresh }));
  await page.route('https://api.chess.com/**', (r) => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/x-chess-pgn' }, body: '' }));
  await go('prefs');
  ok('Data has the live-watch and notification switches', (await page.locator('label.switch', { hasText: 'Watch for finished games' }).count()) === 1 && (await page.locator('label.switch', { hasText: 'Notify me when a debrief is ready' }).count()) === 1);
  await page.click('[data-testid=sync-now]');
  const gotDebrief = await page
    .waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('outpost:v1:core')).debriefs || {}).some((d) => d.steps > 0 && !d.done), null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  ok('a freshly played synced game is analysed first and gets a debrief', gotDebrief);
  await page.unroute('https://lichess.org/**');
  await page.unroute('https://api.chess.com/**');
  await go('tactics');
  ok('a “Debrief ready” pill shows on other screens', (await page.locator('[data-testid=debrief-pill]').count()) === 1);
  await go('play');
  if (await page.getByRole('button', { name: 'Stop and set up a new game' }).count()) {
    await clickText('Stop and set up a new game');
    await clickText('Stop game', { exact: true });
  }
  await go('home');
ok('Home leads with the debrief', /Debrief: your game vs Gifter/.test(await page.innerText('#hero-title')));
  ok('the debrief names the mistake', /Left a piece hanging|blunder|mistake/i.test(await page.innerText('.hero')));
  await shot('home-debrief');
  await page.click('[data-testid=next-action]');
  await page.waitForSelector('[data-testid=guide-panel]', { timeout: 20000 }).catch(() => {});
  ok('“Fix it now” opens the debrief straight into the first moment', /Debrief · moment 1 of/i.test(await page.locator('[data-testid=guide-panel]').innerText().catch(() => '')));
  await shot('debrief');
  for (let k = 0; k < 4 && !(await page.locator('[data-testid=guide-done]').count()); k++) {
    if (await page.locator('[data-testid=guide-skip]').count()) await page.click('[data-testid=guide-skip]');
    await page.waitForTimeout(200);
    if (await page.locator('[data-testid=guide-next]').count()) await page.click('[data-testid=guide-next]');
    await page.waitForTimeout(250);
  }
  ok('the debrief ends with this game against your goal', (await page.locator('[data-testid=debrief-goal]').count()) === 1);
  ok('a finished debrief is marked done', await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('outpost:v1:core')).debriefs || {}).every((d) => d.done || !d.steps)));
  await go('home');
  ok('Home shows your goal with last-10 and last-50 numbers', (await page.locator('[data-testid=goal-card]').count()) === 1 && /last 10 games/.test(await page.innerText('[data-testid=goal-card]')));
  await go('insights');
  ok('Insights shows the goal and the trends for every metric', (await page.locator('[data-testid=goal-card]').count()) === 1 && (await page.locator('[data-testid=trends] .trend').count()) === 5);
  await page.click('[data-testid=goal-change]');
  await page.locator('[data-testid=goal-edit] button', { hasText: 'Blunders' }).first().click();
  await page.waitForTimeout(150);
  ok('you can change the goal', /Blunders/.test(await page.innerText('[data-testid=goal-card] .goal-metric')));
  await shot('goals');
  await page.locator('[data-testid=goal-edit] button', { hasText: 'Use the suggestion' }).click();
}

await go('prefs');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('[data-testid=export-data]')]);
let exported = null;
if (dl) exported = fs.readFileSync(await dl.path(), 'utf8');
ok('export downloads a JSON backup', exported && JSON.parse(exported).app === 'outpost');
if (exported) {
  await page.fill('#import-text', '{"not":"a backup"}');
  await page.click('[data-testid=check-import]');
  ok('bad backup is rejected with a reason', (await page.locator('.note', { hasText: 'can’t be imported' }).count()) > 0);
  await page.fill('#import-text', exported);
  await page.click('[data-testid=check-import]');
  await page.click('[data-testid=import-merge]');
  await page.waitForTimeout(200);
}
const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('outpost:v1:core')));
await page.reload();
await page.waitForTimeout(700);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('outpost:v1:core')));
ok('training data persists across reload', after.gameOrder.length === snapshot.gameOrder.length && after.attempts.length === snapshot.attempts.length && Object.keys(after.customPuzzles).length === 1, `${after.gameOrder.length} games, ${after.attempts.length} attempts`);
await go('home');
await page.waitForTimeout(300);
ok('home lists recent games after reload', (await page.locator('.list .list-row').count()) >= 2);
await shot('home-after');

// ---- layout audit: desktop and mobile -----------------------------------------------------------------------
async function audit(label) {
  return page.evaluate((label) => {
    const out = { label, overflow: document.documentElement.scrollWidth - window.innerWidth, small: [], clipped: [], lowContrast: [] };
    if (out.overflow > 0) out.wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).slice(-4).map((el) => `${el.tagName}.${el.className} ${(el.textContent || '').slice(0, 50)}`);
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=radio]')) {
      if (!vis(el) || el.closest('.cg-wrap') || el.classList.contains('sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (el.closest('.moves') || el.closest('.line')) continue; // dense move lists: keyboard + replay buttons cover them
      if (r.height < 32 || r.width < 32) out.small.push(`${(el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const lum = (c) => {
      const m = c.match(/[\d.]+/g);
      if (!m) return null;
      const [r, g, b] = m.slice(0, 3).map((v) => {
        v = +v / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return { L: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] == null ? 1 : +m[3] };
    };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        const l = lum(c);
        if (l && l.a > 0.9) return l.L;
      }
      return lum('rgb(10,16,48)').L;
    };
    for (const el of document.querySelectorAll('p, span, h1, h2, h3, h4, button, a, label, td, th, li, div')) {
      if (!vis(el) || el.closest('.cg-wrap')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const s = getComputedStyle(el);
      const fg = lum(s.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const ratio = (Math.max(fg.L, bg) + 0.05) / (Math.min(fg.L, bg) + 0.05);
      const big = parseFloat(s.fontSize) >= 18.5 || (parseFloat(s.fontSize) >= 14 && +s.fontWeight >= 700);
      if (ratio < (big ? 3 : 4.5) && !el.closest('[disabled]')) out.lowContrast.push(`${el.textContent.trim().slice(0, 28)} ${ratio.toFixed(2)}`);
      if (el.scrollWidth > el.clientWidth + 2 && s.overflow !== 'visible' && s.textOverflow !== 'ellipsis' && !el.closest('.moves-wrap, .scroll, .side-scroll, .tabs, .sr-only')) out.clipped.push(el.textContent.trim().slice(0, 30));
    }
    out.small = [...new Set(out.small)].slice(0, 12);
    out.lowContrast = [...new Set(out.lowContrast)].slice(0, 12);
    out.clipped = [...new Set(out.clipped)].slice(0, 8);
    return out;
  }, label);
}
const routes = ['home', 'play', 'review', 'tactics', 'learn', 'repertoire', 'insights', 'prefs'];
const audits = [];
for (const r of routes) {
  await go(r);
  await page.waitForTimeout(250);
  audits.push(await audit(`desktop ${r}`));
}
await page.setViewportSize({ width: 390, height: 844 });
for (const r of routes) {
  await go(r);
  await page.waitForTimeout(300);
  audits.push(await audit(`mobile ${r}`));
  await page.screenshot({ path: new globalThis.URL(`m-${r}.png`, SHOTS).pathname, fullPage: true });
}
// mobile: open a game review and a puzzle
await go('review');
if (await page.locator('.list-row').count()) await page.locator('.list-row').first().click();
await page.waitForTimeout(600);
audits.push(await audit('mobile review game'));
await page.screenshot({ path: new globalThis.URL('m-review-game.png', SHOTS).pathname, fullPage: true });
const mobileTabs = await page.locator('.side-tabs [role=tab]').count();
ok('mobile: controls sit in tabs under the board', mobileTabs >= 2, `${mobileTabs} tabs`);
await go('tactics');
await page.click('[data-testid=start-mixed]');
await page.waitForTimeout(1100);
const bb = await page.locator('.board-box').boundingBox();
ok('mobile: board is nearly full width', bb.width >= 390 * 0.9, `${Math.round(bb.width)}px`);
audits.push(await audit('mobile puzzle'));
await page.screenshot({ path: new globalThis.URL('m-puzzle.png', SHOTS).pathname, fullPage: true });

for (const a of audits) {
  const issues = [a.overflow > 0 ? `overflowX ${a.overflow}px [${(a.wide || []).join(" | ")}]` : null, a.small.length ? `small targets: ${a.small.join('; ')}` : null, a.lowContrast.length ? `low contrast: ${a.lowContrast.join('; ')}` : null, a.clipped.length ? `clipped: ${a.clipped.join('; ')}` : null].filter(Boolean);
  ok(`layout ${a.label}`, a.overflow <= 0 && !a.lowContrast.length && !a.clipped.length, issues.join(' | '));
}
ok('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
