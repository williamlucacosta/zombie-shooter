// Scompone il tempo di caricamento in fasi (window.__loadTimes): assets / world / prewarm.
// Uso: node tools/load-phases.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });
const t = await page.evaluate(() => window.__loadTimes);
const ms = (n) => `${Math.round(n)} ms`;
console.log(`\n  assets (rete+parse+decode):  ${ms(t.assets)}`);
console.log(`  + world (build mondo):       ${ms(t.world - t.assets)}   (cum ${ms(t.world)})`);
console.log(`  = MENU PRONTO:               ${ms(t.ready)}   (prewarm shader ora in sottofondo)`);
await browser.close();
