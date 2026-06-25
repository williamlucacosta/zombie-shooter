// Screenshot ravvicinato/obliquo di un cadavere (render manuale, bypassa il loop che muove la camera).
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 520 });
await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });
await page.evaluate(() => document.getElementById('btn-play').click());
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const g = window.__game, d = g.director, THREE = window.__THREE;
  g.renderer.setAnimationLoop(null); // ferma il loop: non sovrascrive più il mio render manuale
  d.startWave(1);
  const C = new THREE.Vector3(3, 0, 0);
  const e = d.spawnEnemy('walker', C.clone());
  e.die(new THREE.Vector3(0, 0, 1));
  for (let k = 0; k < 30; k++) e.update(0.05, []);
  e.root.updateWorldMatrix(true, true);
  const cam = g.camera;
  cam.position.set(C.x + 1.6, 1.5, C.z + 2.4);
  cam.lookAt(C.x, 0.15, C.z);
  cam.updateMatrixWorld(true);
  window.__shootCam = () => g.renderer.render(g.scene, cam);
});
for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__shootCam()); await new Promise((r) => setTimeout(r, 80)); }
await page.screenshot({ path: 'tools/_shots/death_closeup.png' });
console.log('screenshot: tools/_shots/death_closeup.png');
await browser.close();
