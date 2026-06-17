// Verifica i fix della seconda tornata: passi, blocco difficoltà in caricamento,
// ritorno al menu da morte/abbandono, pickup senza lag (nessun errore), audio.
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (n, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
  defaultViewport: { width: 900, height: 540 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

// difficoltà bloccata durante il caricamento
const lockedDuringLoad = await page.evaluate(() => document.getElementById('difficulty').classList.contains('diff-locked'));
check('difficoltà bloccata in caricamento', lockedDuringLoad);

await page.waitForFunction(() => { const b = document.getElementById('btn-play'); return b && b.style.display !== 'none'; }, { timeout: 60000 });
const unlockedAfter = await page.evaluate(() => !document.getElementById('difficulty').classList.contains('diff-locked'));
check('difficoltà sbloccata a fine caricamento', unlockedAfter);

// audio: passi + gunshot + pioggia caricati
const audio = await page.evaluate(() => {
  const a = window.__audio;
  const g = (k) => (a.buffers.get(k) || []).length;
  return { step: g('step'), pistol: g('shot_pistol'), shotgun: g('shot_shotgun'), rain: g('rain_loop') };
});
check('passi caricati (4)', audio.step === 4, JSON.stringify(audio));
check('gunshot premium e pioggia caricati', audio.pistol && audio.shotgun && audio.rain, JSON.stringify(audio));

// musica: volume iniziale calibrato (default basso)
const musicVol = await page.evaluate(() => window.__audio._vol.music);
check('volume musica iniziale calibrato (<=0.55)', musicVol <= 0.55, `music=${musicVol}`);

// gioca, spawn molti pickup di colpo (test anti-lag) e verifica nessun errore
await page.click('#btn-play');
await page.waitForFunction(() => window.__game?.state === 'playing', { timeout: 30000 });
await page.waitForFunction(() => window.__game.player && window.__game.director.enemies.length > 0, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game;
  const THREE_pos = (x, z) => ({ x, y: 0, z, clone() { return THREE_pos(x, z); }, add() { return this; } });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * 6.28;
    g.pickups.spawn({ x: Math.cos(a) * 4, y: 0, z: Math.sin(a) * 4 }, i % 2 ? 'medkit' : 'ammo');
  }
});
await sleep(800);
const pickupCount = await page.evaluate(() => window.__game.pickups.items.length);
check('spawn di 12 pickup senza errori', pickupCount >= 10 && errs.length === 0, `items=${pickupCount} err=${errs.length}`);

// morte -> game over -> MENU -> difficoltà riselezionabile
await page.evaluate(() => { const g = window.__game; g.player.iframes = 0; g.damagePlayer(99999, { x: 1, y: 0, z: 0 }); });
await page.waitForFunction(() => window.__game.state === 'gameover', { timeout: 20000 });
const hasMenuBtn = await page.evaluate(() => { const b = document.getElementById('btn-gameover-menu'); return b && getComputedStyle(b).display !== 'none'; });
check('game over ha pulsante MENU', hasMenuBtn);
await page.click('#btn-gameover-menu');
await sleep(500);
const backToMenu = await page.evaluate(() => ({
  state: window.__game.state,
  menuVisible: !document.getElementById('menu').classList.contains('hidden'),
  diffUnlocked: !document.getElementById('difficulty').classList.contains('diff-locked'),
}));
check('MENU dopo morte: difficoltà riselezionabile', backToMenu.state === 'menu' && backToMenu.menuVisible && backToMenu.diffUnlocked, JSON.stringify(backToMenu));
// cambia difficoltà dal menu e rigioca
await page.click('.diff-btn[data-diff="incubo"]');
const changed = await page.evaluate(() => window.__CONFIG.player.dashCharges);
check('difficoltà cambiata dal menu (post-morte)', changed === 1, `dash=${changed}`);

await sleep(800);
check('nessun errore di pagina', errs.length === 0, errs.slice(0, 5).join(' | '));

console.log('=== RISULTATI ===');
out.forEach((r) => console.log(r));
await browser.close();
process.exit(out.some((r) => r.startsWith('FAIL')) ? 1 : 0);
