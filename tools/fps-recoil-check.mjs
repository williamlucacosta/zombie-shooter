// Verifica che il rinculo FPS sia FLUIDO (molla), non scattoso: campiona player._vmRecoil frame per
// frame dopo uno sparo del fucile e controlla che (a) NON salti a picco in 1 frame, (b) salga in più
// frame, (c) poi rientri verso 0. Stampa la curva. Esegui dalla root col dev server attivo.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 900, height: 560 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1200);
await p.evaluate(() => { const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999; });
await p.evaluate(() => { const g = window.__game; if (g.viewMode !== 'fps') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); });
await sleep(400);
await p.evaluate(() => window.__game.player.giveWeapon('shotgun'));
await sleep(500);

// spara e registra _vmRecoil ogni frame per ~0.8s
const samples = await p.evaluate(() => new Promise((res) => {
  const pl = window.__game.player;
  pl._bloom = 0; pl.ammo.mag = pl.weaponDef.mag; pl.fireTimer = 0;
  pl._fire(pl.weaponDef);
  const s = []; const t0 = performance.now();
  (function rec() {
    s.push({ t: +(performance.now() - t0).toFixed(0), r: +pl._vmRecoil.toFixed(4) });
    if (performance.now() - t0 < 800) requestAnimationFrame(rec);
    else { res(s); }
  })();
}));

await b.close();

if (!samples.length) { console.log('NESSUN campione'); process.exit(1); }
const rs = samples.map((x) => x.r);
const peak = Math.max(...rs);
const peakIdx = rs.indexOf(peak);
const first = rs[0];
// massimo salto positivo tra frame consecutivi (l'attacco): più piccolo = più fluido rispetto al picco
let maxJump = 0;
for (let i = 1; i < rs.length; i++) maxJump = Math.max(maxJump, rs[i] - rs[i - 1]);
const minAfterPeak = Math.min(...rs.slice(peakIdx)); // overshoot sotto zero (assestamento)
const last = rs[rs.length - 1];

console.log(`campioni: ${rs.length} | picco ${peak.toFixed(3)} al frame ${peakIdx} (t=${samples[peakIdx].t}ms)`);
console.log(`primo frame dopo sparo: ${first.toFixed(3)}  (se ~=picco => SCATTO istantaneo)`);
console.log(`max salto/frame in salita: ${maxJump.toFixed(3)}  (=> ${(maxJump / peak * 100).toFixed(0)}% del picco)`);
console.log(`overshoot minimo dopo picco: ${minAfterPeak.toFixed(3)} | valore finale: ${last.toFixed(3)}`);
// sparkline della curva
const blocks = '▁▂▃▄▅▆▇█';
const spark = rs.map((v) => blocks[Math.max(0, Math.min(7, Math.round((v / peak) * 7)))]).join('');
console.log('curva:', spark);

const gradual = peakIdx >= 2 && first < peak * 0.6;        // il picco arriva in più frame
const smooth = maxJump <= peak * 0.7;                      // nessun teletrasporto a picco
const settles = last < peak * 0.25;                        // rientra
console.log(`\nGRADUALE: ${gradual ? 'SI' : 'NO'} | FLUIDO: ${smooth ? 'SI' : 'NO'} | RIENTRA: ${settles ? 'SI' : 'NO'}`);
console.log('ERRORI:', errs.length, errs.slice(0, 3).join(' | '));
