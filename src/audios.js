// Banco prova audio (pagina /audios): riproduce ogni suono attraverso il vero motore
// audio del gioco (Audio, stesso bus SFX + riverbero). Per i campioni multi-variante
// elenca ogni singolo file, così è possibile identificare con precisione quale non piace.
// Carica i file per NOME (non via Audio.loadFiles) per garantire l'abbinamento file<->pulsante.

import { Audio, AUDIO_MANIFEST } from './audio.js';

const listEl = document.getElementById('list');
const enableBtn = document.getElementById('enable');
const statusEl = document.getElementById('status');
const volEl = document.getElementById('vol');
const stopBtn = document.getElementById('stop');

const localBuffers = new Map(); // filename -> AudioBuffer
let loaded = false;
let lastLoopSrc = null;

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// Etichette leggibili per ciascuna chiave del manifest.
const LABELS = {
  shot_pistol: 'Sparo — Pistola',
  shot_shotgun: 'Sparo — Fucile a pompa',
  shot_smg: 'Sparo — Mitra',
  shot_magnum: 'Sparo — Magnum',
  reload_pistol: 'Ricarica — Pistola',
  reload_rifle: 'Ricarica — Mitra / Magnum',
  shotgun_pump: 'Pompa — Fucile a pompa',
  shotgun_insert: 'Inserimento bossolo — Fucile a pompa',
  step: 'Passo del giocatore',
  zombie_growl: 'Ringhio zombi',
  zombie_attack: 'Attacco zombi',
  zombie_death: 'Morte zombi',
  boss_roar: 'Ruggito del boss',
  slam: 'Schianto a terra (boss)',
  hit_flesh: 'Colpo a segno (carne)',
  zombie_hit: 'Impatto proiettile (random: splat + colpo)',
  crit: 'Colpo critico',
  splat: 'Splatter / gib',
  spit: 'Sputo (spitter)',
  dash: 'Scatto / dash',
  hurt: 'Danno al giocatore',
  weapon_pickup: 'Arma raccolta',
  pickup: 'Raccolta oggetto',
  thunder: 'Tuono / fulmine',
  rain_loop: 'Pioggia (loop)',
  click: 'Click / cambio arma',
  heartbeat: 'Battito (vita bassa)',
  wave_start: 'Inizio ondata (attuale: braam apocalittico)',
  wave_clear: 'Ondata completata (attuale: alba/risoluzione)',
  music_ambient: 'Musica ambient (loop)',
  cand_start_evilopen: 'Inizio — Evil Open (alt.)',
  cand_start_evilhit: 'Inizio — Evil Hit (alt.)',
  cand_start_braamhit: 'Inizio — Braam Hit (alt.)',
  cand_clear_hope: 'Fine — Hope / risoluzione (alt.)',
  cand_clear_bell: 'Fine — Campana (alt.)',
};

const LOOPING = new Set(['rain_loop', 'music_ambient']);

// Organizzazione in gruppi (chiavi del manifest, tutte file-backed).
const FILE_GROUPS = [
  { title: 'Armi — spari', keys: ['shot_pistol', 'shot_shotgun', 'shot_smg', 'shot_magnum'] },
  { title: 'Armi — ricariche', hint: 'Registrazioni reali CC0, corte.', keys: ['reload_pistol', 'reload_rifle', 'shotgun_pump', 'shotgun_insert'] },
  { title: 'Movimento', hint: 'Rimosso footstep_2; footstep_3 ammorbidito.', keys: ['step'] },
  { title: 'Zombi & boss', keys: ['zombie_growl', 'zombie_attack', 'zombie_death', 'boss_roar', 'slam'] },
  { title: 'Combattimento', hint: 'Impatti/foley reali CC0 (prima sintetizzati).', keys: ['zombie_hit', 'hit_flesh', 'crit', 'splat', 'spit', 'dash'] },
  { title: 'Giocatore', keys: ['hurt', 'weapon_pickup', 'pickup'] },
  { title: 'Meteo', keys: ['thunder', 'rain_loop'] },
  { title: 'UI & ondate', keys: ['click', 'heartbeat', 'wave_start', 'wave_clear'] },
  { title: 'Candidati ondate — provali e scegli', hint: 'Alternative per inizio/fine ondata. Dimmi quale preferisci e la imposto.',
    keys: ['cand_start_evilopen', 'cand_start_evilhit', 'cand_start_braamhit', 'cand_clear_hope', 'cand_clear_bell'] },
  { title: 'Musica', keys: ['music_ambient'] },
];

function litFeedback(btn) {
  btn.classList.add('lit');
  setTimeout(() => btn.classList.remove('lit'), 220);
}

function ensureReady() {
  if (loaded) return true;
  statusEl.textContent = '⚠ premi prima «ATTIVA AUDIO»';
  return false;
}

function playBuffer(f, loop = false) {
  if (!ensureReady()) return;
  const buf = localBuffers.get(f);
  if (!buf) { statusEl.textContent = `file mancante: ${f}`; return; }
  const c = Audio.ctx;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  const g = c.createGain();
  g.gain.value = 1;
  src.connect(g).connect(Audio.sfxBus);
  src.start();
  if (loop) { try { lastLoopSrc?.stop(); } catch {} lastLoopSrc = src; }
  statusEl.textContent = `▶ ${f}`;
}

// ----------------------------------------------------------------- render --

function fileRow(key) {
  const files = AUDIO_MANIFEST[key] || [];
  const row = el('div', 'row');
  const name = el('div', 'name');
  name.innerHTML = `${LABELS[key] || key}<small>chiave: ${key} · ${files.length} file</small>`;
  row.appendChild(name);
  const clips = el('div', 'clips');
  const loop = LOOPING.has(key);
  files.forEach((f, i) => {
    const b = el('button', 'clip');
    const lab = files.length > 1 ? String(i + 1) : '▶';
    b.innerHTML = `${lab}<span class="fn">${f}</span>`;
    b.onclick = () => { litFeedback(b); playBuffer(f, loop); };
    clips.appendChild(b);
  });
  row.appendChild(clips);
  return row;
}

function group(title, hint, tag) {
  const g = el('div', 'group');
  const h = el('h2');
  h.textContent = title;
  if (tag) {
    const t = el('span', `tag ${tag.cls}`);
    t.textContent = tag.text;
    h.appendChild(document.createTextNode(' '));
    h.appendChild(t);
  }
  g.appendChild(h);
  if (hint) { const hi = el('div', 'ghint'); hi.textContent = hint; g.appendChild(hi); }
  return g;
}

function render() {
  listEl.innerHTML = '';
  for (const grp of FILE_GROUPS) {
    const g = group(grp.title, grp.hint);
    for (const key of grp.keys) if (AUDIO_MANIFEST[key]) g.appendChild(fileRow(key));
    listEl.appendChild(g);
  }
}

// ------------------------------------------------------------------ load --

async function loadAll(onProgress) {
  // raccoglie ogni filename unico del manifest
  const files = new Set();
  for (const list of Object.values(AUDIO_MANIFEST)) for (const f of list) files.add(f);
  const all = [...files];
  let done = 0;
  await Promise.all(all.map(async (f) => {
    try {
      const res = await fetch('assets/audio/' + f);
      if (res.ok) localBuffers.set(f, await Audio.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* file assente: pulsante senza effetto */ }
    done++; onProgress(done / all.length);
  }));
}

// ---------------------------------------------------------------- eventi --

enableBtn.addEventListener('click', async () => {
  if (loaded) return;
  Audio.init();
  try { await Audio.ctx.resume(); } catch {}
  Audio.setMaster(volEl.value / 100);
  // bus musica spento: in questa pagina la musica si prova come SFX one-shot
  enableBtn.disabled = true;
  statusEl.textContent = 'caricamento campioni…';
  await loadAll((f) => { statusEl.textContent = `caricamento campioni… ${Math.round(f * 100)}%`; });
  loaded = true;
  enableBtn.disabled = false;
  enableBtn.classList.add('ready');
  enableBtn.textContent = '✓ AUDIO ATTIVO';
  statusEl.textContent = `${localBuffers.size} campioni pronti — clicca un suono`;
});

volEl.addEventListener('input', () => { Audio.setMaster(volEl.value / 100); });
stopBtn.addEventListener('click', () => { try { lastLoopSrc?.stop(); } catch {} lastLoopSrc = null; statusEl.textContent = 'loop fermato'; });

render(); // mostra subito la lista; i pulsanti chiedono di attivare l'audio se non pronto
