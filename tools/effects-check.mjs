// Verifica i nuovi effetti: primitive (shockwave/debris/charge), scia-fantasma del dash,
// e un'ondata boss reale (slam/charge naturali) senza errori. Screenshot di controllo.
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

// 1) primitive effetti chiamate direttamente: nessuna eccezione
const prim = await p.evaluate(() => {
  try {
    const g = window.__game, e = g.effects, p0 = g.player.pos, d = g.player.aimDir;
    e.shockwave(p0, 0xff6824, 8, 0.6);
    e.debris(p0, 10, 0x3a2a20);
    e.chargeTelegraph(p0, d, 8, 0xff5050);
    e.chargeTrail(p0, d, 0xff5050);
    e.dashBurst(p0, d);
    e.dashTrail(p0, d);
    return 'ok';
  } catch (err) { return 'THROW: ' + err.message; }
});

// 2) dash reale del giocatore -> scia-fantasma
await p.evaluate(() => { const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999; });
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })));
await sleep(60);
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })));
await sleep(60);
const dash = await p.evaluate(() => ({ dashT: +window.__game.player.dashT.toFixed(3), ghosts: window.__game.player._dashGhosts.length }));
await p.screenshot({ path: `${OUT}/6-dash.png` });
await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); });

// 3) ondata boss reale: lascia che il boss usi le abilita' da solo
await p.evaluate(() => { const g = window.__game; g.intermissionT = 9999; g.startWave(5); });
await p.waitForFunction(() => window.__game.director.enemies.some((e) => e.boss), { timeout: 20000 }).catch(() => {});
const bossSeen = await p.evaluate(() => window.__game.director.enemies.some((e) => e.boss));
// forza alcune abilita' rapidamente per stressarle
for (let k = 0; k < 6; k++) {
  await p.evaluate(() => {
    const boss = window.__game.director.enemies.find((e) => e.boss && !e.dead && e.state === 'active');
    if (boss && !boss.ability) { boss.abilityTimer = 0; }
  });
  await sleep(900);
}
await p.screenshot({ path: `${OUT}/7-boss-ability.png` });
const bossInfo = await p.evaluate(() => {
  const boss = window.__game.director.enemies.find((e) => e.boss);
  return { exists: !!boss, hp: boss ? +(boss.hp / boss.maxHp).toFixed(2) : null, abil: boss?.ability?.name || null };
});

console.log('PRIMITIVE effetti  ->', prim);
console.log('DASH               -> dashT:', dash.dashT, '| ghosts:', dash.ghosts);
console.log('BOSS               -> visto:', bossSeen, '| info:', JSON.stringify(bossInfo));
console.log('ERRORI:', errs.length, errs.slice(0, 6).join(' | '));
await b.close();
process.exit(errs.length || prim !== 'ok' ? 1 : 0);
