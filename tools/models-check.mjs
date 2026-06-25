// Verifica la pagina /models: il visualizzatore carica un modello, ne legge le animazioni,
// mostra i triangoli, e cambiando modello non genera errori.
import puppeteer from 'puppeteer-core';
const URL = (process.env.GAME_URL || 'http://localhost:3210') + '/models';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (n, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 1100, height: 760 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// sidebar costruita
const btns = await page.evaluate(() => document.querySelectorAll('#list .m').length);
check('sidebar coi modelli', btns >= 8, `pulsanti=${btns}`);

// primo modello caricato: la meta mostra "triangoli"
await page.waitForFunction(() => /triangoli/.test(document.querySelector('#info .meta')?.textContent || ''), { timeout: 40000 });
const meta1 = await page.evaluate(() => document.querySelector('#info .meta').textContent);
check('player caricato e renderizzato', /triangoli/.test(meta1), meta1.replace(/\s+/g, ' ').slice(0, 90));

// pulsanti animazione presenti
const anims = await page.evaluate(() => document.querySelectorAll('#bottom .anim').length);
check('animazioni elencate', anims >= 1, `clip=${anims}`);

// carica un paio di altri modelli (zombie, dog) e verifica nessun errore
const labels = await page.evaluate(() => [...document.querySelectorAll('#list .m')].map((b) => b.textContent));
const failed = [];
for (const want of ['Zombie A', 'Dog', 'Skeleton B', 'Hazmat', 'Wolf', 'Mutant', 'Knight', 'Rogue']) {
  const idx = labels.findIndex((t) => t.includes(want));
  if (idx < 0) { failed.push(`${want}(assente)`); continue; }
  await page.evaluate((i) => document.querySelectorAll('#list .m')[i].click(), idx);
  await page.waitForFunction(() => /triangoli|impossibile/.test(document.querySelector('#info .meta')?.textContent || ''), { timeout: 30000 }).catch(() => {});
  await sleep(400);
  const meta = await page.evaluate(() => document.querySelector('#info .meta').textContent);
  if (!/triangoli/.test(meta) || /impossibile/.test(meta)) failed.push(want);
}
check('tutti i modelli provati caricano (inclusi candidati)', failed.length === 0, failed.length ? 'falliti: ' + failed.join(', ') : 'ok');
check('nessun errore di pagina durante i cambi', errs.length === 0, errs.slice(0, 3).join(' | '));

await page.screenshot({ path: 'tools/models_page.png' });
console.log('=== /models ===');
out.forEach((r) => console.log(r));
errs.slice(0, 6).forEach((e) => console.log('  ERR ' + e));
await browser.close();
process.exit(out.some((r) => r.startsWith('FAIL')) ? 1 : 0);
