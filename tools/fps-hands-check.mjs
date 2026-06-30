// Verifica le mani FPS su tutte le armi: shotgun e mitra devono mostrare le mani guantate
// (prese in prestito dal glock). Riporta conteggio mani/visibilità/bocca + screenshot.
// Uso: node tools/fps-hands-check.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
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
await new Promise((r) => setTimeout(r, 1200));

// equipaggia tutte le armi + passa in FPS
await page.evaluate(() => {
  const p = window.__game.player;
  p.weapons.shotgun = { mag: 8, reserve: 32 };
  p.weapons.smg = { mag: 30, reserve: 90 };
  p.weapons.magnum = { mag: 6, reserve: 24 };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
});
await new Promise((r) => setTimeout(r, 1200));

const probe = (id) => page.evaluate((id) => {
  const p = window.__game.player;
  p.switchTo(id);
  p._updateGun(0.016);
  const hands = p._gunHands || [];
  const m = p._muzzleLocal;
  return {
    arma: id, fps: p._fps,
    mani: hands.length,
    maniVisibili: hands.filter((h) => h.visible).length,
    muzzleLocal: [+m.x.toFixed(3), +m.y.toFixed(3), +m.z.toFixed(3)],
  };
}, id);

for (const id of ['pistol', 'shotgun', 'smg', 'magnum']) {
  const r = await probe(id);
  console.log(`  ${id.padEnd(8)} mani=${r.mani} visibili=${r.maniVisibili}  bocca=${JSON.stringify(r.muzzleLocal)}`);
  await new Promise((res) => setTimeout(res, 700));
  await page.screenshot({ path: `tools/_shots/fps_${id}.png` });
}
console.log('  errori console:', errs.length ? errs.slice(0, 4).join(' | ') : 'NESSUNO');
await browser.close();
