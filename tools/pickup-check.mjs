// Verifica visiva: alone del pickup munizioni + difficoltà nascosta in caricamento.
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

// difficoltà nascosta durante il caricamento?
const hiddenDuringLoad = await page.evaluate(() => {
  const el = document.getElementById('difficulty');
  return getComputedStyle(el).display === 'none';
});
console.log('difficoltà nascosta in caricamento:', hiddenDuringLoad);

await page.waitForFunction(() => { const b = document.getElementById('btn-play'); return b && b.style.display !== 'none'; }, { timeout: 60000 });
const shownAfter = await page.evaluate(() => getComputedStyle(document.getElementById('difficulty')).display !== 'none');
console.log('difficoltà visibile a fine caricamento:', shownAfter);
await page.screenshot({ path: 'tools/shot_menu_load.png' });

await page.click('#btn-play');
await page.waitForFunction(() => window.__game?.state === 'playing', { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__game;
  g.director.clear(); g.director.active = false; g.intermissionT = 9999;
  g.player.pos.set(0, 0, 0);
  g.pickups.spawn({ x: 1.6, y: 0, z: -3.4 }, 'ammo');
  g.pickups.spawn({ x: -1.6, y: 0, z: -3.4 }, 'medkit');
  const c = window.__CONFIG.camera;
  c.offsetY = 5; c.offsetZ = 6; c.lerp = 30; c.aimPull = 0;
});
await sleep(2500);
await page.screenshot({ path: 'tools/shot_pickup_glow.png' });
await browser.close();
console.log('ok');
