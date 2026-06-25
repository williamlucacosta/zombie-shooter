// Verifica il glock animato: mixer presente, clip Shoot/Reload, sparo+ricarica senza errori.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 900, height: 600 },
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

const info = await p.evaluate(() => {
  const pl = window.__game.player;
  return {
    hasMixer: !!pl._gunMixer,
    clips: pl._gunClips ? pl._gunClips.map((c) => c.name) : [],
  };
});
console.log('mixer arma presente:', info.hasMixer);
console.log('clip arma:', info.clips.join(', '));
console.log('-> shoot?', info.clips.some((c) => /shoot/i.test(c)), '| reload?', info.clips.some((c) => /reload/i.test(c)));

// spara (mouse) e ricarica (R)
await p.evaluate(() => { const g = window.__game; g.director.clear(); g.director.active = false; g.intermissionT = 9999; });
await p.mouse.move(700, 300);
await p.mouse.down(); await sleep(120); await p.mouse.up();
await sleep(300);
await p.keyboard.press('KeyR');
await sleep(1200);
const after = await p.evaluate(() => ({ reloadDone: window.__game.player.reloadT <= 0, mag: window.__game.player.ammo.mag }));
console.log('dopo sparo+ricarica: reload completata=', after.reloadDone, 'mag=', after.mag);
console.log('ERRORI:', errs.length, errs.slice(0, 4).join(' | '));
await b.close();
