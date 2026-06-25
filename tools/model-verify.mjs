// Verifica che un modello (per sottostringa del label) carichi e renderizzi nella pagina /models.
// Uso: node tools/model-verify.mjs "Aiden"   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const needle = process.argv[2] || 'Aiden';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 640 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto('http://localhost:3210/models', { waitUntil: 'networkidle2', timeout: 60000 });

// clicca la voce che contiene il needle
const clicked = await page.evaluate((needle) => {
  for (const b of document.querySelectorAll('#list .m')) {
    if (b.textContent.includes(needle)) { b.click(); return b.textContent.slice(0, 40); }
  }
  return null;
}, needle);
if (!clicked) { console.log(`✖ voce "${needle}" non trovata`); await browser.close(); process.exit(1); }

await new Promise((r) => setTimeout(r, 4000)); // carica + qualche frame d'animazione

const info = await page.evaluate(() => ({
  name: document.querySelector('#info .name')?.textContent,
  meta: document.querySelector('#info .meta')?.textContent,
  err: document.querySelector('#info .meta .err')?.textContent || null,
}));
const shot = `tools/_shots/verify_${needle.replace(/\W+/g, '_')}.png`;
await page.screenshot({ path: shot });
console.log(`\n  voce:  ${clicked}`);
console.log(`  meta:  ${info.meta}`);
console.log(`  errore UI: ${info.err || 'nessuno'}`);
console.log(`  errori console: ${errs.length ? errs.slice(0, 3).join(' | ') : 'nessuno'}`);
console.log(`  screenshot: ${shot}`);
await browser.close();
