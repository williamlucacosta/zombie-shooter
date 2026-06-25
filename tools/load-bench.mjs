// Misura il tempo di caricamento (navigazione -> menu pronto) e i byte trasferiti.
// Uso: node tools/load-bench.mjs   (dev server attivo su :3210)
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:3210/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setCacheEnabled(false); // misura il caso peggiore: cache fredda

const bytes = { total: 0, byType: {} };
page.on('response', async (res) => {
  try {
    const url = res.url();
    if (!url.includes('/assets/')) return;
    const len = Number(res.headers()['content-length'] || 0);
    let size = len;
    if (!size) { try { size = (await res.buffer()).length; } catch { size = 0; } }
    bytes.total += size;
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    bytes.byType[ext] = (bytes.byType[ext] || 0) + size;
  } catch {}
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });

// "menu pronto" = il pulsante GIOCA diventa visibile (ui.readyToPlay)
await page.waitForFunction(() => {
  const b = document.getElementById('btn-play');
  return b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none';
}, { timeout: 120000, polling: 50 });
const ready = Date.now() - t0;

// attesa extra per far arrivare anche i differiti (per il conteggio byte totale)
await new Promise((r) => setTimeout(r, 6000));
const all = Date.now() - t0;

const KB = (n) => (n / 1024).toFixed(0).padStart(7) + ' KB';
console.log(`\n  MENU PRONTO in        ${ready} ms`);
console.log(`  (con differiti) in    ${all} ms`);
console.log(`\n  Byte /assets/ totali: ${KB(bytes.total)}`);
for (const [ext, n] of Object.entries(bytes.byType).sort((a, b) => b[1] - a[1])) {
  console.log(`    .${ext.padEnd(5)} ${KB(n)}`);
}
await browser.close();
