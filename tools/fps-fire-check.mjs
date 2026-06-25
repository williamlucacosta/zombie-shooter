// Diagnostica sparo FPS vs top-down: stato _fps, _gunPos, _fwd, proiettili creati, muzzle.
// Uso: node tools/fps-fire-check.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 560 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });
await page.evaluate(() => document.getElementById('btn-play').click());
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const probe = async (label) => {
  // aggiorna gun e spara una volta direttamente
  return await page.evaluate(() => {
    const p = window.__game.player;
    const before = p.bullets.length;
    p._updateGun(0.016);
    p._fire(p.weaponDef);
    const gp = p._gunPos, fw = p._fwd;
    const b = p.bullets[p.bullets.length - 1];
    return {
      fps: p._fps,
      gunPos: gp ? [+gp.x.toFixed(2), +gp.y.toFixed(2), +gp.z.toFixed(2)] : null,
      fwd: fw ? [+fw.x.toFixed(2), +fw.y.toFixed(2), +fw.z.toFixed(2)] : null,
      muzzleLocal: [+p._muzzleLocal.x.toFixed(3), +p._muzzleLocal.y.toFixed(3), +p._muzzleLocal.z.toFixed(3)],
      bulletsBefore: before, bulletsAfter: p.bullets.length,
      bulletPos: b ? [+b.mesh.position.x.toFixed(2), +b.mesh.position.y.toFixed(2), +b.mesh.position.z.toFixed(2)] : null,
      camPos: [+window.__game.camera?.position.x.toFixed(2) || 0],
    };
  });
};

// TOP-DOWN
const td = await probe('topdown');
console.log('\n  TOP-DOWN:', JSON.stringify(td));

// passa a FPS (tasto V)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })));
await new Promise((r) => setTimeout(r, 1200));
const isFps = await page.evaluate(() => window.__game.viewMode);
console.log('  viewMode dopo V:', isFps);
const fps = await probe('fps');
console.log('  FPS:     ', JSON.stringify(fps));

await page.screenshot({ path: 'tools/_shots/fps_fire.png' });
console.log('  errori console:', errs.length ? errs.slice(0, 4).join(' | ') : 'NESSUNO');
await browser.close();
