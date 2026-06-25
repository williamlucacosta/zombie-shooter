// Diagnostica zombie hazmat: stato, animazione walk, drift da root-motion, screenshot ravvicinato.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 900, height: 700 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await p.waitForFunction(() => window.__game.director.enemies.length > 0, { timeout: 60000 });

// forza un walker attivo vicino al player e congela il player
await p.evaluate(() => {
  const g = window.__game;
  const e = g.director.enemies.find((x) => x.def.id === 'walker') || g.director.enemies[0];
  window.__e = e;
  e.pos.set(2, 0, 0);
  e.state = 'active'; e._moveAnim();
});
await sleep(2500);

const diag = await p.evaluate(() => {
  const e = window.__e;
  return {
    state: e.state, purpose: e.anim.currentPurpose,
    hasWalk: e.anim.has('walk'), hasAttack: e.anim.has('attack'),
    found: (() => { const f = e.anim._find('walk'); return f.map((c) => c.name); })(),
  };
});
console.log('STATO walker:', diag.state, '| purpose:', diag.purpose, '| has(walk):', diag.hasWalk, '| has(attack):', diag.hasAttack);
console.log('clip per "walk":', diag.found.join(', ') || '(NESSUNA!)');

// drift: congela la posizione del root e misura se il mesh slitta col tempo
const drift = await p.evaluate(async () => {
  const e = window.__e;
  e.pos.set(2, 0, 0);
  let mesh = null; e.root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const wp = new (window.__game.player.pos.constructor)();
  mesh.getWorldPosition(wp); const x0 = wp.x, z0 = wp.z;
  await new Promise((r) => setTimeout(r, 1200));
  e.pos.set(2, 0, 0); // riblocca il root
  mesh.getWorldPosition(wp);
  return { dx: +(wp.x - x0).toFixed(3), dz: +(wp.z - z0).toFixed(3) };
});
console.log('drift mesh in ~1.2s (root bloccato):', JSON.stringify(drift), drift.dx * drift.dx + drift.dz * drift.dz < 0.09 ? '-> OK in place' : '-> SLITTA (root motion residuo)');

// screenshot ravvicinato sullo zombi
await p.evaluate(() => {
  const g = window.__game, e = window.__e;
  g.player.pos.set(0, 0, 0); e.pos.set(2.2, 0, 0);
  const c = window.__CONFIG.camera; c.offsetY = 3.0; c.offsetZ = 4.0; c.lerp = 30; c.aimPull = 0;
  document.getElementById('banner').classList.remove('show');
});
await p.mouse.move(620, 360);
await sleep(900);
await p.screenshot({ path: 'tools/new_zombie_close.png' });
console.log('ERRORI:', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
