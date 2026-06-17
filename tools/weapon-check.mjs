// Verifica visiva del posizionamento delle armi in mano.
// Zoom sul giocatore spostando la camera vicino e disattivando il loop di camera.
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=900,700', '--mute-audio'],
  defaultViewport: { width: 900, height: 700 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => { const b = document.getElementById('btn-play'); return b && b.style.display !== 'none'; }, { timeout: 60000 });
await page.click('#btn-play');
await page.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });

// dai tutte le armi e ferma i nemici per un colpo pulito
await page.evaluate(() => {
  const g = window.__game;
  g.director.clear();
  g.director.active = false;
  g.intermissionT = 9999;
  for (const id of ['shotgun', 'smg', 'magnum']) g.player.weapons[id] = { mag: 99, reserve: 99 };
  g.player.pos.set(0, 0, 0);
});

await sleep(3500); // lascia partire/sfumare il banner d'ondata
// zoom: avvicina la camera tramite CONFIG (il loop la legge ogni frame)
await page.evaluate(() => {
  const c = window.__CONFIG.camera;
  c.offsetY = 3.6; c.offsetZ = 4.6; c.lerp = 30; c.aimPull = 0;
});

async function shot(weapon, file, mx, my) {
  await page.evaluate((w) => {
    const g = window.__game;
    g.director.clear(); g.director.active = false; g.intermissionT = 9999;
    document.getElementById('banner').classList.remove('show');
    g.player.pos.set(0, 0, 0);
    g.player.switchTo(w);
  }, weapon);
  await page.mouse.move(mx, my);
  await sleep(1000);
  await page.screenshot({ path: file });
}
await shot('pistol', 'tools/wpn_pistol.png', 780, 360);
await shot('shotgun', 'tools/wpn_shotgun.png', 780, 360);
await shot('smg', 'tools/wpn_smg.png', 780, 360);
await shot('magnum', 'tools/wpn_magnum.png', 120, 360);

console.log('ERRORI:', errs.length);
errs.slice(0, 10).forEach((e) => console.log('  ' + e));
await browser.close();
