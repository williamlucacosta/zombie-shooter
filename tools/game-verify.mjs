// Verifica integrità dopo l'ottimizzazione del caricamento: nessun errore, asset caricati,
// mondo (PH props + texture) e nemici visibili. Screenshot dell'hub in partita.
// Uso: node tools/game-verify.mjs   (dev server attivo)
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loadTimes && window.__loadTimes.ready, { timeout: 120000, polling: 50 });

// stato asset essenziali (eager)
const eager = await page.evaluate(() => ({
  player: !!window.__assets.player,
  walker: !!window.__assets.characters.get('zombie_aiden'),
  props: window.__assets.props.size,
  guns: window.__assets.guns.size,
  tex: Object.keys(window.__assets.tex),
}));

// avvia la partita
await page.evaluate(() => document.getElementById('btn-play').click());
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', { timeout: 30000 });

// muoviti un attimo + lascia partire l'ondata (swiftshader è lento: attesa generosa)
await page.evaluate(() => window.__game.input.keys.add('KeyW'));
await new Promise((r) => setTimeout(r, 9000));
await page.evaluate(() => window.__game.input.keys.delete('KeyW'));

// stato differiti + nemici in scena
const live = await page.evaluate(() => {
  const g = window.__game;
  const ens = g.director?.enemies || g.enemies || [];
  return {
    deferredWalkerFallbacks: ['zombie_a', 'dog', 'zombie_larnox'].filter((n) => window.__assets.characters.get(n)),
    enemyCount: ens.length,
    proceduralEnemies: ens.filter((e) => e.procedural).length,
  };
});

await page.screenshot({ path: 'tools/_shots/game_hub.png' });

console.log('\n  --- ASSET EAGER ---');
console.log(`  player: ${eager.player}   walker(aiden): ${eager.walker}   props: ${eager.props}   guns: ${eager.guns}`);
console.log(`  tex: ${eager.tex.join(', ')}`);
console.log('  --- IN PARTITA ---');
console.log(`  nemici in scena: ${live.enemyCount}  (procedurali: ${live.proceduralEnemies})`);
console.log(`  differiti caricati: ${live.deferredWalkerFallbacks.join(', ') || '(ancora nessuno)'}`);
console.log(`  errori console: ${errs.length ? '\n   - ' + errs.slice(0, 6).join('\n   - ') : 'NESSUNO'}`);
console.log('  screenshot: tools/_shots/game_hub.png');
await browser.close();
