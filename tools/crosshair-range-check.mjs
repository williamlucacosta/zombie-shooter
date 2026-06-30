// Verifica: il mirino circolare BOUNDA i proiettili (cadono dentro al "range") per TUTTE le armi,
// sia in prima persona sia dall'alto; + screenshot FPS fucile (arma sotto al mirino, non coperta).
// Con CROSS_GAIN=1 il cerchio = cono reale: l'unico rischio di "fuori range" è il clamp superiore.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'tools/_shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FOV = 50; // camera verticale (main.js)
const GUNS = ['pistol', 'shotgun', 'smg', 'magnum'];

const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 760 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1200);
await p.evaluate(() => { const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999; });

// helper di pagina: cambia arma, azzera bloom, spara N raffiche a spread BASE e misura l'angolo max
async function fireMeasure(id) {
  return await p.evaluate((id) => {
    const g = window.__game, pl = g.player;
    pl.giveWeapon(id);
    const def = pl.weaponDef;
    for (const b of pl.bullets) { g.scene.remove(b.mesh); g.scene.remove(b.head); }
    pl.bullets.length = 0;
    const fps = pl._fps;
    const aim = fps
      ? { x: pl._fwd.x, y: pl._fwd.y, z: pl._fwd.z }
      : { x: Math.sin(pl._aimYaw), y: 0, z: Math.cos(pl._aimYaw) };
    const al = Math.hypot(aim.x, aim.y, aim.z) || 1;
    const N = 140;
    for (let i = 0; i < N; i++) { pl._bloom = 0; pl.ammo.mag = def.mag; pl.fireTimer = 0; pl._fire(def); }
    let maxAng = 0; const angs = [];
    for (const b of pl.bullets) {
      const v = b.vel, vl = Math.hypot(v.x, v.y, v.z) || 1;
      let d = (v.x * aim.x + v.y * aim.y + v.z * aim.z) / (vl * al);
      d = Math.max(-1, Math.min(1, d));
      const a = Math.acos(d) * 180 / Math.PI;
      angs.push(a); if (a > maxAng) maxAng = a;
    }
    angs.sort((x, y) => x - y);
    const n = pl.bullets.length;
    for (const b of pl.bullets) { g.scene.remove(b.mesh); g.scene.remove(b.head); }
    pl.bullets.length = 0; // scena leggera → il loop aggiorna il mirino nel frame
    pl._bloom = 0; // misura il mirino a spread base
    return {
      base: def.spread, count: n,
      maxAng: +maxAng.toFixed(3), p99: +(angs[Math.floor(angs.length * 0.99)] || maxAng).toFixed(3),
    };
  }, id);
}
// raggio mirino (px) dal DOM: scena pulita + polling su più frame (evita letture stantie)
async function crosshairRadius() {
  await p.evaluate(() => { window.__game.player._bloom = 0; });
  for (let i = 0; i < 8; i++) { await sleep(90); await p.evaluate(() => { window.__game.player._bloom = 0; }); }
  return await p.evaluate(() => {
    const c = document.getElementById('crosshair'), pl = window.__game.player;
    return {
      r: parseFloat(c.style.width) / 2 || 0, H: window.innerHeight,
      liveId: pl.weaponDef.id, liveSpreadDeg: +(pl.currentSpread() * 180 / Math.PI).toFixed(2),
    };
  });
}
// angolo (gradi) rappresentato da un raggio px del mirino in FPS (inverso della formula main.js)
const pxToAngleFps = (r, H) => Math.atan((r / (H / 2)) * Math.tan(FOV * Math.PI / 360)) * 180 / Math.PI;

const rows = [];
for (const view of ['fps', 'topdown']) {
  // imposta la visuale
  await p.evaluate((v) => {
    const g = window.__game;
    if (g.viewMode !== v) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
  }, view);
  await sleep(500);
  if (view === 'topdown') { await p.mouse.move(900, 320); await sleep(200); } // cursore a distanza media
  for (const id of GUNS) {
    const m = await fireMeasure(id);
    const cr = await crosshairRadius();
    const clampMax = cr.H * 0.24;
    // FPS: raggio dalla formula ESATTA di main.js (deterministico, niente dipendenza dal frame);
    // top-down: dal DOM (proiezione che richiede camera/aimPoint interni).
    const spRad = cr.liveSpreadDeg * Math.PI / 180;
    const rPx = view === 'fps'
      ? Math.min(Math.max((cr.H / 2) * Math.tan(spRad) / Math.tan(FOV * Math.PI / 360), 5), clampMax)
      : cr.r;
    const clamped = rPx >= clampMax - 0.5; // il clamp superiore sta tagliando?
    const coneAng = view === 'fps' ? pxToAngleFps(rPx, cr.H) : null;
    const within = view === 'fps'
      ? m.maxAng <= coneAng + 0.2
      : !clamped; // top-down: gain=1 => cerchio=ventaglio se il clamp non taglia
    cr.r = rPx;
    rows.push({ view, id, base: m.base, maxAng: m.maxAng, p99: m.p99, n: m.count,
      crPx: +cr.r.toFixed(1), clampMaxPx: +clampMax.toFixed(0), clamped,
      coneAng: coneAng != null ? +coneAng.toFixed(2) : '-', within,
      liveId: cr.liveId, liveSp: cr.liveSpreadDeg });
  }
}

// pulizia proiettili residui per screenshot puliti
await p.evaluate(() => { const pl = window.__game.player; for (const b of pl.bullets) { pl.game.scene.remove(b.mesh); pl.game.scene.remove(b.head); } pl.bullets.length = 0; });

// SCREENSHOT prima persona: fucile a pompa a riposo (mirino non sull'arma) + in fuoco
await p.evaluate(() => { const g = window.__game; if (g.viewMode !== 'fps') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); });
await sleep(400);
await p.evaluate(() => window.__game.player.giveWeapon('shotgun'));
await sleep(500);
await p.screenshot({ path: `${OUT}/cr-fps-shotgun-idle.png` });
await p.evaluate(() => { const pl = window.__game.player; pl._bloom = 0; pl.ammo.mag = pl.weaponDef.mag; pl.fireTimer = 0; pl._fire(pl.weaponDef); });
await sleep(80);
await p.screenshot({ path: `${OUT}/cr-fps-shotgun-fire.png` });
await p.evaluate(() => window.__game.player.giveWeapon('pistol'));
await sleep(400);
await p.screenshot({ path: `${OUT}/cr-fps-pistol-idle.png` });
await p.evaluate(() => window.__game.player.giveWeapon('smg'));
await sleep(500);
await p.screenshot({ path: `${OUT}/cr-fps-smg-idle.png` });

// PROVA OCCLUSIONE: alzo di proposito il fucile DENTRO al mirino → la canna deve COPRIRE l'anello
// (mirino dietro l'arma). Poi ripristino.
await p.evaluate(() => { const pl = window.__game.player; pl.giveWeapon('shotgun'); });
await sleep(500);
await p.evaluate(() => { window.__game.player._vmShift = { y: 0.16, z: 0.02 }; });
await sleep(300);
await p.screenshot({ path: `${OUT}/cr-fps-occlusion.png` });
await p.evaluate(() => { window.__game.player._vmShift = { y: -0.09 }; }); // ripristino

// top-down fucile in fuoco
await p.evaluate(() => { const g = window.__game; if (g.viewMode !== 'topdown') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); });
await sleep(400);
await p.evaluate(() => window.__game.player.giveWeapon('shotgun'));
await p.mouse.move(900, 320); await sleep(200);
await p.mouse.down(); await sleep(70); await p.mouse.up(); await sleep(120);
await p.screenshot({ path: `${OUT}/cr-topdown-shotgun-fire.png` });

console.log('\nVIEW     ARMA      base°  maxAng°  p99°   N    mirinoPx  clampPx  clamp  cono°  liveId/sp   ENTRO?');
for (const r of rows) {
  console.log(
    r.view.padEnd(8), r.id.padEnd(9),
    String(r.base).padStart(5), String(r.maxAng).padStart(7), String(r.p99).padStart(6),
    String(r.n).padStart(4), String(r.crPx).padStart(8), String(r.clampMaxPx).padStart(7),
    String(r.clamped).padStart(6), String(r.coneAng).padStart(6),
    `${r.liveId}/${r.liveSp}`.padStart(11), r.within ? '  SI' : '  NO <<<',
  );
}
console.log('\nERRORI:', errs.length, errs.slice(0, 5).join(' | '));
await b.close();
