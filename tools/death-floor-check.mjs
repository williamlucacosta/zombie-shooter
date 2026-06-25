// Verifica che i cadaveri appoggino sul terreno (bounding box min.y ≈ 0, non sottoterra)
// e screenshot obliquo. Uso: node tools/death-floor-check.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });
await page.evaluate(() => document.getElementById('btn-play').click());
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await page.evaluate(() => {
  const g = window.__game, d = g.director, THREE = window.__THREE;
  d.startWave(1);
  const measure = (e) => {
    e.root.updateWorldMatrix(true, true); // matrici fresche (nel test non c'è render)
    const b = new THREE.Box3().setFromObject(e.model);
    return { minY: +b.min.y.toFixed(3), maxY: +b.max.y.toFixed(3) };
  };
  // walker (Aiden, fallback) morendo guardando in 3 direzioni diverse: deve appoggiare sempre
  const facings = [0, Math.PI / 2, Math.PI];
  const rows = facings.map((yaw, i) => {
    const e = d.spawnEnemy('walker', g.player.pos.clone().add({ x: i * 2, y: 0, z: 3 }));
    e.root.rotation.y = yaw; // come se guardasse di lato/dietro
    e.die(e.pos.clone().set(0, 0, 1));
    for (let k = 0; k < 30; k++) e.update(0.05, []);
    const m = measure(e);
    return { yaw: +yaw.toFixed(2), minY: m.minY, maxY: m.maxY, lift: +e._lieLift.toFixed(2) };
  });
  return { rows };
});
console.log('\n  cadavere walker per direzione di sguardo (min.y ~0 = appoggia, niente sprofondamento):');
for (const r of res.rows) console.log(`   yaw=${String(r.yaw).padStart(5)}  min.y=${String(r.minY).padStart(7)}  max.y=${String(r.maxY).padStart(6)}  lift=${r.lift}`);
console.log('  errori console:', errs.length ? errs.slice(0, 4).join(' | ') : 'NESSUNO');
await browser.close();
