// Misura i "frame lunghi" (stalli main-thread) durante i primi ~22s di gioco e li correla
// col primo spawn nemico. Aiuta a capire se il freeze al primo spawn è compilazione shader
// (stallo nel render) o lavoro JS (clone/prepModel/decode differiti).
// Uso: node tools/spawn-hitch.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 560 });

await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });

// aspetta che TUTTI i differiti siano caricati e il prewarm sia completato (come accade nel menu
// prima che il giocatore avvii): solo così si verifica che lo spawn non blocchi più.
await page.waitForFunction(() => window.__assets && window.__assets.characters.has('skeleton_c'), { timeout: 120000, polling: 200 });
await page.waitForFunction(() => {
  const t = window.__loadTimes;
  return t && t.prewarmDone && t.prewarmRunning === false; // differiti caricati + prewarm fermo
}, { timeout: 120000, polling: 200 });
const prewarmDone = await page.evaluate(() => Math.round(window.__loadTimes.prewarmDone));
console.log(`  prewarm completato a t=${prewarmDone} ms (prima dell'avvio partita)`);

// monitor dei frame + tracciamento conteggio nemici e stato prewarm
await page.evaluate(() => {
  window.__mon = { frames: [], firstEnemyT: null, prewarmDoneT: null, t0: performance.now() };
  let last = performance.now();
  const g = window.__game;
  // intercetta fine prewarm: osserva la coda (euristica) ogni rAF
  const tick = () => {
    const now = performance.now();
    const dt = now - last; last = now;
    const ens = (g.director && g.director.enemies) || g.enemies || [];
    if (dt > 60) window.__mon.frames.push({ t: Math.round(now - window.__mon.t0), dt: Math.round(dt), enemies: ens.length });
    if (window.__mon.firstEnemyT === null && ens.length > 0) window.__mon.firstEnemyT = Math.round(now - window.__mon.t0);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.evaluate(() => document.getElementById('btn-play').click());
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 22000)); // copre l'intro (2.4s) + primi spawn

const mon = await page.evaluate(() => window.__mon);
console.log(`\n  primo nemico in scena a t=${mon.firstEnemyT} ms`);
console.log(`  frame lunghi (>60ms):`);
for (const f of mon.frames.slice(0, 30)) {
  const mark = f.dt > 300 ? '  <== STALLO' : '';
  console.log(`   t=${String(f.t).padStart(6)}ms  dt=${String(f.dt).padStart(5)}ms  nemici=${f.enemies}${mark}`);
}
const worst = mon.frames.reduce((a, b) => (b.dt > a ? b.dt : a), 0);
console.log(`  frame peggiore: ${worst} ms`);
await browser.close();
