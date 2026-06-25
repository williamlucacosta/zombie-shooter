// Verifica i nuovi modelli in gioco: soldato (player) + zombie hazmat. Stato + screenshot.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio', '--window-size=900,700'],
  defaultViewport: { width: 900, height: 700 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await p.waitForFunction(() => window.__game.director.enemies.length > 0, { timeout: 60000 });
await sleep(1800);

const r = await p.evaluate(() => {
  const g = window.__game;
  const pl = g.player.model; let plMesh = 0; pl.traverse((o) => { if (o.isMesh) plMesh++; });
  const e = g.director.enemies.find((x) => x.def.id === 'walker' || x.def.id === 'runner');
  let eMesh = 0; if (e) e.root.traverse((o) => { if (o.isMesh) eMesh++; });
  return {
    playerMeshes: plMesh, handBone: !!g.player.handBone, armBone: !!g.player.armBone,
    indexBone: !!g.player.indexBone, pinkyBone: !!g.player.pinkyBone,
    walkerProcedural: e ? e.root.userData.procedural === true : null,
    walkerMeshes: eMesh, walkerPurpose: e ? e.anim.currentPurpose : null,
    walkerAnims: e && e.anim ? e.anim.clips.map((c) => c.name) : [],
  };
});
console.log('PLAYER: mesh=' + r.playerMeshes, 'hand=' + r.handBone, 'arm=' + r.armBone, 'index=' + r.indexBone, 'pinky=' + r.pinkyBone);
console.log('WALKER: procedural=' + r.walkerProcedural, 'mesh=' + r.walkerMeshes, 'purpose=' + r.walkerPurpose);
console.log('WALKER anims:', r.walkerAnims.join(', '));

// top-down ravvicinata sugli zombi hazmat
await p.evaluate(() => { const c = window.__CONFIG.camera; c.offsetY = 10; c.offsetZ = 7; c.lerp = 30; });
await sleep(800);
await p.screenshot({ path: 'tools/new_zombies.png' });

// zoom sul player con arma (vista ravvicinata frontale)
await p.evaluate(() => {
  const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999;
  g.player.pos.set(0, 0, 0); document.getElementById('banner').classList.remove('show');
  const c = window.__CONFIG.camera; c.offsetY = 2.4; c.offsetZ = 3.2; c.lerp = 30; c.aimPull = 0;
});
await p.mouse.move(780, 360);
await sleep(900);
await p.screenshot({ path: 'tools/new_player.png' });

console.log('ERRORI:', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
