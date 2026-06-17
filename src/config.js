// Tutte le costanti di bilanciamento e le definizioni di armi, nemici, ondate e boss.

export const CONFIG = {
  arenaRadius: 34,
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

export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'PISTOLA', dmg: 14, rof: 0.21, mag: 12, reload: 1.0,
    spread: 1.6, speed: 72, pellets: 1, pierce: 0, reserve: Infinity, auto: false,
    knock: 1.6, tracer: 0x9fd8ff, shake: 0.07, light: 0xfff2c0,
  },
  shotgun: {
    id: 'shotgun', slot: 2, name: 'FUCILE A POMPA', dmg: 9, rof: 0.85, mag: 6, reload: 2.0,
    spread: 8.5, speed: 62, pellets: 7, pierce: 0, reserve: 30, maxReserve: 48, auto: false,
    knock: 5.0, tracer: 0xffc97a, shake: 0.24, light: 0xffd9a0,
  },
  smg: {
    id: 'smg', slot: 3, name: 'MITRA', dmg: 8, rof: 0.082, mag: 34, reload: 1.6,
    spread: 4.2, speed: 78, pellets: 1, pierce: 0, reserve: 160, maxReserve: 260, auto: true,
    knock: 1.0, tracer: 0xaaffc8, shake: 0.05, light: 0xd8ffe0,
  },
  magnum: {
    id: 'magnum', slot: 4, name: 'MAGNUM', dmg: 65, rof: 0.7, mag: 5, reload: 1.9,
    spread: 0.5, speed: 96, pellets: 1, pierce: 3, reserve: 20, maxReserve: 35, auto: false,
    knock: 7.0, tracer: 0xff8a7a, shake: 0.2, light: 0xffb0a0,
  },
};

// Tipi base di nemico. hitTime = momento (s) dell'animazione di attacco in cui
// infligge danno. models = varianti GLB (vedi assets.js); lateModels si aggiungono
// dall'ondata 6 per varietà (scheletri risvegliati).
export const ENEMY_TYPES = {
  walker: {
    id: 'walker', hp: 32, speed: 2.3, dmg: 9, scale: 1.0, radius: 0.55,
    attackRange: 1.7, attackTime: 1.15, hitTime: 0.55, score: 10, stagger: 16, anim: 'walk',
    models: ['zombie_a', 'zombie_b'], lateModels: ['skeleton_a', 'skeleton_c'],
  },
  runner: {
    id: 'runner', hp: 20, speed: 5.3, dmg: 7, scale: 0.92, radius: 0.5,
    attackRange: 1.6, attackTime: 0.9, hitTime: 0.42, score: 15, stagger: 14, anim: 'run',
    models: ['zombie_b', 'zombie_a'],
  },
  crawler: {
    id: 'crawler', hp: 16, speed: 4.3, dmg: 6, scale: 1.0, radius: 0.45,
    attackRange: 1.25, attackTime: 0.8, hitTime: 0.4, score: 12, stagger: 10, anim: 'crawl',
    models: ['zombie_d'], lowProfile: true,
  },
  hound: {
    id: 'hound', hp: 26, speed: 6.4, dmg: 10, scale: 1.0, radius: 0.5,
    attackRange: 1.5, attackTime: 0.8, hitTime: 0.4, score: 20, stagger: 16, anim: 'run',
    models: ['dog'],
  },
  brute: {
    id: 'brute', hp: 155, speed: 1.75, dmg: 24, scale: 1.5, radius: 0.85,
    attackRange: 2.3, attackTime: 1.5, hitTime: 0.78, score: 40, stagger: 45, anim: 'walk',
    models: ['zombie_c'],
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
    name: 'IL CARNEFICE', sub: 'Macellaio dell\'orda', baseType: 'brute', model: 'zombie_c',
    scale: 2.35, hp: 950, speed: 2.1, dmg: 32, radius: 1.5, score: 500,
    tint: 0xb04040, emissive: 0x550000, glow: 1.4, abilities: ['charge', 'slam'],
  },
  {
    name: "L'EVOCATORE", sub: 'Signore delle tombe', baseType: 'spitter', model: 'skeleton_b',
    scale: 2.1, hp: 1500, speed: 2.5, dmg: 26, radius: 1.3, score: 900,
    tint: 0x70d060, emissive: 0x0a4a00, glow: 1.6, abilities: ['summon', 'barrage', 'slam'],
  },
  {
    name: 'IL DIVORATORE', sub: 'La fine di ogni cosa', baseType: 'brute', model: 'zombie_c',
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
  const hpMult = 1 + (n - 1) * 0.16 + Math.max(0, n - 10) * 0.08;
  const speedMult = Math.min(1 + (n - 1) * 0.022, 1.45);
  const dmgMult = 1 + (n - 1) * 0.07;
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
