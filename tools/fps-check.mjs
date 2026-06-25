// Verifica la modalità prima persona (tasto V): toggle stato, corpo nascosto, near camera,
// movimento relativo allo sguardo, e ritorno alla top-down — tutto senza errori.
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (n, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 900, height: 600 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => { const b = document.getElementById('btn-play'); return b && b.style.display !== 'none'; }, { timeout: 60000 });
await page.click('#btn-play');
await page.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1500);

check('parte in top-down', await page.evaluate(() => window.__game.viewMode === 'topdown'));

// premi V -> FPS
await page.focus('canvas').catch(() => {});
await page.keyboard.press('KeyV');
await sleep(400);
const fps = await page.evaluate(() => ({
  mode: window.__game.viewMode,
  bodyHidden: window.__game.player.model ? window.__game.player.model.visible === false : null,
  near: window.__game.camera.near,
  gunVisible: window.__game.player.gunMount.visible,
}));
check('V -> prima persona', fps.mode === 'fps', JSON.stringify(fps));
check('corpo nascosto in FPS', fps.bodyHidden === true);
check('arma ancora visibile in FPS', fps.gunVisible === true);
check('near ravvicinato in FPS', fps.near <= 0.1, `near=${fps.near}`);

// muoviti in avanti qualche frame (movimento relativo allo sguardo, non deve errare)
await page.keyboard.down('KeyW'); await sleep(500); await page.keyboard.up('KeyW');
const moved = await page.evaluate(() => { const p = window.__game.player.pos; return Math.hypot(p.x, p.z) > 0.05; });
check('movimento in FPS funziona', moved);
await page.screenshot({ path: 'tools/fps_view.png' });

// torna in top-down
await page.keyboard.press('KeyV');
await sleep(400);
const back = await page.evaluate(() => ({ mode: window.__game.viewMode, bodyVisible: window.__game.player.model.visible, near: window.__game.camera.near }));
check('V -> ritorno top-down', back.mode === 'topdown' && back.bodyVisible === true && back.near > 0.4, JSON.stringify(back));

check('nessun errore di pagina', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log('=== FPS ===');
out.forEach((r) => console.log(r));
await browser.close();
process.exit(out.some((r) => r.startsWith('FAIL')) ? 1 : 0);
