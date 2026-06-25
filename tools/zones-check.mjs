// Verifica il sistema a zone: hub+3 stanze, 3 porte, Anime dai kill, apertura porta
// (area espansa + difficoltà su), nessun errore. Screenshot.
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

// struttura del mondo
const w = await p.evaluate(() => {
  const W = window.__game.world;
  return {
    rooms: W.rooms.map((r) => ({ id: r.id, r: +r.r.toFixed(1), active: r.active })),
    gates: W.gates.map((g) => ({ id: g.id, cost: g.cost, x: +g.pos.x.toFixed(1), z: +g.pos.z.toFixed(1) })),
    maxExtent: +W.maxExtent.toFixed(1),
  };
});

await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1000);
const startSouls = await p.evaluate(() => window.__game.souls);

// uccidi qualche nemico per ottenere Anime
await p.evaluate(() => { window.__game.startWave(1); window.__game.intermissionT = 9999; });
await sleep(2500);
await p.evaluate(() => { window.__game.director.enemies.forEach((e) => { if (!e.dead && !e.boss) e.takeDamage(9999, { x: 0, y: 0, z: 1 }, {}); }); });
await sleep(300);
const soulsAfterKills = await p.evaluate(() => window.__game.souls);

// porta più vicina: porta il giocatore lì, dai Anime, apri con E
const unlock = await p.evaluate(() => {
  const g = window.__game, gate = g.world.gates[0];
  g.player.pos.set(gate.pos.x * 0.92, 0, gate.pos.z * 0.92); // appena dentro l'hub, vicino al cancello
  g.souls = gate.cost + 50;
  const near = g.world.nearestGate(g.player.pos, 5);
  return { gateId: gate.id, near: near ? near.id : null, depthBefore: g.zonesUnlocked };
});
await sleep(120);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })));
await sleep(400);
const after = await p.evaluate(() => {
  const g = window.__game;
  return {
    zonesUnlocked: g.zonesUnlocked,
    roomActive: g.world.rooms.find((r) => r.id === g.world.gates[0].id)?.active,
    gateOpened: g.world.gates[0].unlocked,
    souls: g.souls,
  };
});
await p.screenshot({ path: `${OUT}/15-zones.png` });

console.log('ROOMS:', JSON.stringify(w.rooms));
console.log('GATES:', JSON.stringify(w.gates), '| maxExtent:', w.maxExtent);
console.log('Anime: start', startSouls, '-> dopo kill', soulsAfterKills, '(deve salire)');
console.log('UNLOCK: near gate =', unlock.near, '| dopo: zonesUnlocked', after.zonesUnlocked,
  '| room attiva', after.roomActive, '| porta aperta', after.gateOpened, '| Anime', after.souls);
console.log('ERRORI:', errs.length, errs.slice(0, 6).join(' | '));
await b.close();
process.exit(errs.length ? 1 : 0);
