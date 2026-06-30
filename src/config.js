// Tutte le costanti di bilanciamento e le definizioni di armi, nemici, ondate e boss.

export const CONFIG = {
  arenaRadius: 34,    // raggio del recinto dell'hub (cimitero)
  hubRadius: 31,      // raggio dell'area giocabile dell'hub (room centrale)
  camera: { offsetY: 19.5, offsetZ: 14, lerp: 6.0, aimPull: 0.22 },
  player: {
    speed: 8.4, hp: 100, radius: 0.55,
    dashSpeed: 26, dashTime: 0.16, dashCooldown: 2.4, dashIFrames: 0.32, dashCharges: 2,
  },
  comboWindow: 4.0,
  intermission: 8,
  critChance: 0.12,
  critMult: 1.8,
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
export const ZONES = [
  {
    id: 'crypt', name: 'LA CRIPTA', sub: 'I sepolti senza nome',
    angle: -Math.PI / 2, radius: 18, cost: 300, tier: 1,
    fog: 0x05080e, fogDensity: 0.045, tint: 0x6f8ad0, ambient: 0x2a3550,
    ground: 'cobble', lightColor: 0x8fb0ff,
  },
  {
    id: 'church', name: 'LA CHIESA IN ROVINA', sub: 'Dove la fede è morta',
    angle: Math.PI / 6, radius: 20, cost: 750, tier: 2,
    fog: 0x0c0a07, fogDensity: 0.038, tint: 0xffb060, ambient: 0x3a2a18,
    ground: 'cobble', lightColor: 0xffae5a,
  },
  {
    id: 'wood', name: 'IL BOSCO DEGLI IMPICCATI', sub: 'Nessuno ne è mai uscito',
    angle: (5 * Math.PI) / 6, radius: 19, cost: 1500, tier: 3,
    fog: 0x060a06, fogDensity: 0.05, tint: 0x86c070, ambient: 0x1e3018,
    ground: 'forest', lightColor: 0x9fe080,
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
  pistol: {
    id: 'pistol', slot: 1, name: 'PISTOLA', dmg: 14, rof: 0.21, mag: 12, reload: 1.0,
    spread: 1.1, bloom: 1.2, speed: 96, pellets: 1, pierce: 0, reserve: Infinity, auto: false,
    knock: 1.6, tracer: 0xffd49a, shake: 0.07, light: 0xfff0c8,
  },
  shotgun: {
    id: 'shotgun', slot: 2, name: 'FUCILE A POMPA', dmg: 9, rof: 0.85, mag: 6, reload: 3.4,
    spread: 5.2, bloom: 2.2, speed: 70, pellets: 7, pierce: 0, reserve: 30, maxReserve: 48, auto: false,
    knock: 5.0, tracer: 0xffc079, shake: 0.24, light: 0xffd29a,
    // ricarica a COLPO SINGOLO: un bossolo ogni shellTime secondi (+1 in canna), interrompibile
    // sparando (tieni quelli già caricati). Vedi player.startReload / _endShellReload. shellTime alto
    // (cadenza lenta) perché la clip di ricarica (6.8s, ~6 inserimenti) non venga compressa troppo:
    // a 0.7s i 6 bossoli (mag*shellTime≈4.2s, clip ~1.6×) sono TUTTI visibili e i click distinti.
    shellReload: true, shellTime: 0.7,
  },
  smg: {
    id: 'smg', slot: 3, name: 'MITRA', dmg: 8, rof: 0.082, mag: 34, reload: 1.6,
    spread: 2.6, bloom: 0.9, speed: 104, pellets: 1, pierce: 0, reserve: 160, maxReserve: 260, auto: true,
    knock: 1.0, tracer: 0xffe0a4, shake: 0.05, light: 0xfff0cc,
  },
  magnum: {
    id: 'magnum', slot: 4, name: 'MAGNUM', dmg: 65, rof: 0.7, mag: 5, reload: 1.9,
    spread: 0.45, bloom: 3.2, speed: 120, pellets: 1, pierce: 3, reserve: 20, maxReserve: 35, auto: false,
    knock: 7.0, tracer: 0xfff1cc, shake: 0.2, light: 0xffe6c0,
  },
};

// Tipi base di nemico. hitTime = momento (s) dell'animazione di attacco in cui
// infligge danno. models = varianti GLB (vedi assets.js); lateModels si aggiungono
// dall'ondata 6 per varietà (scheletri risvegliati).
export const ENEMY_TYPES = {
  walker: {
    id: 'walker', hp: 32, speed: 2.3, dmg: 9, scale: 1.0, radius: 0.55,
    attackRange: 1.7, attackTime: 1.15, hitTime: 0.55, score: 10, stagger: 16, anim: 'walk',
    // Aiden = zombie realistico emaciato (idle/walk/attack); Hazmat e scheletri come varianti tardive.
    models: ['zombie_aiden'], lateModels: ['zombie_hazmat', 'skeleton_a', 'skeleton_c'], animRef: 1.2,
  },
  runner: {
    id: 'runner', hp: 20, speed: 5.3, dmg: 7, scale: 0.92, radius: 0.5,
    attackRange: 1.6, attackTime: 0.9, hitTime: 0.42, score: 15, stagger: 14, anim: 'run',
    models: ['zombie_larnox'], animRef: 4.0, // Larnox: corsa/attacchi/morte/urlo veri
  },
  crawler: {
    id: 'crawler', hp: 16, speed: 4.3, dmg: 6, scale: 1.0, radius: 0.45,
    attackRange: 1.4, attackTime: 0.8, hitTime: 0.4, score: 12, stagger: 10, anim: 'run',
    models: ['wolf', 'zombie_d'], lowProfile: true, animRef: 4.0, // cane/lupo che carica (ex strisciante)
  },
  hound: {
    id: 'hound', hp: 26, speed: 6.4, dmg: 10, scale: 1.0, radius: 0.5,
    attackRange: 1.5, attackTime: 0.8, hitTime: 0.4, score: 20, stagger: 16, anim: 'run',
    models: ['dog'],
  },
  brute: {
    id: 'brute', hp: 155, speed: 1.75, dmg: 24, scale: 1.5, radius: 0.85,
    attackRange: 2.3, attackTime: 1.5, hitTime: 0.78, score: 40, stagger: 45, anim: 'walk',
    models: ['mutant', 'zombie_c'], animRef: 2.8, // Mutant realistico (corsa pesante rallentata)
  },
  spitter: {
    id: 'spitter', hp: 38, speed: 2.7, dmg: 13, scale: 1.05, radius: 0.55,
    attackRange: 13, attackTime: 1.4, hitTime: 0.7, score: 25, stagger: 18, anim: 'walk',
    attackAnim: 'cast', models: ['skeleton_b'],
    ranged: true, keepDistance: 9.5, projectileSpeed: 11,
  },
};

// Tema estetico/di forza per ogni ondata: i non morti cambiano colore, occhi e potenza.
export const WAVE_THEMES = [
  { name: 'I Risvegliati',  tint: 0xb9c2ad, emissive: 0x101010, glow: 0.0 },
  { name: 'I Famelici',     tint: 0xaec07e, emissive: 0x223300, glow: 0.25 },
  { name: 'I Putrefatti',   tint: 0x86a468, emissive: 0x1d3a08, glow: 0.45 },
  { name: 'I Rabbiosi',     tint: 0xc89270, emissive: 0x3a1505, glow: 0.5 },
  { name: 'Notte di Sangue',tint: 0xb56055, emissive: 0x400505, glow: 0.7 },
  { name: 'Gli Striscianti',tint: 0x7e93b4, emissive: 0x0a1c3a, glow: 0.55 },
  { name: 'Gli Urlatori',   tint: 0xa890cc, emissive: 0x2a0a3a, glow: 0.6 },
  { name: 'I Carbonizzati', tint: 0x6e6a70, emissive: 0x3a1200, glow: 0.85 },
  { name: 'I Tossici',      tint: 0x8cc465, emissive: 0x1a4a00, glow: 0.9 },
  { name: 'Luna Maledetta', tint: 0xd0b070, emissive: 0x4a3300, glow: 1.0 },
];

export const BOSSES = [
  {
    name: 'IL CARNEFICE', sub: 'Macellaio dell\'orda', baseType: 'brute', model: 'mutant',
    scale: 2.35, hp: 950, speed: 2.1, dmg: 32, radius: 1.5, score: 500,
    tint: 0xb04040, emissive: 0x550000, glow: 1.4, abilities: ['charge', 'slam'],
  },
  {
    name: "L'EVOCATORE", sub: 'Signore delle tombe', baseType: 'spitter', model: 'skeleton_b',
    scale: 2.1, hp: 1500, speed: 2.5, dmg: 26, radius: 1.3, score: 900,
    tint: 0x70d060, emissive: 0x0a4a00, glow: 1.6, abilities: ['summon', 'barrage', 'slam'],
  },
  {
    name: 'IL DIVORATORE', sub: 'La fine di ogni cosa', baseType: 'brute', model: 'mutant',
    scale: 2.7, hp: 2300, speed: 2.3, dmg: 40, radius: 1.7, score: 1500,
    tint: 0x9050c0, emissive: 0x33005a, glow: 1.8, abilities: ['charge', 'slam', 'summon', 'barrage'],
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
