// Verifica la pagina /audios: caricamento campioni, render, riproduzione senza errori.
import puppeteer from 'puppeteer-core';
const URL = (process.env.GAME_URL || 'http://localhost:3210') + '/audios';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (n, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1000, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// la lista è renderizzata subito
const rows = await page.evaluate(() => document.querySelectorAll('.row').length);
check('lista renderizzata (>20 righe)', rows > 20, `righe=${rows}`);
const clips = await page.evaluate(() => document.querySelectorAll('.clip').length);
check('pulsanti di riproduzione presenti', clips > 30, `clip=${clips}`);

// attiva audio e attendi il caricamento dei campioni
await page.click('#enable');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('pronti'), { timeout: 30000 });
const status = await page.evaluate(() => document.getElementById('status').textContent);
check('campioni caricati', /\d+ campioni pronti/.test(status), status);

// clicca alcuni file (passi, ringhio variante 7, sparo) e un procedurale: nessun errore
await page.evaluate(() => {
  // primo passo
  document.querySelectorAll('.clip')[0].click();
});
await sleep(120);
// trova e clicca il pulsante della ricarica procedurale pistola
await page.evaluate(() => {
  for (const b of document.querySelectorAll('.clip.proc')) { b.click(); break; }
});
await sleep(150);
// clicca ogni clip rapidamente per stanare errori di riproduzione
await page.evaluate(() => { document.querySelectorAll('.clip').forEach((b, i) => { if (i % 3 === 0) b.click(); }); });
await sleep(400);

check('nessun errore di pagina', errs.length === 0, errs.slice(0, 5).join(' | '));

console.log('=== /audios ===');
out.forEach((r) => console.log(r));
await browser.close();
process.exit(out.some((r) => r.startsWith('FAIL')) ? 1 : 0);
