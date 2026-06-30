// Ispeziona la clip di ricarica del fucile (Cransh): durata, e quanti "inserimenti" mostra
// campionando la Y di un osso della mano lungo la clip (i picchi = movimenti di inserimento bossolo).
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 800, height: 520 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1200);
await p.evaluate(() => { const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999; });
await p.evaluate(() => { const g = window.__game; if (g.viewMode !== 'fps') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); });
await sleep(400);
await p.evaluate(() => window.__game.player.giveWeapon('shotgun'));
await sleep(500);

const info = await p.evaluate(() => {
  const pl = window.__game.player;
  const clips = (pl._gunClips || []).map((c) => ({ name: c.name, dur: +c.duration.toFixed(3) }));
  const rl = pl._gunReload;
  if (!rl || !pl._gunMixer) return { clips, err: 'no reload clip/mixer' };
  // trova un osso "mano/dita" che si muove molto
  const mixer = pl._gunMixer;
  const root = mixer.getRoot();
  // campiona la clip: metti l'azione a tempi crescenti e leggi la Y mondo di tutti gli ossi candidati
  const a = mixer.clipAction(rl);
  mixer.stopAllAction(); a.reset(); a.play(); a.setEffectiveWeight(1); a.paused = true;
  const bones = [];
  root.traverse((o) => { if (o.isBone && /hand|finger|thumb|index|wrist|arm/i.test(o.name)) bones.push(o); });
  const N = 80, ys = bones.map(() => []);
  const v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < N; i++) {
    a.time = (i / (N - 1)) * rl.duration;
    mixer.update(0); root.updateMatrixWorld(true);
    bones.forEach((bn, bi) => { bn.getWorldPosition(window.__tmpV = window.__tmpV || new (bn.position.constructor)()); ys[bi].push(+window.__tmpV.y.toFixed(4)); });
  }
  // per ogni osso, conta i picchi (massimi locali) dell'oscillazione Y
  function peaks(arr) {
    const mn = Math.min(...arr), mx = Math.max(...arr), amp = mx - mn || 1;
    const norm = arr.map((y) => (y - mn) / amp);
    let c = 0; const thr = 0.35;
    for (let i = 1; i < norm.length - 1; i++) if (norm[i] > thr && norm[i] >= norm[i - 1] && norm[i] > norm[i + 1]) c++;
    return { amp: +amp.toFixed(3), peaks: c };
  }
  const moving = bones.map((bn, bi) => ({ name: bn.name, ...peaks(ys[bi]) })).filter((x) => x.amp > 0.02)
    .sort((a, b) => b.amp - a.amp).slice(0, 6);
  mixer.stopAllAction();
  return { clips, reloadDur: +rl.duration.toFixed(3), reloadName: rl.name, moving };
});

await b.close();
console.log('clip del fucile:', JSON.stringify(info.clips));
console.log('clip RICARICA:', info.reloadName, '| durata', info.reloadDur, 's');
console.log('ossi che oscillano di più (ampiezza Y, n. picchi=inserimenti stimati):');
for (const m of info.moving || []) console.log(`  ${m.name.padEnd(30)} amp=${m.amp}  picchi=${m.peaks}`);
if (info.err) console.log('ERR:', info.err);
console.log('ERRORI:', errs.length, errs.slice(0, 3).join(' | '));
