// Tutte le costanti di bilanciamento e le definizioni di armi, nemici, ondate e boss.

export const CONFIG = {
  arenaRadius: 44,    // raggio del bosco fitto attorno all'hub
  hubRadius: 40,      // raggio dell'area giocabile dell'hub (room centrale)
  camera: { offsetY: 19.5, offsetZ: 14, lerp: 6.0, aimPull: 0.22 },
  player: {
    speed: 8.4, hp: 100, radius: 0.55,
    dashSpeed: 26, dashTime: 0.16, dashCooldown: 2.4, dashIFrames: 0.32, dashCharges: 2,
  },
  comboWindow: 4.0,
  intermission: 8,
  critChance: 0.12,
  critMult: 1.8,
  // COLPO ALLA TESTA: danno molto più alto + suono/numero dedicati. È GEOMETRICO — la testa è
  // una sfera in cima al nemico. In FPS scatta mirando davvero alla testa; in top-down (mira
  // auto-livellata) scatta col colpo ben CENTRATO sul bersaglio (precisione premiata).
  headshotMult: 2.6,
  headFrac: 0.9,   // altezza del centro-testa come frazione dell'altezza del nemico
  headRadius: 0.3, // raggio della sfera-testa in unità mondo (a nemico di taglia media)
};

// --- valuta "Anime": guadagnata uccidendo, spesa per aprire le porte (il punteggio
//     resta intatto per il record). I morti più pericolosi rendono più Anime. ---
export const SOULS = { perKill: 0.28, eliteMult: 3, bossBonus: 90 };
export function soulsFor(enemy) {
  if (enemy.boss) return Math.round((enemy.scoreValue * SOULS.perKill) + SOULS.bossBonus);
  return Math.max(1, Math.round(enemy.scoreValue * SOULS.perKill * (enemy.elite ? SOULS.eliteMult : 1)));
}

// --- Zone sbloccabili: hub centrale + 3 ambienti tematici dietro porte a pagamento.
//     angle = direzione dal centro; radius = ampiezza della stanza; cost = Anime per aprire;
//     tier = quanto pesa sulla difficoltà globale; il resto è atmosfera per-zona. ---
// FORESTA DELL'ORDA: l'hub è la RADURA del ranger (capanna+falò), le zone sono angoli del
// bosco dietro cancelli di legno. Gli `id` restano quelli storici (crypt/church/wood): ci
// sono agganciati contenuti di zona (world.ZONE_CONTENT), spawn e temi.
export const ZONES = [
  {
    id: 'crypt', name: 'IL CIMITERO', sub: 'I morti non riposano più',
    angle: -Math.PI / 2, radius: 21, cost: 300, tier: 1,
    fog: 0x060a12, fogDensity: 0.046, tint: 0x6f8ad0, ambient: 0x2a3550,
    ground: 'cemetery', lightColor: 0x8fb0ff,
  },
  {
    id: 'church', name: 'IL CAMPO BASE', sub: 'La quarantena è caduta',
    angle: Math.PI / 6, radius: 23, cost: 750, tier: 2,
    fog: 0x0c0a07, fogDensity: 0.038, tint: 0xffb060, ambient: 0x3a2a18,
    ground: 'camp', lightColor: 0xffae5a,
  },
  {
    id: 'wood', name: 'LA PALUDE', sub: "L'acqua nera non restituisce nulla",
    angle: (5 * Math.PI) / 6, radius: 26, cost: 1500, tier: 3,
    fog: 0x05100a, fogDensity: 0.058, tint: 0x86c070, ambient: 0x1e3018,
    ground: 'swamp', lightColor: 0x9fe080,
  },
];

// Scaling della difficoltà in base alle zone aperte (più stanze = più dura).
export function depthMods(zonesUnlocked) {
  const d = zonesUnlocked;
  return {
    hp: 1 + 0.28 * d,
    speed: 1 + 0.05 * d,
    dmg: 1 + 0.16 * d,
    maxAlive: 1 + 0.4 * d,
    spawn: Math.max(0.45, 1 - 0.14 * d), // intervallo di spawn più corto
    count: 1 + 0.22 * d,                 // più nemici per ondata
  };
}

// Livelli di difficoltà. Oltre a HP/velocità/danno dei nemici e densità di spawn,
// modulano fortemente il DASH (cariche, ricarica, finestra di invulnerabilità):
// più si sale, più schivare diventa una risorsa preziosa e da dosare con cura.
export const DIFFICULTIES = {
  facile: {
    key: 'facile', label: 'FACILE', desc: 'Una passeggiata tra le tombe',
    enemyHp: 0.75, enemySpeed: 0.9, enemyDmg: 0.6, spawnInterval: 1.25, maxAlive: 0.8, playerHp: 130,
    dashCharges: 3, dashCooldown: 1.6, dashIFrames: 0.42,
  },
  normale: {
    key: 'normale', label: 'NORMALE', desc: "L'esperienza bilanciata",
    enemyHp: 1.0, enemySpeed: 1.0, enemyDmg: 1.0, spawnInterval: 1.0, maxAlive: 1.0, playerHp: 100,
    dashCharges: 2, dashCooldown: 2.6, dashIFrames: 0.3,
  },
  difficile: {
    key: 'difficile', label: 'DIFFICILE', desc: "L'orda non perdona",
    enemyHp: 1.45, enemySpeed: 1.12, enemyDmg: 1.5, spawnInterval: 0.78, maxAlive: 1.3, playerHp: 80,
    dashCharges: 2, dashCooldown: 3.4, dashIFrames: 0.2,
  },
  incubo: {
    key: 'incubo', label: 'INCUBO', desc: 'Sopravvivere è quasi impossibile',
    enemyHp: 1.9, enemySpeed: 1.3, enemyDmg: 2.0, spawnInterval: 0.6, maxAlive: 1.55, playerHp: 65,
    dashCharges: 1, dashCooldown: 4.2, dashIFrames: 0.15,
  },
};

// Difficoltà attiva (default Normale); applicata da setDifficulty().
export let DIFF = DIFFICULTIES.normale;

export function setDifficulty(key) {
  DIFF = DIFFICULTIES[key] || DIFFICULTIES.normale;
  // i parametri del giocatore (vita + dash) sono letti da player.js a runtime
  CONFIG.player.hp = DIFF.playerHp;
  CONFIG.player.dashCharges = DIFF.dashCharges;
  CONFIG.player.dashCooldown = DIFF.dashCooldown;
  CONFIG.player.dashIFrames = DIFF.dashIFrames;
  return DIFF;
}

export const WEAPONS = {
  // tracer/light: toni caldi reali (ottone incandescente / bianco-caldo), non plasma colorato.
  // spread = cono di precisione base (gradi); bloom = gradi aggiunti a ogni colpo (rinculo) che
  // poi rientrano: il mirino circolare è dimensionato sullo spread EFFETTIVO (base+bloom) e i
  // proiettili partono in quel cono → cadono sempre dentro al cerchio.
  // reload = ricarica "fast/tactical" (cambio caricatore col colpo in canna); reloadFull = a
  // caricatore VUOTO (clip autorale con sblocco del carrello, un filo più lunga). Le durate sono
  // scelte vicine alla velocità autorale delle clip dei viewmodel (vedi assets.js MANIFEST.guns).
  // spread base VOLUTAMENTE BASSO (il primo colpo, a rinculo rientrato, segue fedele il mirino);
  // il bloom si ACCUMULA a ogni colpo e rientra piano (vedi player: decadimento + tetto) → chi
  // martella prima che il rinculo si assesti spara sempre più largo (fuori dal cerchio del mirino).
  pistol: { // Springfield XD (clip autorali: Reload_easy 1.3s / Reload_full 1.6s → velocità 1:1)
    id: 'pistol', slot: 1, name: 'PISTOLA', dmg: 14, rof: 0.21, mag: 12, reload: 1.3, reloadFull: 1.6,
    spread: 0.32, bloom: 1.7, speed: 150, pellets: 1, pierce: 0, reserve: Infinity, auto: false,
    knock: 1.6, tracer: 0xffd49a, shake: 0.07, light: 0xfff0c8,
  },
  shotgun: {
    id: 'shotgun', slot: 2, name: 'FUCILE A POMPA', dmg: 9, rof: 0.85, mag: 6, reload: 3.4,
    spread: 5.0, bloom: 2.2, speed: 108, pellets: 7, pierce: 0, reserve: 30, maxReserve: 48, auto: false,
    knock: 5.0, tracer: 0xffc079, shake: 0.24, light: 0xffd29a,
    // ricarica a COLPO SINGOLO: un bossolo ogni shellTime secondi (+1 in canna), interrompibile
    // sparando (tieni quelli già caricati). Vedi player.startReload / _endShellReload. La clip di
    // ricarica è ESTESA a 6 inserimenti visibili (player._extendReloadClip, ~9.55s da ~6.8s); shellTime
    // è scelto così che mag*shellTime≈5.9s = quella clip a ~1.62× → STESSA velocità di gesto di prima.
    shellReload: true, shellTime: 0.98,
  },
  smg: { // MPA 30 SST (clip fast 3.95s / full 4.40s)
    id: 'smg', slot: 3, name: 'MITRA', dmg: 8, rof: 0.082, mag: 34, reload: 2.0, reloadFull: 2.5,
    spread: 0.7, bloom: 1.05, speed: 168, pellets: 1, pierce: 0, reserve: 160, maxReserve: 260, auto: true,
    knock: 1.0, tracer: 0xffe0a4, shake: 0.05, light: 0xfff0cc,
  },
  magnum: { // Revolver bumstrum (ricarica = finestra 0.9–7.35 della timeline "allanims", 6.45s)
    id: 'magnum', slot: 4, name: 'MAGNUM', dmg: 65, rof: 0.7, mag: 5, reload: 3.0,
    spread: 0.18, bloom: 3.2, speed: 195, pellets: 1, pierce: 3, reserve: 20, maxReserve: 35, auto: false,
    knock: 7.0, tracer: 0xfff1cc, shake: 0.2, light: 0xffe6c0,
    // suoni della ricarica IN FASE col gesto: un click per ogni proiettile nel tamburo + scatto di
    // chiusura. Tempi in secondi DI CLIP (misurati offline sui nodi bullet1..6/release del rig,
    // len = durata della finestra di ricarica); player.startReload li riscala su `reload`.
    // reload 3.0s (non più 2.1): 6 inserimenti udibili hanno bisogno di respiro per suonare veri.
    reloadEvents: { inserts: [1.24, 2.0, 2.78, 3.54, 4.3, 5.08], close: 5.85, len: 6.45 },
  },
};

// Tipi base di nemico. hitTime = momento (s) dell'animazione di attacco in cui
// infligge danno. models = varianti GLB (vedi assets.js); lateModels si aggiungono
// dall'ondata 6 per varietà (scheletri risvegliati).
export const ENEMY_TYPES = {
  // Orda REALISTICA coerente (libreria DanteGuy): ogni tipo = un modello dedicato dello stesso
  // stile horror. crawler = mezzo busto strisciante, brute = bestione con motosega, hound = cane.
  walker: {
    id: 'walker', hp: 32, speed: 2.3, dmg: 9, scale: 1.0, radius: 0.55,
    attackRange: 1.7, attackTime: 1.15, hitTime: 0.6, score: 10, stagger: 16, anim: 'walk',
    models: ['zombie_slow1'], animRef: 1.3, // infetto classico (clip Walk)
    // spawn RANDOM tra originale + 3 varianti pre-bakate (geometria+colore, vedi assets.makeGeoVariants)
    variants: 3,
    // morte: la clip "Death" dura ~4.8s (in piedi ~2s poi crolla) → salta l'inizio e accelera così
    // cade in ginocchio subito. "Death2" (0.63s) resta rapida di suo.
    deathStartFrac: 0.28, deathFit: 1.5,
  },
  runner: {
    id: 'runner', hp: 20, speed: 5.3, dmg: 7, scale: 0.98, radius: 0.5,
    attackRange: 1.6, attackTime: 1.0, hitTime: 0.5, score: 15, stagger: 14, anim: 'run',
    models: ['zombie_putrid'], animRef: 2.8, // emaciato scattante (camminata veloce, niente clip Run)
    deathStartFrac: 0.2, deathFit: 1.6,
  },
  crawler: {
    id: 'crawler', hp: 16, speed: 4.0, dmg: 6, scale: 1.0, radius: 0.45,
    attackRange: 1.4, attackTime: 0.9, hitTime: 0.45, score: 12, stagger: 10, anim: 'walk',
    models: ['zombie_crawler'], lowProfile: true, animRef: 2.3, // mezzo busto che si trascina
  },
  hound: {
    id: 'hound', hp: 26, speed: 6.4, dmg: 10, scale: 1.0, radius: 0.5,
    attackRange: 1.5, attackTime: 0.8, hitTime: 0.4, score: 20, stagger: 16, anim: 'run',
    models: ['dog'],
  },
  brute: {
    id: 'brute', hp: 155, speed: 1.9, dmg: 24, scale: 1.28, radius: 0.85,
    attackRange: 2.3, attackTime: 1.5, hitTime: 0.78, score: 40, stagger: 45, anim: 'run',
    models: ['zombie_chainsaw'], animRef: 2.4, // bestione con motosega: CARICA (clip Run)
    // ⚠ la clip Walk oscilla il busto di ~35° → sembra camminare di traverso; la clip Run resta
    // frontale (posa da carica) e va usata come locomozione (animRef alza il timeScale ~0.8×).
    noWeave: true, // tank pesante: niente ondeggio laterale (accentuava il "cammina di traverso")
    // morte: l'unica clip di morte è "Death Cutscene" (14.9s, la motosega lo decapita) → NON usarla,
    // crollo procedurale all'indietro (vedi enemies.die/dying).
    noDeathClip: true,
  },
  spitter: {
    id: 'spitter', hp: 38, speed: 2.7, dmg: 13, scale: 1.05, radius: 0.55,
    attackRange: 13, attackTime: 1.4, hitTime: 0.7, score: 25, stagger: 18, anim: 'walk',
    attackAnim: 'cast', models: ['zombie_putrid'], animRef: 1.4, // emaciato che "sputa" (clip Attack)
    ranged: true, keepDistance: 9.5, projectileSpeed: 11,
  },
};

// Tema estetico/di forza per ogni ondata. La veste visiva NON è più una ricolorazione piena:
// `skin` sceglie il SAPORE della pelle pre-lavorata (assets.SKIN_FLAVORS: rot/pale/char/gore,
// texture con noise bake) e `tint` resta solo come grade tenue (~25%) — vedi enemies.js.
export const WAVE_THEMES = [
  { name: 'I Risvegliati',  tint: 0xb9c2ad, emissive: 0x101010, glow: 0.0,  skin: 'pale' },
  { name: 'I Famelici',     tint: 0xaec07e, emissive: 0x223300, glow: 0.25, skin: 'rot' },
  { name: 'I Putrefatti',   tint: 0x86a468, emissive: 0x1d3a08, glow: 0.45, skin: 'rot' },
  { name: 'I Rabbiosi',     tint: 0xc89270, emissive: 0x3a1505, glow: 0.5,  skin: 'gore' },
  { name: 'Notte di Sangue',tint: 0xb56055, emissive: 0x400505, glow: 0.7,  skin: 'gore' },
  { name: 'Gli Striscianti',tint: 0x7e93b4, emissive: 0x0a1c3a, glow: 0.55, skin: 'pale' },
  { name: 'Gli Urlatori',   tint: 0xa890cc, emissive: 0x2a0a3a, glow: 0.6,  skin: 'pale' },
  { name: 'I Carbonizzati', tint: 0x6e6a70, emissive: 0x3a1200, glow: 0.85, skin: 'char' },
  { name: 'I Tossici',      tint: 0x8cc465, emissive: 0x1a4a00, glow: 0.9,  skin: 'rot' },
  { name: 'Luna Maledetta', tint: 0xd0b070, emissive: 0x4a3300, glow: 1.0,  skin: 'char' },
];

export const BOSSES = [
  {
    name: 'IL CARNEFICE', sub: 'Macellaio dell\'orda', baseType: 'brute', model: 'zombie_chainsaw',
    scale: 2.35, hp: 950, speed: 2.1, dmg: 32, radius: 1.5, score: 500,
    tint: 0xb04040, emissive: 0x550000, glow: 1.4, skin: 'gore', abilities: ['charge', 'slam'],
  },
  {
    name: "L'EVOCATORE", sub: 'Signore delle tombe', baseType: 'spitter', model: 'zombie_putrid',
    scale: 2.1, hp: 1500, speed: 2.5, dmg: 26, radius: 1.3, score: 900,
    tint: 0x70d060, emissive: 0x0a4a00, glow: 1.6, skin: 'rot', abilities: ['summon', 'barrage', 'slam'],
  },
  {
    name: 'IL DIVORATORE', sub: 'La fine di ogni cosa', baseType: 'brute', model: 'zombie_chainsaw',
    scale: 2.7, hp: 2300, speed: 2.3, dmg: 40, radius: 1.7, score: 1500,
    tint: 0x9050c0, emissive: 0x33005a, glow: 1.8, skin: 'char', abilities: ['charge', 'slam', 'summon', 'barrage'],
  },
];

export function isBossWave(n) { return n % 5 === 0; }

export function waveTheme(n) {
  return WAVE_THEMES[(n - 1) % WAVE_THEMES.length];
}

// Composizione di un'ondata: lista di tipi da generare + moltiplicatori di difficoltà.
export function waveComposition(n) {
  const hpMult = (1 + (n - 1) * 0.16 + Math.max(0, n - 10) * 0.08) * DIFF.enemyHp;
  const speedMult = Math.min(1 + (n - 1) * 0.022, 1.45) * DIFF.enemySpeed;
  const dmgMult = (1 + (n - 1) * 0.07) * DIFF.enemyDmg;
  const theme = waveTheme(n);

  const list = [];
  const push = (type, count) => { for (let i = 0; i < count; i++) list.push(type); };

  if (isBossWave(n)) {
    const bossIndex = Math.min(Math.floor(n / 5) - 1, BOSSES.length - 1) % BOSSES.length;
    const extraLoops = Math.max(0, Math.floor(n / 5) - BOSSES.length); // boss riciclati ma potenziati
    push('walker', 4 + n);
    push('runner', Math.floor(n / 2));
    return { list, theme, hpMult, speedMult, dmgMult, boss: { ...BOSSES[bossIndex], hpLoopMult: 1 + extraLoops * 0.6 } };
  }

  const total = Math.min(8 + Math.round(n * 2.4), 52);
  let runners = n >= 2 ? Math.round(total * Math.min(0.1 + n * 0.02, 0.3)) : 0;
  let crawlers = n >= 3 ? Math.round(total * 0.12) : 0;
  let hounds = n >= 8 ? Math.min(2 + Math.floor((n - 8) / 2), 6) : 0;
  let brutes = n >= 4 ? 1 + Math.floor((n - 4) / 2) : 0;
  let spitters = n >= 6 ? 1 + Math.floor((n - 6) / 2) : 0;
  brutes = Math.min(brutes, 6);
  spitters = Math.min(spitters, 7);
  const walkers = Math.max(3, total - runners - crawlers - hounds - brutes - spitters);

  push('walker', walkers);
  push('runner', runners);
  push('crawler', crawlers);
  push('hound', hounds);
  push('brute', brutes);
  push('spitter', spitters);

  // mescola la coda di spawn
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  // quota di élite dall'ondata 7 in poi
  const eliteCount = n >= 7 ? Math.floor(list.length * 0.08) : 0;
  return { list, theme, hpMult, speedMult, dmgMult, boss: null, eliteCount };
}

// Sblocchi armi: alla prima ondata indicata, un nemico lascia cadere l'arma garantita.
export const WEAPON_UNLOCKS = { 3: 'shotgun', 6: 'smg', 9: 'magnum' };
