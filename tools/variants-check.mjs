// Verifica le varianti dei nemici: scala, colore e velocità diversi tra zombi della stessa
// ondata; nessun errore; screenshot di un'orda variegata.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'tools/_shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 1100, height: 680 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1300);

// prepara: invulnerabile, ondata avviata, cluster di walker davanti al giocatore
await p.evaluate(() => {
  const g = window.__game, pp = g.player.pos;
  g.startWave(1);
  g.intermissionT = 9999;
  g.player.maxHp = 1e9; g.player.hp = 1e9;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 4.5 + (i % 3) * 1.2;
    const pos = pp.clone().add({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r });
    g.director.spawnEnemy('walker', pos);
  }
});
await sleep(1600); // attesa risalita + attivazione

const stats = await p.evaluate(() => {
  const es = window.__game.director.enemies.filter((e) => !e.boss && !e.dead);
  const scales = es.map((e) => +e.model.scale.x.toFixed(3));
  const speeds = es.map((e) => +e.speed.toFixed(2));
  const colors = es.map((e) => (e.mats[0] ? e.mats[0].mat.color.getHexString() : '?'));
  const voices = es.map((e) => +(e.voicePitch || 0).toFixed(2));
  const lurch = es.filter((e) => e.lurchAmp > 0).length;
  const weave = es.filter((e) => e.weaveAmt > 0).length;
  const uniq = (a) => new Set(a).size;
  return {
    n: es.length,
    scaleRange: [Math.min(...scales), Math.max(...scales)], uScale: uniq(scales),
    speedRange: [Math.min(...speeds), Math.max(...speeds)], uSpeed: uniq(speeds),
    uColor: uniq(colors), colorsSample: colors.slice(0, 6),
    uVoice: uniq(voices), lurch, weave,
  };
});
await p.screenshot({ path: `${OUT}/9-horde-variants.png` });

console.log('nemici attivi:', stats.n);
console.log('scala:   range', stats.scaleRange, '| uniche', stats.uScale);
console.log('velocità: range', stats.speedRange, '| uniche', stats.uSpeed);
console.log('colore:  tinte uniche', stats.uColor, '| esempi', stats.colorsSample.join(' '));
console.log('voce:    pitch unici', stats.uVoice, '| con barcollio', stats.lurch, '| con weave', stats.weave);
console.log('ERRORI:', errs.length, errs.slice(0, 5).join(' | '));
await b.close();
process.exit(errs.length ? 1 : 0);
