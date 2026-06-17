// NOTTE DELL'ORDA — entry point: rendering, post-processing, stati di gioco,
// camera, flusso delle ondate, punteggio e collegamento di tutti i sistemi.

import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, VignetteEffect, SMAAEffect, ChromaticAberrationEffect,
} from 'postprocessing';
import { CONFIG, waveTheme, isBossWave } from './config.js';
import { loadAssets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { WaveDirector } from './enemies.js';
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
  effects: null, world: null, player: null, director: null, pickups: null,
  state: 'menu', // menu | playing | paused | dying | gameover
  wave: 0,
  score: 0,
  comboMult: 1,
  comboT: 0,
  intermissionT: 0,
  timeScale: 1,
  elapsed: 0,
  stats: { shots: 0, hits: 0, kills: 0, time: 0 },
  colliders: [],

  playerPos() { return this.player.pos; },
  damagePlayer(dmg, fromPos) { this.player.takeDamage(dmg, fromPos); },

  onEnemyKilled(enemy) {
    this.stats.kills++;
    this.comboT = CONFIG.comboWindow;
    this.comboMult = Math.min(4, this.comboMult + 0.15);
    this.score += enemy.scoreValue * this.comboMult;
    ui.score(this.score);
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

  startRun() {
    this.director.clear();
    this.pickups.clear();
    this.player.reset();
    this.score = 0;
    this.comboMult = 1;
    this.comboT = 0;
    this.intermissionT = 0;
    this.timeScale = 1;
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

(async () => {
  ui.loading(0, 'Caricamento modelli…');
  await loadAssets((f) => ui.loading(f * 0.6, 'Caricamento modelli…'));
  ui.loading(0.6, 'Caricamento audio…');
  await Audio.loadFiles((f) => ui.loading(0.6 + f * 0.4, 'Caricamento audio…'));

  game.effects = new Effects(scene);
  game.world = buildWorld(scene);
  game.colliders = game.world.colliders;
  game.player = new Player(game);
  game.director = new WaveDirector(game);
  game.pickups = new Pickups(game);

  ui.readyToPlay(best0);
})();

window.__game = game; // diagnostica

// ------------------------------------------------------------- pulsanti --

ui.el.btnPlay.addEventListener('click', () => game.startRun());
ui.el.btnRestart.addEventListener('click', () => game.startRun());
ui.el.btnResume.addEventListener('click', () => togglePause());
ui.el.btnQuit.addEventListener('click', () => { game.state = 'playing'; game.endGame(); });

for (const [id, fn] of [['vol-master', 'setMaster'], ['vol-music', 'setMusic'], ['vol-sfx', 'setSfx']]) {
  document.getElementById(id).addEventListener('input', (e) => Audio[fn](e.target.value / 100));
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    ui.showScreen('pause');
    Audio.setMusic(0.25 * (document.getElementById('vol-music').value / 100));
  } else if (game.state === 'paused') {
    game.state = 'playing';
    ui.showScreen(null);
    Audio.setMusic(document.getElementById('vol-music').value / 100);
    Audio.resume();
  }
}

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

renderer.setAnimationLoop(() => {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (input.wasPressed('Escape') && (game.state === 'playing' || game.state === 'paused')) {
    togglePause();
  }

  ui.crosshairPos(input.mousePix.x, input.mousePix.y);

  const playing = game.state === 'playing' || game.state === 'dying';
  if (playing && game.world) {
    const dt = rawDt * game.timeScale;
    game.stats.time += rawDt;

    // punto di mira sul terreno
    raycaster.setFromCamera(input.mouseNDC, camera);
    raycaster.ray.intersectPlane(groundPlane, aimPoint) || aimPoint.copy(game.player.pos);

    game.player.update(dt, input, aimPoint, game.director.enemies);
    game.director.update(dt);
    game.pickups.update(dt, game.player, t);
    game.effects.update(dt);
    game.world.update(dt, t);

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

    // camera: segue il giocatore, anticipa verso la mira
    camTarget.copy(game.player.pos);
    camTarget.x += (aimPoint.x - game.player.pos.x) * CONFIG.camera.aimPull;
    camTarget.z += (aimPoint.z - game.player.pos.z) * CONFIG.camera.aimPull;
    camDesired.set(camTarget.x, CONFIG.camera.offsetY, camTarget.z + CONFIG.camera.offsetZ);
    const k = 1 - Math.exp(-CONFIG.camera.lerp * rawDt);
    camera.position.lerp(camDesired, k);
    game.effects.shakeOffset(shake);
    camera.position.add(shake);
    camera.lookAt(camTarget.x + shake.x * 0.5, 0, camTarget.z + shake.z * 0.5);
  } else if (game.world) {
    // anche nei menu la scena vive: nebbia, lucciole, lanterne
    game.world.update(rawDt, t);
    game.effects?.update(rawDt);
    camera.position.lerp(camDesired.set(Math.sin(t * 0.05) * 4, CONFIG.camera.offsetY, CONFIG.camera.offsetZ + Math.cos(t * 0.07) * 2), 0.02);
    camera.lookAt(0, 0, 0);
  }

  composer.render(rawDt);
  input.endFrame();
});
