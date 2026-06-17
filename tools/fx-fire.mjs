// Cattura a raffica durante fuoco smg continuo: proiettili-tracciante, scia, muzzle flash.
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
  for (const id of ['shotgun', 'smg', 'magnum']) g.player.weapons[id] = { mag: 9999, reserve: 9999 };
  g.player.pos.set(0, 0, 0);
  g.player.switchTo('smg');
  // tieni nascosti banner/countdown per inquadratura pulita
  document.getElementById('banner').style.display = 'none';
  document.getElementById('countdown').style.display = 'none';
  const c = window.__CONFIG.camera; c.offsetY = 11; c.offsetZ = 7.5; c.lerp = 30; c.aimPull = 0.12;
});
await sleep(700);

await page.mouse.move(840, 250);
await page.mouse.down();
for (let i = 0; i < 6; i++) {
  await sleep(85);
  await page.screenshot({ path: `tools/fxf_${i}.png` });
}
await page.mouse.up();

const live = await page.evaluate(() => ({ bullets: window.__game.player.bullets.length }));
console.log('ERRORI:', errs.length, 'proiettili vivi durante la raffica:', live.bullets);
errs.slice(0, 8).forEach((e) => console.log('  ' + e));
await browser.close();
