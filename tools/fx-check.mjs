// Verifica effetti: muzzle flash, traccianti/proiettili, impatto e scia del dash.
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

await page.evaluate(() => {
  const g = window.__game;
  g.director.clear(); g.director.active = false; g.intermissionT = 9999;
  for (const id of ['shotgun', 'smg', 'magnum']) g.player.weapons[id] = { mag: 999, reserve: 999 };
  g.player.pos.set(0, 0, 0);
  g.player.switchTo('smg');
  document.getElementById('banner').classList.remove('show');
});
await sleep(1500);
await page.evaluate(() => { const c = window.__CONFIG.camera; c.offsetY = 10; c.offsetZ = 7; c.lerp = 30; c.aimPull = 0.1; });
await sleep(400);

// FUOCO: tieni premuto il mouse mentre l'smg spara, cattura proiettili+flash+scia
await page.mouse.move(820, 300);
await page.mouse.down();
await sleep(260);
await page.screenshot({ path: 'tools/fx_fire.png' });
await sleep(120);
await page.screenshot({ path: 'tools/fx_fire2.png' });
await page.mouse.up();

// MAGNUM: colpo singolo potente (flash grande)
await page.evaluate(() => window.__game.player.switchTo('magnum'));
await sleep(300);
await page.mouse.down();
await sleep(40);
await page.screenshot({ path: 'tools/fx_magnum.png' });
await page.mouse.up();

// DASH: inietta una pressione di Spazio e cattura la raffica d'aria
await page.evaluate(() => { const g = window.__game; g.player.dashCharges = 5; });
await page.keyboard.down('KeyW');
await page.keyboard.press('Space');
await sleep(70);
await page.screenshot({ path: 'tools/fx_dash.png' });
await sleep(100);
await page.screenshot({ path: 'tools/fx_dash2.png' });
await page.keyboard.up('KeyW');

console.log('ERRORI:', errs.length);
errs.slice(0, 8).forEach((e) => console.log('  ' + e));
await browser.close();
