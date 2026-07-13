// Pagina dev /aim-position: calibra la posizione di braccia+arma (dai fianchi e in MIRA/ADS) per
// OGNI arma, in modo distinto. Riusa la CLASSE Player reale con un `game` fittizio → il viewmodel,
// la convergenza e la mira sono IDENTICI al gioco. Gli slider salvano in localStorage (noh_aim_<id>)
// → l'override si applica SUBITO anche in partita (player._mountGun legge la stessa chiave).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadAssets, loadBackgroundGuns, Assets } from './assets.js';
import { Player } from './player.js';

const WLIST = [
  { id: 'pistol', name: 'PISTOLA', key: '1' },
  { id: 'shotgun', name: 'POMPA', key: '2' },
  { id: 'smg', name: 'MITRA', key: '3' },
  { id: 'magnum', name: 'MAGNUM', key: '4' },
];

// ---- render ----
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c15);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x181206, 0.5));
const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.15); keyLight.position.set(0.6, 1.2, 1.4); scene.add(keyLight);
// pavimento tenue per riferimento
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshStandardMaterial({ color: 0x161320, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

// ---- stub game (solo ciò che serve al viewmodel) ----
const game = { scene, fpsYaw: 0, fpsPitch: 0, input: { lookDX: 0, lookDY: 0 } };

let player = null;
let mode = 'ads';          // 'hip' | 'ads'
let current = 'pistol';
const VMBASE = { x: 0.2, y: -0.19, fwd: 0.5 }; // = player.VM base (per convertire abs<->vmShift)

// stato per-arma: hip/ads = posizione (vmShift/adsPos); hipRot/adsRot = rotazione in GRADI {x,y,z}
const state = {};
function loadState(id) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('noh_aim_' + id) || 'null'); } catch { /* ignora */ }
  const gun = Assets.guns.get(id) || {};
  return {
    hip: (s && s.hip) || (gun.vmShift ? { ...gun.vmShift } : { x: 0, y: 0, z: 0 }),
    ads: (s && s.ads) || (gun.adsPos ? { ...gun.adsPos } : { ...player.VM.ads }),
    hipRot: (s && s.hipRot) || (gun.vmRot ? { ...gun.vmRot } : { x: 0, y: 0, z: 0 }),
    adsRot: (s && s.adsRot) || (gun.adsRot ? { ...gun.adsRot } : { x: 0, y: 0, z: 0 }),
  };
}
function saveState(id) {
  localStorage.setItem('noh_aim_' + id, JSON.stringify(state[id]));
}

// ---- UI ----
const $ = (id) => document.getElementById(id);
const sx = $('sx'), sy = $('sy'), sz = $('sz'), vx = $('vx'), vy = $('vy'), vz = $('vz'), out = $('out');
const srx = $('srx'), sry = $('sry'), srz = $('srz'), vrx = $('vrx'), vry = $('vry'), vrz = $('vrz');
const f2 = (n) => (n >= 0 ? ' ' : '') + n.toFixed(3);
const f1 = (n) => (n >= 0 ? ' ' : '') + n.toFixed(1);

function buildWeaponButtons() {
  const box = $('weapons');
  for (const w of WLIST) {
    const b = document.createElement('div');
    b.className = 'wbtn'; b.dataset.id = w.id;
    b.innerHTML = `${w.name}<small>tasto ${w.key}</small>`;
    b.onclick = () => selectWeapon(w.id);
    box.appendChild(b);
  }
}

// abs (posizione nel frame sguardo) <-> valori memorizzati
function absOf(id, m) {
  if (m === 'ads') { const a = state[id].ads; return { x: a.x, y: a.y, z: a.fwd }; }
  const h = state[id].hip; return { x: VMBASE.x + (h.x || 0), y: VMBASE.y + (h.y || 0), z: VMBASE.fwd + (h.z || 0) };
}
function setAbs(id, m, ax, ay, az) {
  if (m === 'ads') state[id].ads = { x: ax, y: ay, fwd: az };
  else state[id].hip = { x: ax - VMBASE.x, y: ay - VMBASE.y, z: az - VMBASE.fwd };
}

function applyToPlayer() {
  player._vmShift = state[current].hip;
  player._adsPos = state[current].ads;
  player._vmRot = state[current].hipRot;
  player._adsRot = state[current].adsRot;
}

function syncSliders() {
  const a = absOf(current, mode);
  sx.value = a.x; sy.value = a.y; sz.value = a.z;
  vx.textContent = f2(a.x); vy.textContent = f2(a.y); vz.textContent = f2(a.z);
  const r = mode === 'ads' ? state[current].adsRot : state[current].hipRot;
  srx.value = r.x; sry.value = r.y; srz.value = r.z;
  vrx.textContent = f1(r.x); vry.textContent = f1(r.y); vrz.textContent = f1(r.z);
}

function refreshOut() {
  const s = state[current];
  const h = s.hip, a = s.ads, hr = s.hipRot, ar = s.adsRot;
  out.textContent =
    `${current}\n` +
    `  vmShift: { x:${f2(h.x || 0)}, y:${f2(h.y || 0)}, z:${f2(h.z || 0)} }\n` +
    `  adsPos:  { x:${f2(a.x)}, y:${f2(a.y)}, fwd:${f2(a.fwd)} }\n` +
    `  vmRot:   { x:${f1(hr.x)}, y:${f1(hr.y)}, z:${f1(hr.z)} }\n` +
    `  adsRot:  { x:${f1(ar.x)}, y:${f1(ar.y)}, z:${f1(ar.z)} }`;
}

function selectWeapon(id) {
  current = id;
  for (const b of document.querySelectorAll('.wbtn')) b.classList.toggle('active', b.dataset.id === id);
  if (!state[id]) state[id] = loadState(id);
  player._mountGun(id); player.current = id; // monta il viewmodel (legge già l'override localStorage)
  applyToPlayer();
  syncSliders(); refreshOut();
}

function onSlider() {
  setAbs(current, mode, parseFloat(sx.value), parseFloat(sy.value), parseFloat(sz.value));
  vx.textContent = f2(parseFloat(sx.value)); vy.textContent = f2(parseFloat(sy.value)); vz.textContent = f2(parseFloat(sz.value));
  applyToPlayer(); saveState(current); refreshOut();
}
[sx, sy, sz].forEach((s) => s.addEventListener('input', onSlider));

function onRot() {
  const r = { x: parseFloat(srx.value), y: parseFloat(sry.value), z: parseFloat(srz.value) };
  if (mode === 'ads') state[current].adsRot = r; else state[current].hipRot = r;
  vrx.textContent = f1(r.x); vry.textContent = f1(r.y); vrz.textContent = f1(r.z);
  applyToPlayer(); saveState(current); refreshOut();
}
[srx, sry, srz].forEach((s) => s.addEventListener('input', onRot));

for (const m of document.querySelectorAll('.mode')) {
  m.onclick = () => {
    mode = m.dataset.mode;
    for (const x of document.querySelectorAll('.mode')) x.classList.toggle('active', x === m);
    syncSliders();
  };
}

$('reset').onclick = () => {
  localStorage.removeItem('noh_aim_' + current);
  state[current] = loadState(current); // torna ai default del MANIFEST
  applyToPlayer(); syncSliders(); refreshOut();
};
$('copy').onclick = async () => {
  const all = WLIST.map((w) => {
    const s = state[w.id] || loadState(w.id);
    return `${w.id}: vmShift {x:${f2(s.hip.x || 0)},y:${f2(s.hip.y || 0)},z:${f2(s.hip.z || 0)}}  adsPos {x:${f2(s.ads.x)},y:${f2(s.ads.y)},fwd:${f2(s.ads.fwd)}}`
      + `  vmRot {x:${f1(s.hipRot.x)},y:${f1(s.hipRot.y)},z:${f1(s.hipRot.z)}}  adsRot {x:${f1(s.adsRot.x)},y:${f1(s.adsRot.y)},z:${f1(s.adsRot.z)}}`;
  }).join('\n');
  try { await navigator.clipboard.writeText(all); $('copy').textContent = 'Copiato!'; setTimeout(() => ($('copy').textContent = 'Copia valori'), 1200); } catch { out.textContent = all; }
};

// ---- guardarsi attorno (drag) ----
let dragging = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  game.fpsYaw -= (e.clientX - lx) * 0.0035; lx = e.clientX;
  game.fpsPitch = THREE.MathUtils.clamp(game.fpsPitch - (e.clientY - ly) * 0.0035, -1.0, 0.7); ly = e.clientY;
});
addEventListener('keydown', (e) => {
  const w = WLIST.find((x) => x.key === e.key);
  if (w) selectWeapon(w.id);
});

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---- avvio ---- (IIFE async: il top-level await non passa il target di build es2020)
(async () => {
  await loadAssets(() => {});
  await loadBackgroundGuns(); // servono TUTTE le armi per calibrarle (nel gioco sono differite)
  player = new Player(game);
  player.setFpsView(true);
  player._ads = 1;
  $('loading').style.display = 'none';
  buildWeaponButtons();
  resize();
  selectWeapon('pistol');

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    player._ads = THREE.MathUtils.damp(player._ads, mode === 'ads' ? 1 : 0, 16, dt);
    player._gunMixer?.update(dt);      // idle loop dell'arma
    player.anim?.update(dt);           // (corpo nascosto, ma tiene vivo il mixer)
    player._updateGun(dt);             // posiziona il viewmodel come in gioco
    const cp = Math.cos(game.fpsPitch);
    camera.position.set(0, 1.62, 0);
    camera.lookAt(Math.sin(game.fpsYaw) * cp, 1.62 + Math.sin(game.fpsPitch), Math.cos(game.fpsYaw) * cp);
    renderer.render(scene, camera);
  });
})();
