// Test d'integrazione: verifica colpi, uccisioni, drop, fine ondata,
// ondata successiva, boss (ondata 5), danni al giocatore e game over.
import puppeteer from 'puppeteer-core';

const URL = process.env.GAME_URL || 'http://localhost:5173';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=800,450', '--mute-audio'],
  defaultViewport: { width: 800, height: 450 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => {
  const b = document.getElementById('btn-play');
  return b && b.style.display !== 'none';
}, { timeout: 60000 });
await page.click('#btn-play');

// attendi che l'ondata parta e ci siano nemici attivi
await page.waitForFunction(() => {
  const g = window.__game;
  return g.state === 'playing' && g.director.enemies.some((e) => e.state === 'active');
}, { timeout: 90000 });
check('ondata avviata con nemici attivi', true);

// 1) teletrasporta un nemico davanti al giocatore e spara
await page.evaluate(() => {
  const g = window.__game;
  const e = g.director.enemies.find((x) => x.state === 'active');
  e.pos.set(g.player.pos.x, 0, g.player.pos.z - 4); // a nord del giocatore
});
await page.mouse.move(400, 100); // mira in alto (nord)
await sleep(300);
for (let i = 0; i < 6; i++) { await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(450); }
const hits = await page.evaluate(() => window.__game.stats.hits);
check('i proiettili colpiscono i nemici', hits > 0, `hits=${hits}`);

// 2) uccidi tutti i nemici via API e svuota la coda -> fine ondata
// (i nemici in fase di spawn ignorano il danno: ripeti finché l'arena è vuota)
await page.evaluate(() => {
  const g = window.__game;
  g.director.queue.length = 0;
  window.__killAll = setInterval(() => {
    g.director.queue.length = 0;
    for (const e of g.director.enemies) if (!e.dead) e.takeDamage(99999, { x: 1, y: 0, z: 0 });
  }, 400);
});
await page.waitForFunction(() => window.__game.intermissionT > 0, { timeout: 90000 });
await page.evaluate(() => clearInterval(window.__killAll));
const st1 = await page.evaluate(() => {
  const g = window.__game;
  return { kills: g.stats.kills, score: Math.round(g.score), pickups: g.pickups.items.length };
});
check('ondata completata -> intermezzo', true, JSON.stringify(st1));
check('uccisioni contate', st1.kills > 0, `kills=${st1.kills}`);
check('punteggio assegnato', st1.score > 0, `score=${st1.score}`);
check('rifornimenti lanciati', st1.pickups >= 2, `pickups=${st1.pickups}`);

// 3) accorcia l'intermezzo -> ondata 2
await page.evaluate(() => { window.__game.intermissionT = 0.3; });
await page.waitForFunction(() => window.__game.wave === 2 && window.__game.director.enemies.length > 0, { timeout: 30000 });
check('ondata 2 avviata', true);

// screenshot di gioco con camera nuova
await sleep(4000);
await page.screenshot({ path: 'tools/shot_integration.png' });

// 4) salta all'ondata 5: boss
await page.evaluate(() => {
  const g = window.__game;
  g.director.clear();
  g.startWave(5);
});
await page.waitForFunction(() => {
  const g = window.__game;
  return g.director.enemies.some((e) => e.boss);
}, { timeout: 60000 });
const bossInfo = await page.evaluate(() => {
  const g = window.__game;
  const b = g.director.enemies.find((e) => e.boss);
  return {
    name: b.boss.name, hp: Math.round(b.maxHp), state: b.state,
    barVisible: document.getElementById('boss-wrap').style.display !== 'none',
    model: b.procedural ? 'proc' : 'glb',
  };
});
check('boss generato (ondata 5)', true, JSON.stringify(bossInfo));
check('barra del boss visibile', bossInfo.barVisible);
await sleep(5000);
await page.screenshot({ path: 'tools/shot_boss.png' });

// attendi un'abilità del boss (telegrafo o attivazione)
const usedAbility = await page.evaluate(async () => {
  const g = window.__game;
  const b = g.director.enemies.find((e) => e.boss);
  if (b) b.abilityTimer = 0.1; // forza
  const t0 = Date.now();
  return await new Promise((res) => {
    const iv = setInterval(() => {
      const bb = g.director.enemies.find((e) => e.boss);
      if (bb && bb.ability) { clearInterval(iv); res(bb.ability.name); }
      if (Date.now() - t0 > 25000) { clearInterval(iv); res(null); }
    }, 200);
  });
});
check('il boss usa abilità', !!usedAbility, `abilità=${usedAbility}`);

// 5) morte del giocatore -> game over
await page.evaluate(() => {
  const g = window.__game;
  g.player.iframes = 0;
  g.damagePlayer(9999, { x: g.player.pos.x + 1, y: 0, z: g.player.pos.z });
});
await page.waitForFunction(() => window.__game.state === 'gameover', { timeout: 20000 });
const goVisible = await page.evaluate(() => !document.getElementById('gameover').classList.contains('hidden'));
check('game over mostrato', goVisible);
await page.screenshot({ path: 'tools/shot_gameover.png' });

// 6) RIGIOCA -> reset pulito
await page.click('#btn-restart');
await sleep(1500);
const restart = await page.evaluate(() => {
  const g = window.__game;
  return { state: g.state, hp: g.player.hp, enemies: g.director.enemies.length, score: g.score, wave: g.wave };
});
check('rigioca resetta lo stato', restart.state === 'playing' && restart.hp === 100 && restart.enemies === 0 && restart.score === 0, JSON.stringify(restart));

console.log('=== RISULTATI ===');
for (const r of results) console.log(r);
console.log('=== ERRORI PAGINA (' + errors.length + ') ===');
for (const e of errors.slice(0, 20)) console.log(e);
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
