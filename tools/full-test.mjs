// Test completo dei nuovi fix: difficoltà, pioggia, fulmini, audio premium.
import puppeteer from 'puppeteer-core';
const URL = process.env.GAME_URL || 'http://localhost:3210';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (n, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=900,540', '--mute-audio'],
  defaultViewport: { width: 900, height: 540 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => { const b = document.getElementById('btn-play'); return b && b.style.display !== 'none'; }, { timeout: 60000 });

// --- AUDIO premium caricato (tutti OGG) ---
const audio = await page.evaluate(() => {
  const a = window.__audio;
  const keys = ['shot_pistol', 'shot_shotgun', 'shot_smg', 'shot_magnum', 'rain_loop', 'thunder', 'music_ambient', 'zombie_growl'];
  const loaded = {};
  for (const k of keys) loaded[k] = (a.buffers.get(k) || []).length;
  return loaded;
});
check('gunshot premium caricati', audio.shot_pistol && audio.shot_shotgun && audio.shot_smg && audio.shot_magnum, JSON.stringify(audio));
check('pioggia/tuono/musica caricati', audio.rain_loop && audio.thunder >= 2 && audio.music_ambient, `rain=${audio.rain_loop} thunder=${audio.thunder} music=${audio.music_ambient}`);

// --- DIFFICOLTÀ: selezione cambia parametri (incl. dash) ---
await page.click('.diff-btn[data-diff="incubo"]');
const inc = await page.evaluate(() => ({ hp: window.__CONFIG.player.hp, dash: window.__CONFIG.player.dashCharges, cd: window.__CONFIG.player.dashCooldown, ifr: window.__CONFIG.player.dashIFrames }));
check('INCUBO: dash penalizzato', inc.dash === 1 && inc.hp === 65 && inc.ifr < 0.2, JSON.stringify(inc));
await page.click('.diff-btn[data-diff="facile"]');
const fac = await page.evaluate(() => ({ hp: window.__CONFIG.player.hp, dash: window.__CONFIG.player.dashCharges }));
check('FACILE: dash generoso', fac.dash === 3 && fac.hp === 130, JSON.stringify(fac));
// gioca in DIFFICILE
await page.click('.diff-btn[data-diff="difficile"]');
await page.click('#btn-play');
await page.waitForFunction(() => window.__game?.state === 'playing', { timeout: 30000 });
await page.waitForFunction(() => window.__game.player && window.__game.director.enemies.some((e) => e.state === 'active'), { timeout: 60000 });
const diffApplied = await page.evaluate(() => {
  const g = window.__game;
  return { playerHp: g.player.maxHp, dashCharges: g.player.dashCharges, enemyHp: Math.round(g.director.enemies[0]?.maxHp || 0) };
});
check('DIFFICILE applicato in partita', diffApplied.playerHp === 80 && diffApplied.dashCharges === 2, JSON.stringify(diffApplied));

// --- PIOGGIA: forza il temporale e cattura ---
await page.evaluate(() => {
  const g = window.__game;
  g.weatherDark = 0.9; g.raining = true;
  g.rain.start(0.95);
  window.__audio.setRain(true, 0.95);
});
await sleep(6000);
const rainState = await page.evaluate(() => {
  const g = window.__game;
  return { visible: g.rain.mesh.visible, intensity: +g.rain.intensity.toFixed(2), dark: +g._dark.toFixed(2), fog: +scene0(), };
  function scene0() { return window.__game.scene.fog.density; }
});
check('pioggia attiva e visibile', rainState.visible && rainState.intensity > 0.5, JSON.stringify(rainState));
check('cielo oscurato dal temporale', rainState.dark > 0.4, `dark=${rainState.dark}`);
await page.screenshot({ path: 'tools/shot_rain.png' });

// --- FULMINE ---
await page.evaluate(() => window.__game.rain.strike());
await sleep(60);
await page.screenshot({ path: 'tools/shot_lightning.png' });
const flashed = await page.evaluate(() => window.__game.rain.flashLight.intensity > 0 || window.__game.rain.flashSeq.length > 0);
check('fulmine genera lampo', flashed);

await sleep(1500);
check('nessun errore di pagina', errs.length === 0, errs.slice(0, 5).join(' | '));

console.log('=== RISULTATI ===');
out.forEach((r) => console.log(r));
await browser.close();
process.exit(out.some((r) => r.startsWith('FAIL')) ? 1 : 0);
