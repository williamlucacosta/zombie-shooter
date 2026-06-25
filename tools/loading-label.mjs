// Campiona il testo dell'etichetta di caricamento durante l'avvio (verifica requisito "spiega cosa carica").
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
const seen = [];
await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
while (Date.now() - t0 < 12000) {
  const lbl = await page.evaluate(() => {
    const e = document.getElementById('loading-label');
    return e && getComputedStyle(e).display !== 'none' ? e.textContent : null;
  }).catch(() => null);
  if (lbl && seen[seen.length - 1] !== lbl) seen.push(lbl);
  const ready = await page.evaluate(() => window.__loadTimes && window.__loadTimes.ready).catch(() => null);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 40));
}
console.log('\n  Etichette mostrate durante il caricamento, in ordine:');
for (const s of seen) console.log(`   • ${s}`);
await browser.close();
