// Verifica: 1) in attacco il nemico NON gira su se stesso (angolo normalizzato);
//           2) morendo si stende piatto (root.rotation.x≈-π/2, model.rotation.z≈0).
// Uso: node tools/enemy-fix-check.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });
await page.evaluate(() => document.getElementById('btn-play').click());
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await page.evaluate(() => {
  const g = window.__game, d = g.director;
  d.startWave(1); // imposta mods/theme
  const out = {};

  // --- TEST ATTACCO: differenza d'angolo > π (deve girare dal lato CORTO) ---
  const eA = d.spawnEnemy('walker', g.player.pos.clone().add({ x: 1.5, y: 0, z: 0 }));
  eA.state = 'attacking'; eA.stateTime = 0; eA.attackDuration = 100; eA.attackHitAt = 999; eA.lungeDist = 0;
  const pp = g.playerPos();
  const targetYaw = Math.atan2(pp.x - eA.pos.x, pp.z - eA.pos.z);
  eA.root.rotation.y = targetYaw - 4.0; // diff grezza +4.0 rad (> π): col bug girerebbe a vuoto
  const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const errStart = Math.abs(norm(targetYaw - eA.root.rotation.y));
  let maxStep = 0;
  for (let i = 0; i < 30; i++) {
    const before = eA.root.rotation.y;
    eA.update(0.05, []);
    maxStep = Math.max(maxStep, Math.abs(norm(eA.root.rotation.y - before)));
  }
  const errEnd = Math.abs(norm(targetYaw - eA.root.rotation.y));
  out.attack = {
    errInizio: +errStart.toFixed(3), errFine: +errEnd.toFixed(3),
    maxPassoRad: +maxStep.toFixed(3), // se ~0.2 ok; se enorme -> stava girando a vuoto
    converge: errEnd < errStart,
  };

  // --- TEST MORTE: deve stendersi piatto e dritto ---
  const eB = d.spawnEnemy('walker', g.player.pos.clone().add({ x: 3, y: 0, z: 2 }));
  eB.model.rotation.z = 0.15; // simula un barcollio in corso
  eB.die(eB.pos.clone().set(0, 0, 1));
  for (let i = 0; i < 30; i++) eB.update(0.05, []); // ~1.5s: topple completo
  out.death = {
    rotX: +eB.root.rotation.x.toFixed(3), attesoRotX: +(-Math.PI / 2).toFixed(3),
    lurchZ: +eB.model.rotation.z.toFixed(3),
    haDeathClip: eB.anim.has('death'),
  };
  return out;
});

console.log('\n  ATTACCO (no spin):', JSON.stringify(res.attack));
console.log('  MORTE (piatto):   ', JSON.stringify(res.death));
console.log('  errori console:', errs.length ? errs.slice(0, 4).join(' | ') : 'NESSUNO');
await browser.close();
