// Cosa anima la clip Shoot/Reload del glock? E il carrello si muove davvero quando sparo?
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 800, height: 600 },
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:3210', { waitUntil: 'networkidle2', timeout: 60000 });
await p.waitForFunction(() => { const x = document.getElementById('btn-play'); return x && x.style.display !== 'none'; }, { timeout: 60000 });
await p.click('#btn-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 60000 });
await sleep(1000);

const tracks = await p.evaluate(() => {
  const pl = window.__game.player;
  const shoot = pl._gunClips.find((c) => /shoot/i.test(c.name));
  const reload = pl._gunClips.find((c) => /reload/i.test(c.name));
  return {
    shootDur: shoot?.duration, reloadDur: reload?.duration,
    shootTracks: shoot ? shoot.tracks.map((t) => t.name) : [],
    reloadTracks: reload ? reload.tracks.map((t) => t.name).slice(0, 8) : [],
  };
});
console.log('Shoot durata:', tracks.shootDur, 's | tracce:', tracks.shootTracks.join(', '));
console.log('Reload durata:', tracks.reloadDur, 's | tracce(8):', tracks.reloadTracks.join(', '));

// trova il bone del carrello e misura se si muove durante Shoot
const move = await p.evaluate(async () => {
  const pl = window.__game.player;
  const sc = pl._gunShoot;
  const slideTrack = sc ? sc.tracks.find((t) => /side_j_03\.position/i.test(t.name)) : null;
  let slide = null;
  pl.gunMount.traverse((o) => { if (!slide && /side_j_03/i.test(o.name)) slide = o; });
  if (!slide) return { found: false, subDur: sc?.duration, subTracks: sc?.tracks.length };
  const p0 = slide.position.clone();
  pl._playGunAnim(pl._gunShoot, 0.13);
  const a = pl._gunMixer.clipAction(pl._gunShoot);
  let maxD = 0, ran = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 16));
    if (a.isRunning()) ran = true;
    maxD = Math.max(maxD, slide.position.distanceTo(p0));
  }
  return {
    found: true, name: slide.name, isBone: slide.isBone,
    subDur: +(sc?.duration || 0).toFixed(3), subTracks: sc?.tracks.length,
    slideTrackInSub: !!slideTrack, slideTrackKeys: slideTrack ? slideTrack.times.length : 0,
    actionRan: ran, maxDisplacement: +maxD.toFixed(4),
  };
});
console.log('carrello:', JSON.stringify(move));
console.log('ERRORI:', errs.length);
await b.close();
