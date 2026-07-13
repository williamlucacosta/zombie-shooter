// NOTTE DELL'ORDA — entry point: rendering, post-processing, stati di gioco,
// camera, flusso delle ondate, punteggio e collegamento di tutti i sistemi.

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import {
  EffectComposer, RenderPass, EffectPass, Effect,
  BloomEffect, VignetteEffect, SMAAEffect, ChromaticAberrationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { CONFIG, waveTheme, isBossWave, DIFFICULTIES, setDifficulty, soulsFor } from './config.js';
import { loadAssets, loadDeferredAssets, loadNextBackgroundGun, makeSkinVariantsAll, Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { buildWorld } from './world.js';
import { Rain } from './rain.js';
import { Player } from './player.js';
import { WaveDirector, setConfine } from './enemies.js';
import { Pickups } from './pickups.js';
import { UI } from './ui.js';
import { Net } from './net.js';
import { Coop, seedRandom } from './coop.js';

// ----------------------------------------------------------- setup base --

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setSize(innerWidth, innerHeight);
// 1.5 invece di 1.75: su schermi ad alta densità è ~15% di pixel in meno (grosso guadagno di fill
// rate) con SMAA che copre gli edge → qualità quasi identica.
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// OTTIMIZZAZIONE CHIAVE: la shadow map della luna ridisegna TUTTI i ~250 caster ogni frame anche se
// solo zombi/giocatore si muovono. La aggiorniamo a FRAME ALTERNI (autoUpdate off + needsUpdate 1 sì
// 1 no nel loop): dimezza il costo d'ombra. Con ombre morbide notturne il ritardo di 1 frame sui
// caster in movimento è impercettibile. (Prewarm e warmPipeline settano needsUpdate a mano: ok.)
renderer.shadowMap.autoUpdate = false;
// ACES filmico: luminosità affidabile e calibrata (AgX a pari esposizione rendeva la notte quasi
// nera). Il "mood" cinematografico lo dà il GradeEffect (contrasto morbido + split-tone + grana),
// non il tone mapper. Exposure un filo più alta di prima per compensare il leggero scurimento del grade.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 320);
camera.position.set(0, CONFIG.camera.offsetY, CONFIG.camera.offsetZ);
camera.lookAt(0, 0, 0);

// ---- COLOR GRADE cinematografico (contrasto S, saturazione, split-tone teal/ambra, grana) ----
// Un solo Effect GLSL nel pipeline: dà al notturno un look "da film" — neri più profondi, ombre
// FREDDE, luci CALDE (lanterne/fuoco), micro-grana filmica. È la leva principale del "mood".
const GRADE_FRAG = `
uniform float contrast;
uniform float saturation;
uniform float lift;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float tintStrength;
uniform float grain;
uniform float gtime;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  c = (c - 0.5) * contrast + 0.5;                              // contrasto attorno al grigio medio
  c += lift * (1.0 - c);                                        // LIFT dei neri: alza le ombre (più leggibile) senza toccare le luci
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, saturation), 0.0);                    // saturazione
  vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.0, 0.62, l)); // split-tone
  c *= mix(vec3(1.0), tint, tintStrength);
  float n = fract(sin(dot(uv * vec2(1213.0, 3971.0) + gtime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * grain;                                       // grana filmica animata
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}`;
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      uniforms: new Map([
        ['contrast', new THREE.Uniform(1.05)],   // alleggerito (era 1.09): meno schiacciamento delle ombre → più leggibile
        ['saturation', new THREE.Uniform(1.16)], // più colore: contro lo "scolorito"
        ['lift', new THREE.Uniform(0.016)],      // ombre alzate un filo di più (era 0.012), senza slavare le luci
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(0.92, 0.98, 1.08))], // ombre fredde
        ['highlightTint', new THREE.Uniform(new THREE.Vector3(1.08, 1.02, 0.9))], // alte luci calde
        ['tintStrength', new THREE.Uniform(0.26)],
        ['grain', new THREE.Uniform(0.011)],
        ['gtime', new THREE.Uniform(0)],
      ]),
    });
  }
}
const gradeEffect = new GradeEffect();

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
// AMBIENT OCCLUSION (N8AO): ancoraggio visivo di alberi/lapidi/props al terreno — il contatto
// scuro che il solo shading PBR non dà. Va tra il RenderPass e gli effetti (è un Pass, non un
// Effect: nessun conflitto con la regola bloom/CA in EffectPass separati). halfRes = economico.
const n8ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
n8ao.configuration.aoRadius = 1.4;
n8ao.configuration.intensity = 1.8; // alleggerito (era 2.6): l'AO ancora al terreno ma non schiaccia più le ombre in nero
n8ao.configuration.distanceFalloff = 3.0;
n8ao.configuration.halfRes = true;
n8ao.setQualityMode('Low'); // rAF-friendly: la scena è notturna, l'AO serve al contatto non al dettaglio
composer.addPass(n8ao);
// Bloom e aberrazione cromatica sono entrambi effetti di convoluzione:
// devono stare in EffectPass separati.
composer.addPass(new EffectPass(
  camera,
  new SMAAEffect(),
  new BloomEffect({ intensity: 0.72, luminanceThreshold: 0.45, luminanceSmoothing: 0.28, mipmapBlur: true }),
));
// pass finale: aberrazione (convoluzione) + GRADE cinematografico + vignettatura
composer.addPass(new EffectPass(
  camera,
  new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0007, 0.0007), radialModulation: true, modulationOffset: 0.4 }),
  gradeEffect,
  new VignetteEffect({ darkness: 0.18, offset: 0.5 }), // LEGGERA (era 0.3/0.42): incornicia appena, senza scurire la periferia
));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ============================ TORCIA (tasto F) ============================
// SpotLight ULTRA-REALISTICA: cono con penombra morbida, decadimento fisico e OMBRE (il fascio è
// occluso da zombi/alberi/props → realismo vero). Creata QUI, UNA volta, con castShadow: entra nel
// conteggio luci PRIMA che i materiali compilino → accenderla/spegnerla NON ricompila nulla (si
// modula solo l'intensità, vedi trappola PointLight in CLAUDE.md). L'ombra si aggiorna SOLO da accesa
// (`shadow.autoUpdate`) → zero costo da spenta (WebGLShadowMap salta le luci con autoUpdate false).
// distanza lunga + decadimento basso (1.0) + cono stretto = portata VERA lontano; penombra media.
const flashlight = new THREE.SpotLight(0xf4f1e4, 0, 70, 0.42, 0.35, 1.0);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.5;
flashlight.shadow.camera.far = 70;
flashlight.shadow.bias = -0.0006;
flashlight.shadow.normalBias = 0.02;
flashlight.shadow.autoUpdate = false;  // acceso → true; un render iniziale (needsUpdate) alloca la map
flashlight.shadow.needsUpdate = true;
flashlight.position.set(0, 3, 0); flashlight.target.position.set(0, 0, 0); // direzione valida (no degenere)
scene.add(flashlight, flashlight.target);
// FASCIO volumetrico: cono additivo con dissolvenza fresnel, visibile solo da accesa → si vede la
// "colonna di luce" nel pulviscolo/nebbia. Apice sull'origine, si estende lungo -Y (orientato in update).
const FLASH_BEAM_LEN = 22;
const flashBeamGeo = new THREE.ConeGeometry(FLASH_BEAM_LEN * Math.tan(0.42) * 0.85, FLASH_BEAM_LEN, 28, 1, true);
flashBeamGeo.translate(0, -FLASH_BEAM_LEN / 2, 0);
const flashBeamMat = new THREE.ShaderMaterial({
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  uniforms: { uColor: { value: new THREE.Color(0xf6f2e2) }, uInt: { value: 0.16 } },
  vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'uniform vec3 uColor; uniform float uInt; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float fr = abs(dot(normalize(vN),normalize(vV))); float a = uInt * pow(fr,1.5) * vH * (1.0 - vH) * 4.0; gl_FragColor = vec4(uColor*a, a); }',
});
const flashBeam = new THREE.Mesh(flashBeamGeo, flashBeamMat);
flashBeam.visible = false; flashBeam.renderOrder = 5; flashBeam.frustumCulled = false;
scene.add(flashBeam);
let flashOn = false;
const _flashDir = new THREE.Vector3(), _negY = new THREE.Vector3(0, -1, 0);
function setFlashlight(on) {
  flashOn = on;
  flashlight.intensity = on ? 22 : 0;
  flashlight.shadow.autoUpdate = on;
  flashBeam.visible = on;
}
function updateFlashlight() {
  if (!flashOn || !game.player) return;
  if (game.viewMode === 'fps') {
    const cp = Math.cos(game.fpsPitch);
    _flashDir.set(Math.sin(game.fpsYaw) * cp, Math.sin(game.fpsPitch), Math.cos(game.fpsYaw) * cp).normalize();
    // origine 1.8 m DAVANTI all'occhio (oltre l'arma): l'arma resta DIETRO la sorgente → non viene
    // illuminata, e il cono punta avanti verso dove guardi.
    flashlight.position.copy(camera.position).addScaledVector(_flashDir, 1.8);
  } else {
    _flashDir.copy(aimPoint).sub(game.player.pos); _flashDir.y = 0;
    _flashDir.normalize().setY(-0.4).normalize(); // punta verso il terreno del cursore
    flashlight.position.set(game.player.pos.x, 1.5, game.player.pos.z).addScaledVector(_flashDir, 1.2);
  }
  flashlight.target.position.copy(flashlight.position).addScaledVector(_flashDir, 35);
  flashlight.target.updateMatrixWorld();
  flashBeam.position.copy(flashlight.position);
  flashBeam.quaternion.setFromUnitVectors(_negY, _flashDir);
}

// Illuminazione IBL da mappa HDRI notturna reale (PolyHaven CC0, cobblestone_street_night):
// scene.environment = riflessi/ambiente PBR sui materiali (armi/auto/asfalto), scene.background =
// la città notturna attorno. Le intensità tengono il mood scuro senza lavare via il nero.
async function loadEnvironment(onProgress) {
  try {
    const tex = await new RGBELoader().loadAsync(
      // 1k invece di 2k: l'IBL è comunque prefiltrato dal PMREM (sfocato per rugosità) → qualità
      // identica ma ~1.7 MB invece di ~7 MB, caricamento molto più veloce.
      'assets/hdri/cobblestone_street_night_1k.hdr',
      (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
    );
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(tex).texture; // IBL prefiltrato
    scene.environmentIntensity = 0.44;      // IBL notturno un po' più presente = fill ambientale della luna
    scene.environmentRotation = new THREE.Euler(0, 2.4, 0); // orienta le luci della via
    // NB: l'HDRI serve SOLO all'illuminazione (IBL). Come SFONDO NON si usa: i suoi palazzi
    // fotografici stonano con l'arte del gioco e la sua zona più chiara "abbagliava". Lo sfondo
    // resta un cielo notturno pulito (cupola a gradiente + luna + stelle, vedi world.js).
    pmrem.dispose();
    tex.dispose(); // l'equirect grezzo non serve più (il PMREM è già generato)
  } catch (e) { /* fallback: resta la tinta scura impostata in world.js */ }
  if (onProgress) onProgress(1);
}

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
  _burnFxT: 0,      // throttle del feedback "bruciatura" del falò
  coopRole: null,   // 'host' | 'client' in co-op, null in singolo
  worldSeed: 0,     // seed del mondo (condiviso in co-op)
  stats: { shots: 0, hits: 0, kills: 0, time: 0 },
  colliders: [],

  playerPos() { return this.player.pos; },
  damagePlayer(dmg, fromPos) { this.player.takeDamage(dmg, fromPos); },
  // CO-OP: ganci usati da player.js (sparo), enemies.js (danno puppet) e coop.js (HUD dall'host)
  onLocalShot(muzzle, dir, def) { if (Coop.active) Coop.sendShot(muzzle, dir, def); },
  coopReportHit(id, dmg, opts) { if (Coop.active && Coop.isClient()) Coop.reportHit(id, dmg, opts); },
  coopApplyHud(m) {
    this.score = m.sc; this.souls = m.so;
    ui.score(m.sc); ui.souls(m.so); ui.enemies(m.rem);
    if (this._netWave !== m.w) { this._netWave = m.w; this.wave = m.w; ui.wave(m.w, waveTheme(m.w).name); }
  },

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
    // momento CALMO: carica in sottofondo la prossima arma pesante (parse sincrono) qui, non a inizio
    // partita/combattimento → niente più freeze quando spawnano i primi zombi.
    loadGunForIntermission();
  },

  // Il giocatore ha impugnato un'arma il cui modello non è ancora pronto (vede il ripiego "a
  // scatola" makeRifle): carica QUELL'arma subito, con priorità, e rimonta il modello vero appena
  // arriva. Chiamata da player.switchTo quando _usingFallbackGun resta true dopo il mount.
  requestGun(id) { loadGunForIntermission(id); },

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
    // se lo sfondo è l'HDRI (Texture) non lo si tinge: solo la nebbia porta il tema dell'ondata
    if (scene.background && scene.background.isColor) scene.background.setHex(0x05070f).lerp(tint, 0.03);
    this._baseFog = scene.fog.color.clone();
    this._baseBg = (scene.background && scene.background.isColor) ? scene.background.clone() : null;
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
    if (this.coopRole === 'host') Net.send({ t: 'over' }); // in co-op l'host chiude la partita anche per il client
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
    // CO-OP: solo l'HOST avvia le ondate (le trasmette al client). In singolo, come sempre.
    if (!this.coopRole || this.coopRole === 'host') setTimeout(() => { if (this.state === 'playing' && this.wave === 0) this.startWave(1); }, 2400);
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
  // Gli asset riempiono la barra fino a 0.9: l'ultimo 10% resta alle fasi post-asset (mondo, warm,
  // nemici, shader) così la barra CONTINUA a muoversi invece di inchiodarsi al 100% mentre lavora.
  let mp = 0, ap = 0, ep = 0;
  const bar = (label) => ui.loading((mp + ap + ep) / 3 * 0.9, label);
  await Promise.all([
    loadAssets((f, label) => { mp = f; bar(label); }),
    Audio.loadFiles((f) => { ap = f; bar(); }),
    loadEnvironment((f) => { ep = f; bar('Cielo notturno…'); }),
  ]);
  T.assets = performance.now() - T.t0;

  ui.loading(0.9, 'Costruzione del cimitero…');
  await paint();
  game.effects = new Effects(scene);
  // seed del mondo (co-op: l'host lo comunica al client, che ricostruisce lo STESSO bosco).
  game.worldSeed = (Math.random() * 0x7fffffff) | 0;
  { const restore = seedRandom(game.worldSeed); game.world = buildWorld(scene); restore(); }
  game.colliders = game.world.colliders;
  setConfine(game.world.confine); // l'area giocabile è l'unione delle stanze attive
  // luce del BOSS nel POOL, creata QUI al build (intensità 0, la accende l'Enemy del boss):
  // crearla a runtime allo spawn forzava la ricompilazione di TUTTI i materiali → freeze di
  // parecchi secondi all'inizio di ogni round boss (vedi trappola PointLight in CLAUDE.md).
  game.bossLight = new THREE.PointLight(0xffffff, 0, 14, 1.8);
  scene.add(game.bossLight);
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
  ui.loading(0.90, 'Preparazione scena…');
  await warmPipeline();                   // mondo + postprocessing + ombre + texture (visibile)
  ui.loading(0.93, 'Caricamento nemici…');
  await deferredP;
  ui.loading(0.95, 'Caricamento armi…');
  await loadAllGuns();                    // pompa/mitra/magnum (viewmodel pesanti): PARSE QUI nella barra, non in gioco
  await prewarmShaders();                 // scalda TUTTI i modelli — nemici E armi (0.95→1)
  T.ready = performance.now() - T.t0;

  ui.readyToPlay(best0);
  setDiffEnabled(true); // la difficoltà è scegliibile solo a risorse caricate
  Audio.loadDeferred(); // musica in sottofondo: non influisce sul rendering, può arrivare dopo
  // pelli variate dei non morti (texture con noise bake, vedi assets.makeSkinVariantsAll): generate
  // in sottofondo un canvas per volta — finché non sono pronte gli zombi usano la texture originale.
  makeSkinVariantsAll();

  // NB: le armi pesanti (pompa/mitra/magnum: viewmodel FPS COMPLETI) sono caricate SOPRA con
  // loadAllGuns() DURANTE la barra → quando appare il menu sono già pronte (niente ripiego "a scatola"
  // al primo equip, niente freeze di caricamento in live). loadGunForIntermission/requestGun restano
  // solo come RETE DI SICUREZZA se una non fosse caricata (errore di rete durante la barra).
})();

// Carica (PARSE) tutte le armi pesanti differite DURANTE la barra di caricamento, una per volta con un
// paint() prima di ciascuna così l'etichetta si aggiorna. Il parse del GLB è un blocco sincrono di
// secondi: farlo QUI (fase di caricamento) invece che in gioco evita SIA il ripiego "a scatola" al
// primo equip SIA il freeze da caricamento in live. prewarmShaders() (subito dopo) ne scalda gli shader
// insieme agli altri modelli (un modello per frame → la barra non si inchioda).
async function loadAllGuns() {
  for (;;) {
    await paint();                       // cede il thread: barra/etichetta ridisegnate prima del parse sincrono
    const name = await loadNextBackgroundGun();
    if (!name) break;                    // tutte caricate (o tutte in errore: le riprende il backstop in gioco)
  }
}

// RETE DI SICUREZZA (le armi ora si caricano nella barra, vedi loadAllGuns): ricarica una eventuale
// arma rimasta indietro (errore durante la barra) negli intermezzi tra le ondate o on-demand al cambio
// arma. Il parse è un blocco sincrono di secondi → normalmente NON gira mai (tutto già caricato).
let _gunLoadBusy = false;
async function loadGunForIntermission(preferred) {
  if (_gunLoadBusy) return;
  _gunLoadBusy = true;
  try {
    for (;;) {
      const p = game.player;
      // priorità: l'arma-SCATOLA in mano (ripiego makeRifle, se il giocatore ne tiene una), sennò
      // quella richiesta on-demand, sennò la prossima in coda.
      const boxed = p && p._usingFallbackGun && !Assets.guns.has(p.current) ? p.current : null;
      const name = await loadNextBackgroundGun(boxed || preferred);
      if (!name) break; // niente più da caricare (o tutte in errore)
      const g = Assets.guns.get(name);
      if (p && p._usingFallbackGun && p.current === name && g) p._mountGun(name); // sostituisci la scatola col modello vero
      if (g && g.scene) await prewarmOne(g.scene);
      // se il giocatore NON tiene più una scatola, fermati qui: le altre armi si caricano al
      // prossimo intermezzo (momento calmo). Se invece ne tiene ancora una, continua a caricarla.
      if (!p || !p._usingFallbackGun || Assets.guns.has(p.current)) break;
      await new Promise((r) => setTimeout(r, 250)); // respiro tra un parse pesante e l'altro
    }
  } finally { _gunLoadBusy = false; }
}

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
//    della shadow map). Un UNICO render di tutti i modelli insieme bloccava il main thread per ~1-2s
//    -> la barra "si inchiodava" su «Compilazione shader…». Lo spezziamo UN MODELLO PER FRAME: un
//    solo modello visibile a turno, un render fuori schermo, e cedo il thread (paint) tra uno e
//    l'altro -> la barra avanza (0.95→1) e la schermata NON si blocca.
const _warmRT = new THREE.WebGLRenderTarget(8, 8);
const _prewarmed = new Set();
async function prewarmShaders(silent = false) {
  if (!game.player) return;
  if (window.__loadTimes) window.__loadTimes.prewarmRunning = true;
  const temps = [];
  const add = (s) => { if (s && !s.parent && !_prewarmed.has(s)) { _prewarmed.add(s); s.visible = false; scene.add(s); temps.push(s); } };
  add(Assets.player?.scene);
  for (const c of Assets.characters.values()) add(c.scene);
  for (const g of Assets.guns.values()) add(g.scene);

  // 1) PROGRAMMA PRINCIPALE: compilazione parallela mentre i modelli restano invisibili.
  if (temps.length) { try { await renderer.compileAsync(scene, camera); } catch { /* best effort */ } }

  // 2) PROGRAMMA D'OMBRA, un modello per frame. L'arma in mano (gunMount, invisibile nel menu) la
  //    scaldo per ultima così anche il suo depth program è pronto: niente scatto al via.
  const gm = game.player.gunMount, gmVis = gm?.visible;
  const list = [...temps];
  if (gm) list.push(gm);
  for (let i = 0; i < list.length; i++) {
    const s = list[i], was = s.visible;
    s.visible = true;
    const prev = renderer.getRenderTarget();
    try {
      renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(_warmRT);
      renderer.render(scene, camera);
    } catch { /* best effort */ }
    finally {
      renderer.setRenderTarget(prev);
      s.visible = (s === gm) ? gmVis : was; // durante il loop i temp restano nascosti, gm torna com'era
    }
    if (!silent) ui.loading(0.95 + 0.05 * ((i + 1) / list.length), 'Compilazione shader…');
    await paint(); // cede il thread: la barra si ridisegna, niente freeze
  }

  // Le scene sorgente sono usate come STAMPO: player/nemici/armi si clonano da qui (skeletonClone) e
  // il clone eredita il `.visible` della radice. Vanno lasciate VISIBILI, sennò le armi montate DOPO
  // (es. reload → _mountGun al PLAY) escono invisibili. Le tolgo dalla scena: erano solo temp.
  for (const s of temps) { s.visible = true; scene.remove(s); }
  if (window.__loadTimes) { window.__loadTimes.prewarmRunning = false; window.__loadTimes.prewarmDone = performance.now() - window.__loadTimes.t0; }
}

// Scalda gli shader di UNA scena (programma principale via compileAsync + programma d'ombra con un
// render fuori schermo). Usata per le armi caricate in sottofondo DOPO il menu: chiamata UNA per
// volta con pause tra l'una e l'altra → il compile del depth program (blocco sincrono) non "inchioda"
// il menu (prima le scaldavo tutte in blocco e la schermata restava ferma/non cliccabile un attimo).
async function prewarmOne(s) {
  if (!game.player || !s || _prewarmed.has(s)) return;
  _prewarmed.add(s);
  s.visible = false; scene.add(s);
  try { await renderer.compileAsync(scene, camera); } catch { /* best effort */ }
  s.visible = true;
  const prev = renderer.getRenderTarget();
  try { renderer.shadowMap.needsUpdate = true; renderer.setRenderTarget(_warmRT); renderer.render(scene, camera); }
  catch { /* best effort */ }
  finally { renderer.setRenderTarget(prev); }
  s.visible = true; scene.remove(s); // stampo: resta visibile (i cloni ne ereditano il .visible)
  await paint();
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
  // chiude l'eventuale sessione co-op e ripristina il menu co-op
  Coop.stop();
  game.coopRole = null;
  Net.reset();
  ui.el.btnPlay.textContent = 'GIOCA';
  ui.el.btnPlay.style.opacity = ''; ui.el.btnPlay.style.pointerEvents = '';
  ui.el.coopHost.classList.add('hidden'); ui.el.coopJoin.classList.add('hidden');
  ui.el.btnHost.classList.remove('active'); ui.el.btnJoinToggle.classList.remove('active');
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

ui.el.btnPlay.addEventListener('click', () => onPlayClicked());
ui.el.btnRestart.addEventListener('click', () => game.startRun());

// Ricostruisce il mondo del CLIENT col seed dell'host (co-op) → stesso bosco/collider su entrambi.
function rebuildWorld(seed) {
  try {
    if (game.world && game.world.dispose) game.world.dispose();
    const restore = seedRandom(seed);
    game.world = buildWorld(scene);
    restore();
    game.worldSeed = seed;
    game.colliders = game.world.colliders;
    setConfine(game.world.confine);
  } catch (e) { console.error('rebuildWorld', e); }
}

// Avvio della partita co-op (per entrambi i lati). Il client ricostruisce il mondo col seed dell'host.
function startCoopRun(role, seed, diff) {
  game.coopRole = role;
  if (role === 'client') {
    if (diff) applyDifficulty(diff);
    if (seed != null && seed !== game.worldSeed) rebuildWorld(seed);
  }
  Coop.start(game, role);
  game.startRun();
}

function onPlayClicked() {
  if (Net.active() && Net.connected) {
    if (Net.isHost()) { // l'OSPITE avvia la partita per entrambi
      const diff = localStorage.getItem('noh_diff') || 'normale';
      Net.send({ t: 'start', seed: game.worldSeed, diff });
      startCoopRun('host');
    } // il client non avvia: aspetta l'host
  } else {
    game.startRun();
  }
}

// ====================== CO-OP: ospita / entra in una stanza (P2P) ======================
// LIVELLO 1 — connessione: OSPITA genera un codice, ENTRA lo usa → i due browser si collegano in
// WebRTC. Provalo con due finestre. La sincronizzazione di mondo/giocatori/orda è il livello 2+.
function coopSetHostStatus(msg, cls) { ui.el.coopHostStatus.textContent = msg; ui.el.coopHostStatus.className = 'coop-status' + (cls ? ' ' + cls : ''); }
function coopSetJoinStatus(msg, cls) { ui.el.coopJoinStatus.textContent = msg; ui.el.coopJoinStatus.className = 'coop-status' + (cls ? ' ' + cls : ''); }

ui.el.btnHost.addEventListener('click', () => {
  ui.el.btnHost.classList.add('active'); ui.el.btnJoinToggle.classList.remove('active');
  ui.el.coopJoin.classList.add('hidden'); ui.el.coopHost.classList.remove('hidden');
  ui.el.coopCode.textContent = '·····'; coopSetHostStatus('Creazione stanza…');
  Net.host();
});
ui.el.btnJoinToggle.addEventListener('click', () => {
  ui.el.btnJoinToggle.classList.add('active'); ui.el.btnHost.classList.remove('active');
  ui.el.coopHost.classList.add('hidden'); ui.el.coopJoin.classList.remove('hidden');
  coopSetJoinStatus(''); ui.el.coopInput.focus();
});
ui.el.coopCode.addEventListener('click', () => {
  const c = ui.el.coopCode.textContent.trim();
  if (c && c !== '·····') { navigator.clipboard?.writeText(c).then(() => coopSetHostStatus('Codice copiato! In attesa dell\'amico…')); }
});
ui.el.btnJoinGo.addEventListener('click', () => {
  const code = ui.el.coopInput.value.trim().toUpperCase();
  if (code.length < 5) { coopSetJoinStatus('Codice incompleto', 'err'); return; }
  coopSetJoinStatus('Connessione a ' + code + '…');
  Net.join(code);
});
ui.el.coopInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.el.btnJoinGo.click(); });

Net.on('ready', (code) => { ui.el.coopCode.textContent = code; coopSetHostStatus('In attesa dell\'amico…'); });
Net.on('connect', () => {
  // canale dati aperto su entrambi i lati: la stanza funziona.
  const s = 'CONNESSO ✓ — ' + (Net.isHost() ? "l'amico è entrato" : 'sei nella stanza');
  coopSetHostStatus(s, 'ok'); coopSetJoinStatus(s, 'ok');
  if (Net.isHost()) { ui.el.btnPlay.textContent = 'AVVIA CO-OP'; }
  else { ui.el.btnPlay.textContent = 'IN ATTESA DELL\'HOST…'; ui.el.btnPlay.style.opacity = '0.5'; ui.el.btnPlay.style.pointerEvents = 'none'; }
  Net.send({ t: 'hello', role: Net.role });
});
Net.onMessage('hello', () => { /* handshake ok */ });
// il CLIENT riceve l'avvio dall'host → ricostruisce il mondo col seed e parte insieme
Net.onMessage('start', (m) => { startCoopRun('client', m.seed, m.diff); });
Net.on('disconnect', () => { coopSetHostStatus('Disconnesso', 'err'); coopSetJoinStatus('Disconnesso', 'err'); });
Net.on('error', (e) => {
  const msg = (e && e.type === 'peer-unavailable') ? 'Stanza non trovata (codice errato?)' : 'Errore di rete: ' + (e && e.type || 'sconosciuto');
  if (Net.isClient()) coopSetJoinStatus(msg, 'err'); else coopSetHostStatus(msg, 'err');
});
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
  if (!fps) camera.fov = 50;      // in top-down niente zoom ADS
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

// --- DEBUG TEMPORANEO (da rimuovere): K = +100 anime, J = fucile a pompa, L = mitra, M = magnum ---
addEventListener('keydown', (e) => {
  if (e.repeat || game.state !== 'playing' || !game.player) return;
  if (e.code === 'KeyK') { game.souls += 100; ui.souls(game.souls); ui.toast('+100 ANIME'); }
  else if (e.code === 'KeyJ') game.player.giveWeapon('shotgun');
  else if (e.code === 'KeyL') game.player.giveWeapon('smg');
  else if (e.code === 'KeyM') game.player.giveWeapon('magnum');
});

// --------------------------------------------------------------- loop ----

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const _projA = new THREE.Vector3(), _projB = new THREE.Vector3(); // proiezione dello spread a schermo

// --- Mirino 3D per la PRIMA PERSONA: invece di un overlay DOM sempre sopra al canvas, vive NELLA
// scena a distanza fissa davanti alla camera con depthTest attivo → l'ARMA (più vicina) lo OCCLUDE
// naturalmente: il mirino si vede "dietro" il fucile, non disegnato sopra. In top-down resta il
// mirino DOM sul cursore. Anello bianco-caldo a bordi morbidi (premium) + punto centrale, billboard
// (gli sprite guardano sempre la camera). Distanza scelta appena oltre l'arma e prima del mondo. ---
const CROSS3D_DIST = 2.4; // appena oltre l'arma (che così lo occlude), prima del mondo
const RING_FRAC = 52 / 64; // raggio dell'anello dentro la texture (per convertire px voluti -> scala sprite)
function _ringTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'); const m = 64, rad = 52;
  // contorno scuro: dà contrasto su qualsiasi fondo SENZA aggiungere luminosità (niente bloom)
  c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.arc(m, m, rad, 0, Math.PI * 2); c.stroke();
  // anello chiaro SOTTILE e tenue (valore basso → resta sotto la soglia di bloom: soft, non neon)
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(208,202,192,0.7)';
  c.beginPath(); c.arc(m, m, rad, 0, Math.PI * 2); c.stroke();
  return new THREE.CanvasTexture(cv);
}
function _dotTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,0.6)'; // bordino scuro per leggibilità
  c.beginPath(); c.arc(16, 16, 5, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(228,222,212,1)';
  c.beginPath(); c.arc(16, 16, 5, 0, Math.PI * 2); c.fill();
  return new THREE.CanvasTexture(cv);
}
const cross3dRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: _ringTexture(), transparent: true, depthTest: true, depthWrite: false, opacity: 0.62 }));
const cross3dDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: _dotTexture(), transparent: true, depthTest: true, depthWrite: false, opacity: 0.95 }));
cross3dRing.renderOrder = 20; cross3dDot.renderOrder = 21;
cross3dRing.visible = cross3dDot.visible = false;
scene.add(cross3dRing, cross3dDot);
const _camDir = new THREE.Vector3();
function _hide3dCross() { cross3dRing.visible = cross3dDot.visible = false; }

// Dimensiona il mirino circolare sulla proiezione REALE del cono di spread (base + rinculo): il
// cerchio coincide col cono in cui cadono i proiettili → ogni colpo resta DENTRO al mirino (FPS:
// cono circolare attorno allo sguardo; top-down: ventaglio a terra alla distanza del cursore). Il
// punto centrale (.dot) resta la mira esatta. GAIN=1 (cerchio = cono); il clamp inferiore tiene un
// minimo leggibile per le armi precisissime (magnum), quello superiore evita un anello assurdo a
// rinculo estremo. "Respira" col rinculo. FPS = proiezione angolare; top-down = raggio a terra.
const CROSS_GAIN = 1.0;
function updateCrosshairSize() {
  const p = game.player;
  if (!p || game.state !== 'playing') { _hide3dCross(); return; }
  const sp = p.currentSpread(); // rad
  const fovHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  let r;
  if (game.viewMode === 'fps') {
    r = (innerHeight / 2) * Math.tan(sp) / Math.tan(fovHalf);
  } else {
    const dx = aimPoint.x - p.pos.x, dz = aimPoint.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const gr = Math.max(0.15, d * Math.tan(sp)); // raggio di dispersione a terra
    const pxx = dz / d, pzz = -dx / d;            // perpendicolare unitaria in XZ
    _projA.copy(aimPoint).project(camera);
    _projB.set(aimPoint.x + pxx * gr, aimPoint.y, aimPoint.z + pzz * gr).project(camera);
    r = Math.hypot((_projB.x - _projA.x) * innerWidth / 2, (_projB.y - _projA.y) * innerHeight / 2);
  }
  const px = THREE.MathUtils.clamp(r * CROSS_GAIN, 5, innerHeight * 0.24); // raggio voluto a schermo

  if (game.viewMode === 'fps') {
    // mirino 3D davanti alla camera: l'arma (più vicina, depthTest) lo occlude.
    // In FPS si mostra SOLO il puntino: il cerchio dello spread è stato tolto su richiesta
    // (ingombrava la visuale); lo spread resta comunicato dal rinculo dell'arma.
    ui.el.crosshair.style.display = 'none'; // niente overlay DOM in prima persona
    camera.getWorldDirection(_camDir);
    cross3dDot.position.copy(camera.position).addScaledVector(_camDir, CROSS3D_DIST);
    const worldPerScreen = (2 * CROSS3D_DIST * Math.tan(fovHalf)) / innerHeight; // mondo per px schermo
    const dotSize = 9 * worldPerScreen; // punto centrale ~9px, dimensione fissa
    cross3dDot.scale.set(dotSize, dotSize, 1);
    cross3dRing.visible = false;
    cross3dDot.visible = true;
  } else {
    ui.el.crosshair.style.display = '';
    ui.crosshairSize(px);
    _hide3dCross();
  }
}
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const shake = new THREE.Vector3();
const _burnPos = new THREE.Vector3(); // posizione scintille di bruciatura del falò
let heartbeatT = 0;
let intensityT = 0;
let _shadowFrame = 0; // contatore per l'aggiornamento ombre a frame alterni
// atmosfera base (vedi world.js) e colore tempesta per il meteo
const BASE_FOG = 0.018, BASE_EXPO = 1.5; // exposure ACES (vedi toneMapping in cima al file)
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
  if (!playing && flashOn) setFlashlight(false); // torcia spenta fuori dalla partita
  if (playing && game.world) {
    const dt = rawDt * game.timeScale;
    game.stats.time += rawDt;
    if (input.wasPressed('KeyF') && game.state === 'playing') setFlashlight(!flashOn); // TORCIA on/off

    if (game.viewMode === 'fps') {
      // mouse-look: i delta del mouse ruotano lo sguardo (yaw + pitch). In MIRA (ADS) la sensibilità
      // cala per un puntamento più fine (coerente con lo zoom del FOV).
      const sens = 0.0022 * (1 - (game.player._ads || 0) * 0.45);
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
    // CO-OP: l'orda è host-autoritativa. L'HOST simula i nemici (e li trasmette); il CLIENT non
    // simula — li vede come "puppet" mossi dalla rete (Coop.update). In singolo, gira sempre.
    if (!game.coopRole || game.coopRole === 'host') game.director.update(dt);
    game.pickups.update(dt, game.player, t);
    game.effects.update(dt);
    game.world.update(dt, t, game.player.pos);
    Coop.update(dt); // sync stato proprio + avatar compagno + orda (host trasmette / client riceve)

    // FALÒ: se il giocatore ci cammina dentro, BRUCIA (danno continuo + scintille + tremore)
    if (game.world.fires.length && !game.player.dead) {
      const p = game.player.pos;
      let inFire = false;
      for (const f of game.world.fires) {
        const dx = p.x - f.x, dz = p.z - f.z;
        if (dx * dx + dz * dz < f.r * f.r) { inFire = true; break; }
      }
      if (inFire) {
        game.player.burn(26 * dt);
        game._burnFxT -= rawDt;
        if (game._burnFxT <= 0) {
          game._burnFxT = 0.32;
          game.effects.addTrauma(0.22);
          game.effects.sparks(_burnPos.set(p.x, 0.5, p.z), 6);
          ui.damageFlash();
          Audio.play('hurt', { vol: 0.4, pitchVar: 0.1 });
        }
      }
    }

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

    if (game.coopRole !== 'client') ui.enemies(game.director.remaining()); // il client usa il conteggio dell'host (coopApplyHud)

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
      // MIRA (ADS): zoom del FOV LIEVE (50° → 44°). Lo zoom ingrandisce anche l'arma, quindi in ADS
      // l'arma è già allontanata (VM.ads.fwd) per compensare: uno zoom eccessivo la farebbe riempire lo schermo.
      const wantFov = 50 - (game.player._ads || 0) * 6;
      if (Math.abs(camera.fov - wantFov) > 0.02) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
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
    // mirino dimensionato sullo spread, DOPO l'aggiornamento camera: il mirino 3D in prima persona
    // deve usare posizione/orientamento della camera del frame corrente (niente lag di un frame).
    updateCrosshairSize();
    updateFlashlight(); // la torcia segue occhio/mira DOPO la camera del frame corrente
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
    if (scene.background && scene.background.isColor) scene.background.copy(BG_BASE).lerp(STORM_COLOR, 0.4 * d);
  }

  gradeEffect.uniforms.get('gtime').value = (t * 60) % 1000; // grana filmica animata
  if ((_shadowFrame++ & 1) === 0) renderer.shadowMap.needsUpdate = true; // ombre a frame alterni (vedi setup)
  composer.render(rawDt);
  input.endFrame();
});
