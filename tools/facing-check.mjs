// Verifica: hit flash bianco smooth (emissive->bianco, poi ripristino), clamp del braccio/testa
// rispetto al busto (niente contorsioni), e che la testa ruoti davvero verso la mira.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'tools/_shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 1000, height: 640 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(900);

// 1) HIT FLASH: nemico colpito -> emissive verso bianco + boost, poi ripristino
const flash = await p.evaluate(async () => {
  const g = window.__game;
  g.startWave(1); g.intermissionT = 9999;
  const e = g.director.spawnEnemy('walker', g.player.pos.clone().add({ x: 0, y: 0, z: 8 }));
  e.state = 'active';
  const m = e.mats[0];
  const base = { hex: m.baseEmissive.getHexString(), int: +m.baseIntensity.toFixed(2) };
  e.takeDamage(5, { x: 0, y: 0, z: 1 }, {});         // colpo NON letale
  const onHit = { hex: m.mat.emissive.getHexString(), int: +m.mat.emissiveIntensity.toFixed(2) };
  for (let i = 0; i < 12; i++) { e.update(0.02, g.director.enemies); } // lascia svanire
  const after = { hex: m.mat.emissive.getHexString(), int: +m.mat.emissiveIntensity.toFixed(2) };
  return { base, onHit, after };
});

// 2) CLAMP ASIMMETRICO: cammina in avanti (+Z) e mira a un angolo estremo prima da un lato
//    poi dall'altro. Verso il lato dell'arma deve ruotare ampio, verso il petto poco.
const clamp = await p.evaluate(() => {
  const g = window.__game, pl = g.player, input = g.input;
  g.director.clear();
  input.keys.add('KeyS'); // muove verso +Z: il busto guarda avanti, NON verso la mira
  const run = (rel) => {
    pl.pos.set(0, 0, 0); pl.root.rotation.y = 0; pl._armRel = 0;
    let v = 0;
    for (let i = 0; i < 90; i++) {
      const ax = pl.pos.x + Math.sin(rel) * 12, az = pl.pos.z + Math.cos(rel) * 12;
      pl.update(0.05, input, { x: ax, y: 0, z: az }, []);
      v = pl._armRel;
    }
    return +v.toFixed(3);
  };
  const sidePos = run(2.6);   // mira estrema da un lato
  const sideNeg = run(-2.6);  // mira estrema dall'altro lato
  input.keys.delete('KeyS');
  return { gunSide: pl._gunSide, sidePos, sideNeg, wide: Math.max(Math.abs(sidePos), Math.abs(sideNeg)), tight: Math.min(Math.abs(sidePos), Math.abs(sideNeg)) };
});

// 3) la testa ruota davvero dell'angolo richiesto
const head = await p.evaluate(() => {
  const pl = window.__game.player;
  if (!pl.headBone) return { has: false };
  const Q = pl.gunMount.quaternion.constructor; // Quaternion ctor
  const q0 = new Q(), q1 = new Q();
  pl.anim.update(0.016); pl._aimHead(0); pl.model.updateWorldMatrix(true, true); pl.headBone.getWorldQuaternion(q0);
  pl.anim.update(0.016); pl._aimHead(1.25); pl.model.updateWorldMatrix(true, true); pl.headBone.getWorldQuaternion(q1);
  return { has: true, turnAngle: +q0.angleTo(q1).toFixed(3) };
});

// 4) screenshot posato: busto in avanti, mira a destra (vista dall'alto)
await p.evaluate(() => {
  const g = window.__game, pl = g.player;
  g.state = 'paused';                 // ferma player.update: posa manuale stabile
  pl.root.rotation.y = 0;             // busto verso +Z
  pl.aimDir.set(1, 0, 0);             // mira a destra (+X)
  pl._armRel = 1.4; pl._headRel = 1.1; pl._aimYaw = 1.4;
  pl.anim.update(0.016);
  pl._aimHead(pl._headRel); pl._aimArm(); pl._updateGun(0.016);
});
await sleep(200);
await p.screenshot({ path: `${OUT}/19-facing.png` });

// 5) FPS: il proiettile parte dalla bocca reale dell'arma (= _gunPos), davanti al gunMount
const muzzle = await p.evaluate(() => {
  const g = window.__game, pl = g.player;
  g.state = 'playing';
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
  return null;
});
await sleep(500);
const fp = await p.evaluate(() => {
  const pl = window.__game.player;
  pl.ammo.mag = 99; pl.bullets.length = 0;
  pl._fire(pl.weaponDef);
  const bl = pl.bullets[pl.bullets.length - 1];
  // distanza tra l'origine del proiettile (bl.prev) e la bocca calcolata (_gunPos)
  const dToMuzzle = Math.hypot(bl.prev.x - pl._gunPos.x, bl.prev.y - pl._gunPos.y, bl.prev.z - pl._gunPos.z);
  // la bocca deve stare DAVANTI alla base del viewmodel (gunMount)
  const fwdOfMount = (pl._gunPos.x - pl.gunMount.position.x) * pl._fwd.x
    + (pl._gunPos.y - pl.gunMount.position.y) * pl._fwd.y
    + (pl._gunPos.z - pl.gunMount.position.z) * pl._fwd.z;
  return { dToMuzzle: +dToMuzzle.toFixed(3), fwdOfMount: +fwdOfMount.toFixed(3) };
});

console.log('HIT FLASH: base', JSON.stringify(flash.base), '| su colpo', JSON.stringify(flash.onHit), '| dopo', JSON.stringify(flash.after));
console.log('  -> bianco sul colpo:', flash.onHit.hex === 'ffffff', '| ripristinato:', flash.after.hex === flash.base.hex && flash.after.int === flash.base.int);
console.log('CLAMP ASIMM: gunSide', clamp.gunSide, '| lato+', clamp.sidePos, '| lato-', clamp.sideNeg, '-> ampio', clamp.wide.toFixed(2), 'stretto', clamp.tight.toFixed(2));
console.log('TESTA: presente', head.has, '| ruota di', head.turnAngle, 'rad (atteso ~1.25)');
console.log('FPS MUZZLE: origine proiettile a', fp.dToMuzzle, 'm dalla bocca (atteso ~0) | bocca avanti al gunMount di', fp.fwdOfMount, 'm');
console.log('ERRORI:', errs.length, errs.slice(0, 5).join(' | '));
await b.close();
