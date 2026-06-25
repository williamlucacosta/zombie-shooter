// Verifica viewmodel FPS world-space: canna verso lo sguardo, mani visibili, sparo ok,
// + screenshot di top-down, prima persona a riposo e prima persona in fuoco (muzzle flash).
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
await sleep(1200);
await p.evaluate(() => { const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999; });

// --- TOP-DOWN: spara e screenshot ---
await p.mouse.move(820, 300);
await p.mouse.down(); await sleep(70); await p.mouse.up();
await sleep(150);
const td = await p.evaluate(() => ({ shots: window.__game.stats.shots, bullets: window.__game.player.bullets.length }));
await p.screenshot({ path: `${OUT}/1-topdown.png` });

// --- PRIMA PERSONA ---
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })));
await sleep(500);
const vm = await p.evaluate(() => {
  const g = window.__game, pl = g.player, gm = pl.gunMount;
  gm.updateWorldMatrix(true, false);
  const e = gm.matrixWorld.elements;
  const bx = e[8], by = e[9], bz = e[10];
  const bl = Math.hypot(bx, by, bz) || 1;
  const yaw = g.fpsYaw, pit = g.fpsPitch, cp = Math.cos(pit);
  const F = { x: Math.sin(yaw) * cp, y: Math.sin(pit), z: Math.cos(yaw) * cp };
  const dot = (bx * F.x + by * F.y + bz * F.z) / bl;
  return {
    fps: pl._fps,
    inScene: gm.parent === g.scene,
    handsVisible: (pl._gunHands || []).some((h) => h.visible),
    bodyHidden: pl.model ? !pl.model.visible : null,
    barrelDotLook: +dot.toFixed(3),
  };
});
await p.screenshot({ path: `${OUT}/2-fps-idle.png` });

// --- PRIMA PERSONA in fuoco: passa a SMG (auto) e tieni premuto per il muzzle flash ---
await p.evaluate(() => { const pl = window.__game.player; pl.giveWeapon('smg'); });
await sleep(150);
await p.mouse.down();
await sleep(120);
await p.screenshot({ path: `${OUT}/3-fps-firing.png` });
const firing = await p.evaluate(() => ({
  shots: window.__game.stats.shots, recoil: +window.__game.player._vmRecoil.toFixed(2),
  bullets: window.__game.player.bullets.length,
}));
await p.mouse.up();

console.log('TOP-DOWN  -> shots:', td.shots, '| bullets:', td.bullets);
console.log('VIEWMODEL -> fps:', vm.fps, '| inScene:', vm.inScene, '| handsVisible:', vm.handsVisible,
  '| bodyHidden:', vm.bodyHidden, '| barrel·look:', vm.barrelDotLook);
console.log('FPS FIRE  -> shots(tot):', firing.shots, '| bullets:', firing.bullets, '| recoil:', firing.recoil);
console.log('ERRORI:', errs.length, errs.slice(0, 5).join(' | '));
await b.close();
