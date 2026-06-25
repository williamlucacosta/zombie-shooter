// Trova quando il carrello (side_j_03.position) si muove nella clip Shoot: tempi + ampiezza.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 800, height: 600 },
});
const p = await b.newPage();
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(800);

const r = await p.evaluate(() => {
  const pl = window.__game.player;
  const out = {};
  for (const key of ['shoot', 'reload']) {
    const clip = pl._gunClips.find((c) => new RegExp(key, 'i').test(c.name));
    const tr = clip.tracks.find((t) => /side_j_03\.position/i.test(t.name));
    if (!tr) { out[key] = 'no side track'; continue; }
    const times = tr.times, vals = tr.values; // vals = [x,y,z]*n
    // riferimento = primo keyframe
    const x0 = vals[0], y0 = vals[1], z0 = vals[2];
    let maxD = 0, tAtMax = 0, firstMove = -1, lastMove = -1;
    for (let i = 0; i < times.length; i++) {
      const dx = vals[i * 3] - x0, dy = vals[i * 3 + 1] - y0, dz = vals[i * 3 + 2] - z0;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxD) { maxD = d; tAtMax = times[i]; }
      if (d > 0.001) { if (firstMove < 0) firstMove = times[i]; lastMove = times[i]; }
    }
    out[key] = { dur: +clip.duration.toFixed(2), keys: times.length, maxDisp: +maxD.toFixed(4), tAtMax: +tAtMax.toFixed(2), firstMove: +firstMove.toFixed(2), lastMove: +lastMove.toFixed(2) };
  }
  return out;
});
console.log(JSON.stringify(r, null, 2));
await b.close();
