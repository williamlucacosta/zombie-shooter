// Visualizzatore modelli (pagina /models): carica ogni GLB/GLTF in una scena three.js
// con ambiente PBR + ombre, lo normalizza (altezza ~1.8, piedi a terra, centrato),
// riproduce le sue clip di animazione e mostra fonte/licenza/triangoli/animazioni.
// Serve a valutare i candidati per ogni nemico e per il player.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Modelli ATTUALMENTE usati in gioco (baseline di confronto).
const CURRENT = [
  { label: 'Sam — sopravvissuto', url: 'assets/models/player.glb', role: 'Player', source: 'Quaternius · Post-Apocalypse', license: 'CC0' },
  { label: 'Zombie A', url: 'assets/models/zombie_a.glb', role: 'Walker / Runner', source: 'Quaternius', license: 'CC0' },
  { label: 'Zombie B', url: 'assets/models/zombie_b.glb', role: 'Walker / Runner', source: 'Quaternius', license: 'CC0' },
  { label: 'Zombie C — Big Arm', url: 'assets/models/zombie_c.glb', role: 'Brute / Boss', source: 'Quaternius', license: 'CC0' },
  { label: 'Zombie D — strisciante', url: 'assets/models/zombie_d.glb', role: 'Crawler', source: 'Quaternius', license: 'CC0' },
  { label: 'Dog', url: 'assets/models/dog.glb', role: 'Hound', source: 'Quaternius', license: 'CC0' },
  { label: 'Skeleton A', url: 'assets/models/skeleton_a.glb', role: 'Walker tardo', source: 'KayKit', license: 'CC0' },
  { label: 'Skeleton B', url: 'assets/models/skeleton_b.glb', role: 'Spitter / Boss', source: 'KayKit', license: 'CC0' },
  { label: 'Skeleton C', url: 'assets/models/skeleton_c.glb', role: 'Walker tardo', source: 'KayKit', license: 'CC0' },
];

// Candidati NUOVI trovati dagli agent (popolato man mano). url relativo a public/.
const CANDIDATES = [
  // --- Player ---
  { label: 'Soldier ★ (Quaternius)', url: 'assets/models/_candidates/player/q_soldier.glb', role: 'Player', source: 'Quaternius · poly.pizza', license: 'CC-BY' },
  { label: 'Soldier realistico (three.js / Mixamo Vanguard)', url: 'assets/models/_candidates/player/soldier_threejs.glb', role: 'Player', source: 'three.js · Mixamo', license: 'MIT / Mixamo' },
  { label: 'Knight (KayKit)', url: 'assets/models/_candidates/player/kaykit_knight.glb', role: 'Player', source: 'KayKit Adventurers', license: 'CC0' },
  { label: 'Barbarian (KayKit)', url: 'assets/models/_candidates/player/kaykit_barbarian.glb', role: 'Player', source: 'KayKit Adventurers', license: 'CC0' },
  { label: 'Rogue incappucciato (KayKit)', url: 'assets/models/_candidates/player/kaykit_rogue_hooded.glb', role: 'Player · sopravvissuto', source: 'KayKit Adventurers', license: 'CC0' },
  // --- Zombi ---
  { label: 'Zombie Hazmat ★ (PBR realistico, +corsa retargetata)', url: 'assets/models/zombie_hazmat.glb', role: 'Walker / Runner', source: 'Sketchfab · LxNazarov', license: 'CC-BY 4.0' },
  { label: 'Mutant ★ brute/boss (13 anim, crepe luminescenti)', url: 'assets/models/mutant/a.glb', role: 'Brute / Boss', source: 'Mixamo (repo MIT) + texture creatura', license: 'Mixamo' },
  { label: 'SF · Zombie Aiden (idle/walk/attack)', url: 'assets/models/sf/zombie_aiden.glb', role: 'Walker', source: 'Sketchfab · Aiden Studios', license: 'CC-BY' },
  { label: 'SF · Zombie Larnox ★ (9 anim: walk/run/attack/death/scream)', url: 'assets/models/sf/zombie_larnox.glb', role: 'Walker / Runner', source: 'Sketchfab · Larnox', license: 'CC-BY-NC' },
  { label: 'SF · Wolf (creep/run/walk) ★ crawler', url: 'assets/models/sf/wolf_3dhaupt.glb', role: 'Crawler / Hound', source: 'Sketchfab · 3DHaupt', license: 'CC-BY-NC' },
  // --- Scheletri ---
  { label: 'Skeleton ★ (con Spawn)', url: 'assets/models/_candidates/skeletons_hound/skel_quaternius_spawn.glb', role: 'Spitter / Walker tardo', source: 'Quaternius', license: 'CC0' },
  { label: 'Skeleton spadaccino', url: 'assets/models/_candidates/skeletons_hound/skel_quaternius_sword.glb', role: 'Skeleton', source: 'Quaternius', license: 'CC0' },
  // --- Hound ---
  { label: 'Wolf ★ (più feroce del cane)', url: 'assets/models/_candidates/skeletons_hound/hound_wolf.glb', role: 'Hound', source: 'Quaternius', license: 'CC0' },
  { label: 'Husky (hound spettrale)', url: 'assets/models/_candidates/skeletons_hound/hound_husky.glb', role: 'Hound', source: 'Quaternius', license: 'CC0' },
];

// ----------------------------------------------------------------- scena --

const viewport = document.getElementById('viewport');
const loadingEl = document.getElementById('loading');
const infoName = document.querySelector('#info .name');
const infoMeta = document.querySelector('#info .meta');
const bottomEl = document.getElementById('bottom');
const listEl = document.getElementById('list');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0810);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(2.4, 1.5, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.6;
controls.minDistance = 1;
controls.maxDistance = 14;

// ambiente PBR per materiali realistici
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// luci
const hemi = new THREE.HemisphereLight(0xbfd2ff, 0x20140a, 0.7);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
key.position.set(3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5; key.shadow.camera.far = 25;
key.shadow.camera.left = -3; key.shadow.camera.right = 3;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0xff7a4a, 0.8);
rim.position.set(-4, 3, -3);
scene.add(rim);

// terreno: disco scuro che riceve l'ombra + griglia di riferimento
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(12, 24, 0x3a3450, 0x221f30);
grid.position.y = 0.001;
scene.add(grid);

// ------------------------------------------------------------- caricamento --

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder); // alcuni candidati usano EXT_meshopt_compression
const clock = new THREE.Clock();
let mixer = null;
let current = null;     // root del modello in scena
let currentClips = [];
let activeAction = null;
let activeBtn = null;

const stripArmature = (n) => n.split('|').pop();

function disposeCurrent() {
  if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); mixer = null; }
  if (current) {
    scene.remove(current);
    current.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
          m.dispose();
        }
      }
    });
    current = null;
  }
  currentClips = []; activeAction = null; activeBtn = null;
  bottomEl.innerHTML = '';
}

function countTris(root) {
  let tris = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
    }
  });
  return Math.round(tris);
}

function frameModel() {
  // i modelli sono già normalizzati ad altezza ~1.8 con i piedi a y=0
  controls.target.set(0, 0.95, 0);
  camera.position.set(2.4, 1.45, 3.2);
  controls.update();
}

function playClip(clip, btn) {
  if (!mixer) return;
  const action = mixer.clipAction(clip);
  if (activeAction && activeAction !== action) {
    action.reset(); action.crossFadeFrom(activeAction, 0.25, false); action.play();
  } else { action.reset().play(); }
  activeAction = action;
  if (activeBtn) activeBtn.classList.remove('active');
  if (btn) { btn.classList.add('active'); activeBtn = btn; }
}

function buildAnimButtons() {
  bottomEl.innerHTML = '';
  // dedup per nome base (Quaternius duplica "Idle" + "Armature|Idle")
  const seen = new Set();
  const clips = currentClips.filter((c) => { const b = stripArmature(c.name).toLowerCase(); if (seen.has(b)) return false; seen.add(b); return true; });
  if (!clips.length) {
    const span = document.createElement('span');
    span.className = 'anim'; span.style.opacity = '.6'; span.textContent = '⚠ nessuna animazione';
    bottomEl.appendChild(span);
  } else {
    // ordina mettendo idle/walk/run davanti
    const pri = (n) => { n = stripArmature(n).toLowerCase(); return /idle/.test(n) ? 0 : /walk/.test(n) ? 1 : /run/.test(n) ? 2 : 5; };
    clips.sort((a, b) => pri(a.name) - pri(b.name));
    clips.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'anim'; b.textContent = `▶ ${stripArmature(c.name)}`;
      b.onclick = () => playClip(c, b);
      bottomEl.appendChild(b);
      if (i === 0) playClip(c, b);
    });
  }
  // toggle auto-rotazione
  const t = document.createElement('button');
  t.className = 'toggle on'; t.textContent = '↻ auto-rotazione';
  t.onclick = () => { controls.autoRotate = !controls.autoRotate; t.classList.toggle('on', controls.autoRotate); };
  bottomEl.appendChild(t);
}

function showMeta(entry, extra) {
  infoName.textContent = entry.label;
  if (extra && extra.error) {
    infoMeta.innerHTML = `<span class="err">⚠ impossibile caricare: ${extra.error}</span><br>${entry.url}`;
    return;
  }
  const anims = extra.clips.map((c) => stripArmature(c.name));
  const seen = new Set(); const uniq = anims.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  infoMeta.innerHTML =
    `<b>Ruolo:</b> ${entry.role} &nbsp;·&nbsp; <b>Fonte:</b> ${entry.source} &nbsp;·&nbsp; <span class="lic">${entry.license}</span><br>` +
    `<b>${extra.tris.toLocaleString('it-IT')}</b> triangoli &nbsp;·&nbsp; <b>${uniq.length}</b> animazioni: ${uniq.join(', ') || '—'}`;
}

function loadModel(entry, btn) {
  for (const b of listEl.querySelectorAll('.m')) b.classList.remove('active');
  if (btn) btn.classList.add('active');
  loadingEl.style.display = 'flex';
  infoName.textContent = entry.label; infoMeta.textContent = 'caricamento…';
  loader.load(entry.url, (gltf) => {
    disposeCurrent();
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    // normalizza: altezza ~1.8, centrato su X/Z, piedi a y=0
    let box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = 1.8 / (size.y || 1);
    root.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
    scene.add(root);
    current = root;
    currentClips = gltf.animations || [];
    if (currentClips.length) mixer = new THREE.AnimationMixer(root);
    buildAnimButtons();
    showMeta(entry, { tris: countTris(root), clips: currentClips });
    frameModel();
    loadingEl.style.display = 'none';
  }, undefined, (err) => {
    loadingEl.style.display = 'none';
    showMeta(entry, { error: (err && err.message) || 'errore di rete/parsing' });
  });
}

// -------------------------------------------------------------- sidebar --

function modelButton(entry, isNew) {
  const b = document.createElement('button');
  b.className = 'm';
  b.innerHTML = `${entry.label}<span class="badge ${isNew ? 'new' : 'cur'}">${isNew ? 'NUOVO' : 'attuale'}</span>` +
    `<span class="role"><b>${entry.role}</b> · ${entry.source} · ${entry.license}</span>`;
  b.onclick = () => loadModel(entry, b);
  return b;
}

function buildSidebar() {
  listEl.innerHTML = '';
  if (CANDIDATES.length) {
    const h = document.createElement('div'); h.className = 'grp'; h.textContent = `Candidati nuovi (${CANDIDATES.length})`;
    listEl.appendChild(h);
    for (const e of CANDIDATES) listEl.appendChild(modelButton(e, true));
  } else {
    const h = document.createElement('div'); h.className = 'grp'; h.textContent = 'Candidati nuovi';
    listEl.appendChild(h);
    const note = document.createElement('div'); note.className = 'hint'; note.style.margin = '2px 0 8px';
    note.textContent = '⏳ in arrivo: gli agent stanno cercando modelli migliori…';
    listEl.appendChild(note);
  }
  const h2 = document.createElement('div'); h2.className = 'grp'; h2.textContent = 'Modelli attuali in gioco';
  listEl.appendChild(h2);
  for (const e of CURRENT) listEl.appendChild(modelButton(e, false));
}

// ----------------------------------------------------------------- loop --

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

buildSidebar();
resize();
// carica per primo il player come anteprima iniziale
loadModel(CURRENT[0], listEl.querySelectorAll('.m')[CANDIDATES.length ? CANDIDATES.length : 0]);
