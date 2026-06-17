// Smoke test headless: apre il gioco, raccoglie errori console, clicca GIOCA,
// simula qualche secondo di gioco con input e salva screenshot.
import puppeteer from 'puppeteer-core';

const URL = process.env.GAME_URL || 'http://localhost:5173';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,540', '--mute-audio'],
  defaultViewport: { width: 960, height: 540 },
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[${r.status()}] ${r.url()}`); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// attendi che il pulsante GIOCA appaia (asset caricati)
let ready = false;
try {
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-play');
    return b && b.style.display !== 'none';
  }, { timeout: 60000 });
  logs.push('[ok] asset caricati, pulsante GIOCA visibile');
  ready = true;
} catch {
  logs.push('[FAIL] pulsante GIOCA mai apparso');
}
await page.screenshot({ path: 'tools/shot_menu.png' });

if (!ready) {
  console.log('--- LOG (' + logs.length + ') ---');
  for (const l of logs.slice(0, 80)) console.log(l);
  await browser.close();
  process.exit(1);
}

// avvia la partita
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 9000));
await page.screenshot({ path: 'tools/shot_wave1.png' });

// muoviti e spara per qualche secondo
await page.mouse.move(620, 200);
await page.keyboard.down('KeyW');
await page.mouse.down();
await new Promise((r) => setTimeout(r, 5000));
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyA');
await new Promise((r) => setTimeout(r, 4000));
await page.keyboard.up('KeyA');
await page.mouse.up();
await new Promise((r) => setTimeout(r, 8000));
await page.screenshot({ path: 'tools/shot_combat.png' });

// stato di gioco interno
const state = await page.evaluate(() => {
  const g = window.__game;
  return {
    hud: document.getElementById('wave-num')?.textContent,
    enemiesHud: document.getElementById('enemies-left')?.textContent,
    hp: document.getElementById('hp-text')?.textContent,
    ammo: document.getElementById('ammo')?.textContent,
    state: g?.state,
    alive: g?.director?.enemies?.length,
    enemyStates: g?.director?.enemies?.map((e) => e.state + ':' + (e.procedural ? 'proc' : 'glb')).slice(0, 8),
    bullets: g?.player?.bullets?.length,
    shots: g?.stats?.shots,
    hits: g?.stats?.hits,
    kills: g?.stats?.kills,
    score: Math.round(g?.score ?? 0),
    playerAnim: g?.player?.anim?.currentPurpose,
    hasPlayerModel: !!g?.player && !g.player.model.userData.procedural,
  };
});
console.log('STATO:', JSON.stringify(state, null, 1));

// aspetta ancora: l'ondata procede, vediamo se arrivano errori runtime
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: 'tools/shot_late.png' });

console.log('--- LOG (' + logs.length + ') ---');
for (const l of logs.slice(0, 60)) console.log(l);

await browser.close();
