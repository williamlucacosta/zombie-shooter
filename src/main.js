// NOTTE DELL'ORDA — entry point: rendering, post-processing, stati di gioco,
// camera, flusso delle ondate, punteggio e collegamento di tutti i sistemi.

import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, VignetteEffect, SMAAEffect, ChromaticAberrationEffect,
} from 'postprocessing';
import { CONFIG, waveTheme, isBossWave, DIFFICULTIES, setDifficulty, soulsFor } from './config.js';
import { loadAssets, loadDeferredAssets, Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { buildWorld } from './world.js';
import { Rain } from './rain.js';
import { Player } from './player.js';
import { WaveDirector, setConfine } from './enemies.js';
import { Pickups } from './pickups.js';
import { UI } from './ui.js';

// ----------------------------------------------------------- setup base --

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 320);
camera.position.set(0, CONFIG.camera.offsetY, CONFIG.camera.offsetZ);
camera.lookAt(0, 0, 0);

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
// Bloom e aberrazione cromatica sono entrambi effetti di convoluzione:
// devono stare in EffectPass separati.
composer.addPass(new EffectPass(
  camera,
  new SMAAEffect(),
  new BloomEffect({ intensity: 0.9, luminanceThreshold: 0.3, luminanceSmoothing: 0.2, mipmapBlur: true }),
));
composer.addPass(new EffectPass(
  camera,
  new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0007, 0.0007), radialModulation: true, modulationOffset: 0.4 }),
  new VignetteEffect({ darkness: 0.5, offset: 0.3 }),
));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------ stato gioco --

const ui = new UI();
const input = new Input(renderer.domElement);

const game = {
  scene, camera, renderer, ui, input,
  effects: null, world: null, rain: null, player: null, director: null, pickups: null,
  state: 'menu', // menu | playing | paused | dying | gameover
  viewMode: 'topdown', // 'topdown' | 'fps'
  fpsYaw: 0,
  fpsPitch: 0,
  wave: 0,
  score: 0,
  souls: 0,           // valuta "Anime" per aprire le porte (separata dal punteggio)
  zonesUnlocked: 0,   // quante zone aperte (alza la difficoltà)
  opt: { blood: true, damage: false }, // opzioni (toggle): sangue / numeri danno visibili
  comboMult: 1,
  comboT: 0,
  intermissionT: 0,
  timeScale: 1,
  elapsed: 0,
  raining: false,
  weatherDark: 0,   // target di oscuramento meteo 0..1
  _dark: 0,         // valore attuale (lerp)
  stats: { shots: 0, hits: 0, kills: 0, time: 0 },
  colliders: [],

  playerPos() { return this.player.pos; },
  damagePlayer(dmg, fromPos) { this.player.takeDamage(dmg, fromPos); },

  onEnemyKilled(enemy) {
    this.stats.kills++;
    this.comboT = CONFIG.comboWindow;
    this.comboMult = Math.min(4, this.comboMult + 0.15);
    this.score += enemy.scoreValue * this.comboMult;
    this.souls += soulsFor(enemy); // valuta per le porte
    ui.score(this.score);
    ui.souls(this.souls);
    ui.combo(this.comboMult);
    this.director.onKill(enemy);
    if (enemy.boss) {
      this.effects.addTrauma(0.5);
      this.timeScale = 0.3; // slow-motion celebrativo
      setTimeout(() => { if (this.state === 'playing') this.timeScale = 1; }, 900);
      ui.banner(`${enemy.boss.name} ABBATTUTO`, '+' + enemy.boss.score + ' PUNTI');
    }
  },

  onWaveCleared() {
    const bonus = 50 + this.wave * 25;
    this.score += bonus;
    ui.score(this.score);
    ui.toast(`ONDATA COMPLETATA  +${bonus}`);
    Audio.play('wave_clear', { vol: 0.8 });
    this.intermissionT = CONFIG.intermission;
    this.pickups.supplyDrop();
  },

  onPlayerDied() {
    this.state = 'dying';
    setViewMode('topdown'); // morte e game over si vedono dall'alto, col cursore
    this.timeScale = 0.25;
    this.effects.addTrauma(0.8);
    Audio.setIntensity(0);
    setTimeout(() => this.endGame(), 2300);
  },

  startWave(n) {
    this.wave = n;
    this.director.startWave(n);
    const theme = waveTheme(n);
    const comp = this.director.bossDef;
    ui.wave(n, comp ? comp.name : theme.name);
    ui.banner(`ONDATA ${n}`, comp ? `${comp.name} — ${comp.sub}` : theme.name);
    ui.countdown(null);
    Audio.play('wave_start', { vol: 0.9 });
    // sfumatura della nebbia verso il tema dell'ondata
    const tint = new THREE.Color(theme.tint);
    scene.fog.color.setHex(0x0a0d1a).lerp(tint, 0.06);
    if (scene.background) scene.background.setHex(0x05070f).lerp(tint, 0.03);
    this._baseFog = scene.fog.color.clone();
    this._baseBg = scene.background ? scene.background.clone() : null;
    this.decideWeather(n);
  },

  // Pioggia occasionale: mai alla prima ondata, ~35% delle altre (sempre durante
  // alcuni boss per drammaticità). Se piove, intensità variabile e cielo più cupo.
  decideWeather(n) {
    let rain = false, intensity = 0;
    if (n >= 2) {
      if (this.director.bossDef && Math.random() < 0.6) rain = true;
      else if (Math.random() < 0.35) rain = true;
      if (rain) intensity = 0.55 + Math.random() * 0.45;
    }
    this.raining = rain;
    this.weatherDark = rain ? intensity : 0;
    if (rain) {
      this.rain.start(intensity);
      Audio.setRain(true, intensity);
      ui.toast('⛈ TEMPORALE');
    } else {
      this.rain.stop();
      Audio.setRain(false);
    }
  },

  endGame() {
    this.state = 'gameover';
    this.timeScale = 1;
    const best = Number(localStorage.getItem('noh_best') || 0);
    const final = Math.round(this.score);
    const isRecord = final > best;
    if (isRecord) localStorage.setItem('noh_best', String(final));
    ui.gameOver(
      { score: final, wave: this.wave, kills: this.stats.kills, shots: this.stats.shots, hits: this.stats.hits, time: this.stats.time },
      Math.max(best, final), isRecord,
    );
  },

  // Apre la porta-gate più vicina spendendo Anime; alza la difficoltà globale.
  tryUnlockGate() {
    const gate = this.world.nearestGate(this.player.pos, 5);
    if (!gate) return;
    if (this.souls < gate.cost) {
      ui.toast(`SERVONO ${gate.cost} ✦`);
      Audio.play('click', { vol: 0.6 });
      return;
    }
    this.souls -= gate.cost;
    this.zonesUnlocked++;
    this.world.unlockZone(gate.id);
    ui.souls(this.souls);
    ui.doorPrompt(null);
    ui.banner(gate.name, gate.sub, 2800);
    ui.toast(`${gate.name} APERTA — l'orda si fa più feroce`);
    Audio.play('weapon_pickup', { vol: 1 });
    Audio.playAt('boss_roar', gate.pos, this.player.pos, { vol: 0.8 });
    this.effects.addTrauma(0.45);
    this.effects.spawnPillar(gate.pos, 0xffd070, 2.6);
  },

  startRun() {
    this.director.clear();
    this.pickups.clear();
    this.player.reset();
    this.world.resetZones();
    this.souls = 0;
    this.zonesUnlocked = 0;
    ui.souls(0);
    ui.doorPrompt(null);
    this.score = 0;
    this.comboMult = 1;
    this.comboT = 0;
    this.intermissionT = 0;
    this.timeScale = 1;
    this.raining = false;
    this.weatherDark = 0;
    this.rain.stop();
    Audio.setRain(false);
    this.stats = { shots: 0, hits: 0, kills: 0, time: 0 };
    ui.score(0);
    ui.combo(1);
    ui.health(this.player.hp, this.player.maxHp);
    ui.stamina(this.player.dashCharges);
    ui.ammo(this.player);
    ui.weapons(this.player);
    ui.reloading(false);
    ui.bossHide();
    ui.showScreen(null);
    this.state = 'playing';
    Audio.resume();
    Audio.startMusic();
    ui.banner('SOPRAVVIVI', 'I morti si stanno risvegliando…', 2200);
    setTimeout(() => { if (this.state === 'playing' && this.wave === 0) this.startWave(1); }, 2400);
    this.wave = 0;
  },
};

// --------------------------------------------------------- caricamento --

const best0 = Number(localStorage.getItem('noh_best') || 0);
Audio.init(); // contesto sospeso finché l'utente non clicca

// cede il thread al browser così l'etichetta di caricamento viene davvero disegnata
// prima di un blocco di lavoro sincrono (build mondo / compilazione shader).
const paint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

(async () => {
  const T = (window.__loadTimes = { t0: performance.now() });
  // Modelli e SFX essenziali caricati IN PARALLELO; la musica (pesante) è differita.
  // L'etichetta segue la categoria caricata dai modelli; l'audio aggiorna solo la barra.
  let mp = 0, ap = 0;
  await Promise.all([
    loadAssets((f, label) => { mp = f; ui.loading(mp * 0.5 + ap * 0.5, label); }),
    Audio.loadFiles((f) => { ap = f; ui.loading(mp * 0.5 + ap * 0.5); }),
  ]);
  T.assets = performance.now() - T.t0;

  ui.loading(1, 'Costruzione del cimitero…');
  await paint();
  game.effects = new Effects(scene);
  game.world = buildWorld(scene);
  game.colliders = game.world.colliders;
  setConfine(game.world.confine); // l'area giocabile è l'unione delle stanze attive
  game.rain = new Rain(scene);
  game.player = new Player(game);
  game.director = new WaveDirector(game);
  game.pickups = new Pickups(game);
  T.world = performance.now() - T.t0;

  // Carica E scalda TUTTO durante la barra, così quando appare il menu il gioco è già fluido
  // (niente lag mentre scegli la difficoltà). I nemici "differiti" si caricano in parallelo alla
  // preparazione della scena; poi compilo gli shader di tutti i modelli. Solo la MUSICA (pesante e
  // ininfluente sul rendering) resta in sottofondo dopo il menu.
  const deferredP = loadDeferredAssets(); // rete in parallelo al warm del mondo
  ui.loading(1, 'Preparazione scena…');
  await warmPipeline();                   // mondo + postprocessing + ombre + texture (visibile)
  ui.loading(1, 'Caricamento nemici…');
  await deferredP;
  ui.loading(1, 'Compilazione shader…');
  await prewarmShaders();                 // tutti i modelli: programma principale + d'ombra
  T.ready = performance.now() - T.t0;

  ui.readyToPlay(best0);
  setDiffEnabled(true); // la difficoltà è scegliibile solo a risorse caricate
  Audio.loadDeferred(); // musica in sottofondo: non influisce sul rendering, può arrivare dopo
})();

// Scalda la pipeline VISIBILE (mondo + postprocessing + ombre + texture) facendo qualche render
// reale del mondo: il loop (stato 'menu') renderizza la scena -> compila bloom/CA, genera la
// shadow map dell'intero mondo e carica le texture. È il "primo render" pesante, qui nella barra.
async function warmPipeline() {
  if (!game.player) return;
  for (let i = 0; i < 2; i++) { renderer.shadowMap.needsUpdate = true; await paint(); }
}

// Pre-scalda gli shader di TUTTI i modelli caricati (evita lag in gioco). Due programmi distinti:
//  • PRINCIPALE: `renderer.compileAsync` -> compilazione PARALLELA (KHR_parallel_shader_compile),
//    il main thread NON si blocca. I modelli sono tenuti INVISIBILI durante l'attesa, sennò il loop
//    li renderizzerebbe (lampeggio dietro la barra).
//  • PROFONDITÀ (caster d'ombra skinnato): compileAsync NON lo compila (lo fa three solo al render
//    della shadow map) -> un solo render batch di tutti i modelli, fuori schermo. Stallo minimo.
const _warmRT = new THREE.WebGLRenderTarget(8, 8);
const _prewarmed = new Set();
async function prewarmShaders() {
  if (!game.player) return;
  if (window.__loadTimes) window.__loadTimes.prewarmRunning = true;
  const temps = [];
  const add = (s) => { if (s && !s.parent && !_prewarmed.has(s)) { _prewarmed.add(s); s.visible = false; scene.add(s); temps.push(s); } };
  add(Assets.player?.scene);
  for (const c of Assets.characters.values()) add(c.scene);
  for (const g of Assets.guns.values()) add(g.scene);
  if (temps.length) {
    try { await renderer.compileAsync(scene, camera); } catch { /* best effort */ }
    for (const s of temps) s.visible = true;
    // l'arma in mano (glock, già nella scena via gunMount ma invisibile nel menu) la rendo visibile
    // per questo solo render, così scalda anche il suo programma d'ombra: niente scatto al via.
    const gm = game.player.gunMount, gmVis = gm?.visible;
    if (gm) gm.visible = true;
    const prev = renderer.getRenderTarget();
    try {
      renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(_warmRT);
      renderer.render(scene, camera);
    } catch { /* best effort */ }
    finally {
      renderer.setRenderTarget(prev);
      if (gm) gm.visible = gmVis;
      for (const s of temps) scene.remove(s);
    }
  }
  if (window.__loadTimes) { window.__loadTimes.prewarmRunning = false; window.__loadTimes.prewarmDone = performance.now() - window.__loadTimes.t0; }
}

window.__game = game; // diagnostica
window.__CONFIG = CONFIG; // permette test/tuning della camera a runtime
window.__audio = Audio; // diagnostica audio nei test
window.__assets = Assets; // diagnostica asset (verifica caricamento modelli nei test)
window.__THREE = THREE; // diagnostica (bounding box nei test, es. appoggio dei cadaveri)

// ------------------------------------------------------------- pulsanti --

// --- selezione difficoltà ---
const savedDiff = localStorage.getItem('noh_diff') || 'normale';
function applyDifficulty(key) {
  const d = setDifficulty(key);
  localStorage.setItem('noh_diff', d.key);
  document.getElementById('diff-desc').textContent = d.desc;
  for (const b of document.querySelectorAll('.diff-btn')) {
    b.classList.toggle('active', b.dataset.diff === d.key);
  }
}
for (const b of document.querySelectorAll('.diff-btn')) {
  b.addEventListener('click', () => { applyDifficulty(b.dataset.diff); Audio.play('click', { vol: 0.5 }); });
}
applyDifficulty(DIFFICULTIES[savedDiff] ? savedDiff : 'normale');
// nascosta del tutto finché le risorse non sono pronte (vedi IIFE di caricamento)
function setDiffEnabled(on) {
  document.getElementById('difficulty').style.display = on ? 'flex' : 'none';
}
setDiffEnabled(false);

// --- opzioni (sangue / numeri danno): persistite in localStorage, applicate live, sincronizzate
//     tra menu e pausa. enemies.js legge game.opt a ogni colpo. ---
function initOption(key, def) {
  const saved = localStorage.getItem('noh_opt_' + key);
  game.opt[key] = saved === null ? def : saved === '1';
  for (const cb of document.querySelectorAll(`[data-opt="${key}"]`)) {
    cb.checked = game.opt[key];
    cb.addEventListener('change', () => {
      game.opt[key] = cb.checked;
      localStorage.setItem('noh_opt_' + key, cb.checked ? '1' : '0');
      for (const o of document.querySelectorAll(`[data-opt="${key}"]`)) o.checked = cb.checked;
      Audio.play('click', { vol: 0.5 });
    });
  }
}
initOption('blood', true);
initOption('damage', false);

// Torna al menu (da game over o abbandono): qui si può ricambiare difficoltà.
function returnToMenu() {
  game.state = 'menu';
  setViewMode('topdown');
  game.director.clear();
  game.pickups.clear();
  game.rain.stop();
  Audio.setRain(false);
  game.weatherDark = 0;
  game.wave = 0;
  game.souls = 0;
  game.zonesUnlocked = 0;
  game.world.resetZones();
  game.player.reset();
  game.player.gunMount.visible = false;
  ui.bossHide();
  ui.countdown(null);
  ui.doorPrompt(null);
  ui.showScreen('menu');
  setDiffEnabled(true);
}

ui.el.btnPlay.addEventListener('click', () => game.startRun());
ui.el.btnRestart.addEventListener('click', () => game.startRun());
ui.el.btnResume.addEventListener('click', () => togglePause());
ui.el.btnQuit.addEventListener('click', () => returnToMenu());           // ABBANDONA -> menu
document.getElementById('btn-gameover-menu').addEventListener('click', () => returnToMenu());

// Volume persistito in localStorage. La MUSICA parte muta (0) di default: l'utente la alza
// dalla scheda Opzioni (rondella) e la scelta resta salvata.
for (const [id, fn, def] of [['vol-master', 'setMaster', 80], ['vol-music', 'setMusic', 0], ['vol-sfx', 'setSfx', 90]]) {
  const el = document.getElementById(id);
  const saved = localStorage.getItem('noh_' + id);
  const val = saved === null ? def : Number(saved);
  el.value = val;
  Audio[fn](val / 100);
  el.addEventListener('input', (e) => {
    Audio[fn](e.target.value / 100);
    localStorage.setItem('noh_' + id, e.target.value);
  });
}

// --- scheda OPZIONI (rondella): apribile da menu e da pausa, torna alla schermata di partenza ---
let optionsReturn = 'menu';
function openOptions(from) { optionsReturn = from; ui.showScreen('options'); Audio.play('click', { vol: 0.5 }); }
function closeOptions() { ui.showScreen(optionsReturn); Audio.play('click', { vol: 0.5 }); }
document.getElementById('btn-options').addEventListener('click', () => openOptions('menu'));
document.getElementById('btn-options-pause').addEventListener('click', () => openOptions('pause'));
document.getElementById('btn-options-close').addEventListener('click', () => closeOptions());

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    ui.showScreen('pause');
    ui.doorPrompt(null);
    Audio.setMusic(0.25 * (document.getElementById('vol-music').value / 100));
    input.exitLock(); // libera il cursore in pausa
  } else if (game.state === 'paused') {
    game.state = 'playing';
    ui.showScreen(null);
    Audio.setMusic(document.getElementById('vol-music').value / 100);
    Audio.resume();
    if (game.viewMode === 'fps') input.requestLock(); // riaggancia il puntatore (gesto: Riprendi)
  }
}

// Cambia visuale: dall'alto (twin-stick) <-> prima persona (FPS, mouse-look + pointer lock).
function setViewMode(mode) {
  if (!game.player || mode === game.viewMode) return;
  game.viewMode = mode;
  const fps = mode === 'fps';
  input.wantLock = fps;
  game.player.setFpsView(fps);
  camera.near = fps ? 0.08 : 0.5; // evita il clipping dell'arma/nemici vicini in FPS
  camera.updateProjectionMatrix();
  if (fps) {
    game.fpsYaw = Math.atan2(game.player.aimDir.x, game.player.aimDir.z); // parte da dove miravi
    game.fpsPitch = 0;
    if (game.state === 'playing') input.requestLock();
    ui.banner('PRIMA PERSONA', 'V per tornare alla visuale dall’alto', 1500);
  } else {
    input.exitLock();
  }
}

// Tasto V: alterna visuale dall'alto / prima persona (solo in partita).
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat && game.state === 'playing') {
    setViewMode(game.viewMode === 'fps' ? 'topdown' : 'fps');
  }
});

// --------------------------------------------------------------- loop ----

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const shake = new THREE.Vector3();
let heartbeatT = 0;
let intensityT = 0;
// atmosfera base (vedi world.js) e colore tempesta per il meteo
const BASE_FOG = 0.018, BASE_EXPO = 1.45;
const STORM_COLOR = new THREE.Color(0x2a3340);
const BG_BASE = new THREE.Color(0x05070f);

renderer.setAnimationLoop(() => {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (input.wasPressed('Escape')) {
    if (!ui.el.options.classList.contains('hidden')) closeOptions(); // Esc chiude la scheda opzioni
    else if (game.state === 'playing' || game.state === 'paused') togglePause();
  }

  if (game.viewMode === 'fps' && game.state === 'playing') ui.crosshairPos(innerWidth / 2, innerHeight / 2);
  else ui.crosshairPos(input.mousePix.x, input.mousePix.y);

  const playing = game.state === 'playing' || game.state === 'dying';
  if (playing && game.world) {
    const dt = rawDt * game.timeScale;
    game.stats.time += rawDt;

    if (game.viewMode === 'fps') {
      // mouse-look: i delta del mouse ruotano lo sguardo (yaw + pitch)
      const sens = 0.0022;
      game.fpsYaw -= input.lookDX * sens; // mouse a destra -> guarda a destra
      game.fpsPitch = THREE.MathUtils.clamp(game.fpsPitch - input.lookDY * sens, -1.15, 0.75);
      // mira lungo lo sguardo orizzontale (i nemici sono a terra)
      aimPoint.set(
        game.player.pos.x + Math.sin(game.fpsYaw) * 12, 0,
        game.player.pos.z + Math.cos(game.fpsYaw) * 12,
      );
    } else {
      // punto di mira sul terreno (twin-stick)
      raycaster.setFromCamera(input.mouseNDC, camera);
      raycaster.ray.intersectPlane(groundPlane, aimPoint) || aimPoint.copy(game.player.pos);
    }

    game.player.update(dt, input, aimPoint, game.director.enemies);
    game.director.update(dt);
    game.pickups.update(dt, game.player, t);
    game.effects.update(dt);
    game.world.update(dt, t, game.player.pos);

    // porte verso le zone: prompt quando vicino, apertura con E
    if (game.state === 'playing') {
      const gate = game.world.nearestGate(game.player.pos, 5);
      ui.doorPrompt(gate, game.souls);
      if (gate && input.wasPressed('KeyE')) game.tryUnlockGate();
    }

    // combo
    if (game.comboT > 0) {
      game.comboT -= dt;
      if (game.comboT <= 0) { game.comboMult = 1; ui.combo(1); }
    }

    // intermezzo tra ondate
    if (game.intermissionT > 0 && game.state === 'playing') {
      game.intermissionT -= dt;
      ui.countdown(game.intermissionT);
      if (game.intermissionT <= 0) {
        ui.countdown(null);
        game.startWave(game.wave + 1);
      }
    }

    ui.enemies(game.director.remaining());

    // battito cardiaco a vita bassa
    heartbeatT -= rawDt;
    if (game.player.hp < 32 && !game.player.dead && heartbeatT <= 0) {
      heartbeatT = 1.15;
      Audio.play('heartbeat', { vol: 0.55 });
    }

    // intensità musicale legata alla pressione dell'orda
    intensityT -= rawDt;
    if (intensityT <= 0) {
      intensityT = 0.5;
      Audio.setIntensity(Math.min(1, game.director.aliveCount() / 12));
    }

    game.effects.shakeOffset(shake);
    if (game.viewMode === 'fps') {
      // camera negli occhi del giocatore, orientata lungo yaw+pitch
      const p = game.player.pos, eye = 1.62;
      const cp = Math.cos(game.fpsPitch);
      const dx = Math.sin(game.fpsYaw) * cp, dy = Math.sin(game.fpsPitch), dz = Math.cos(game.fpsYaw) * cp;
      camera.position.set(p.x + shake.x * 0.35, eye + shake.y * 0.35, p.z + shake.z * 0.35);
      camera.lookAt(p.x + dx, eye + dy, p.z + dz);
    } else {
      // camera dall'alto: segue il giocatore, anticipa verso la mira
      camTarget.copy(game.player.pos);
      camTarget.x += (aimPoint.x - game.player.pos.x) * CONFIG.camera.aimPull;
      camTarget.z += (aimPoint.z - game.player.pos.z) * CONFIG.camera.aimPull;
      camDesired.set(camTarget.x, CONFIG.camera.offsetY, camTarget.z + CONFIG.camera.offsetZ);
      const k = 1 - Math.exp(-CONFIG.camera.lerp * rawDt);
      camera.position.lerp(camDesired, k);
      camera.position.add(shake);
      camera.lookAt(camTarget.x + shake.x * 0.5, 0, camTarget.z + shake.z * 0.5);
    }
  } else if (game.world) {
    // anche nei menu la scena vive: nebbia, lucciole, lanterne
    game.world.update(rawDt, t, game.player ? game.player.pos : null);
    game.effects?.update(rawDt);
    camera.position.lerp(camDesired.set(Math.sin(t * 0.05) * 4, CONFIG.camera.offsetY, CONFIG.camera.offsetZ + Math.cos(t * 0.07) * 2), 0.02);
    camera.lookAt(0, 0, 0);
  }

  // pioggia e meteo (in tempo reale, in ogni stato così sfumano correttamente).
  // La nebbia BASE viene dalla zona in cui si trova il giocatore (world.atmoFog/atmoDensity);
  // il meteo la inscurisce/ispessisce sopra.
  if (game.rain) {
    game.rain.update(rawDt, game.player ? game.player.pos : null, game.effects);
    game._dark += (game.weatherDark - game._dark) * (1 - Math.exp(-2.0 * rawDt));
    const d = game._dark;
    const baseDens = game.world ? game.world.atmoDensity : BASE_FOG;
    scene.fog.density = baseDens * (1 + 1.8 * d);
    renderer.toneMappingExposure = BASE_EXPO * (1 - 0.34 * d);
    if (game.world) scene.fog.color.copy(game.world.atmoFog).lerp(STORM_COLOR, 0.55 * d);
    if (scene.background) scene.background.copy(BG_BASE).lerp(STORM_COLOR, 0.4 * d);
  }

  composer.render(rawDt);
  input.endFrame();
});
