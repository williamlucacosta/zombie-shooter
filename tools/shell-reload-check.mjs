// Verifica la ricarica a colpo singolo del fucile: da caricatore VUOTO deve arrivare a def.mag (6)
// inserendo UN bossolo alla volta con UN suono ciascuno. Pilota player.update deterministicamente.
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

const out = await p.evaluate(() => {
  const g = window.__game, pl = g.player;
  // conta le chiamate Audio.play per nome
  const counts = {};
  const A = window.__audio;
  const orig = A && A.play ? A.play.bind(A) : null;
  if (orig && !A.__counted) { A.play = (n, o) => { counts[n] = (counts[n] || 0) + 1; return orig(n, o); }; A.__counted = true; window.__counts = counts; }
  const C = window.__counts || counts;
  for (const k in C) delete C[k];

  // caricatore VUOTO, riserva piena, avvia ricarica
  pl.ammo.mag = 0; pl.ammo.reserve = 30; pl.reloadT = 0; pl._shellReloading = false;
  const magDef = pl.weaponDef.mag;
  pl.startReload();

  // pilota ~6s di gioco a passi fissi (shellTime=0.5 → un bossolo ogni 5 passi)
  const aim = pl.pos.clone(); aim.z += 10;
  const trace = [];
  let err = null;
  for (let i = 0; i < 70; i++) {
    try { pl.update(0.1, g.input, aim, []); } catch (e) { err = String(e); break; }
    trace.push(pl.ammo.mag);
    if (!pl._shellReloading && pl.ammo.mag >= magDef) break;
  }
  return { magDef, finalMag: pl.ammo.mag, reserve: pl.ammo.reserve, stillReloading: pl._shellReloading,
    insertSounds: C['shotgun_insert'] || 0, pumpSounds: C['shotgun_pump'] || 0, err, trace };
});

await b.close();
console.log('mag massimo (def):', out.magDef);
console.log('caricati alla fine:', out.finalMag, '| riserva:', out.reserve, '| ancora in ricarica:', out.stillReloading);
console.log('suoni "shotgun_insert":', out.insertSounds, '| "shotgun_pump":', out.pumpSounds);
console.log('traccia mag:', out.trace.join(' '));
if (out.err) console.log('ERR update:', out.err);
console.log('\nESITO:',
  out.finalMag === out.magDef ? `OK carica tutti i ${out.magDef}` : `BUG: carica solo ${out.finalMag}/${out.magDef}`,
  '|', out.insertSounds === out.magDef ? 'un suono per bossolo OK' : `suoni ${out.insertSounds} != bossoli ${out.magDef}`);
console.log('ERRORI pagina:', errs.length, errs.slice(0, 3).join(' | '));
