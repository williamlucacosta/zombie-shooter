// Caricamento asset: modelli GLB (giocatore, zombi, oggetti di scena), texture
// e font. Ogni risorsa ha un fallback procedurale: il gioco funziona comunque.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Nomi canonici dei file: lo script tools/download-assets.ps1 salva con questi nomi.
// Personaggi: Quaternius Post-Apocalypse + KayKit Skeletons (CC0).
const MANIFEST = {
  player: { url: 'assets/models/player.glb', yaw: 0, height: 1.8 },
  characters: {
    zombie_a: { url: 'assets/models/zombie_a.glb', yaw: 0, height: 1.85 },
    zombie_b: { url: 'assets/models/zombie_b.glb', yaw: 0, height: 1.8 },
    zombie_c: { url: 'assets/models/zombie_c.glb', yaw: 0, height: 2.1 },  // Big Arm (mutante)
    zombie_d: { url: 'assets/models/zombie_d.glb', yaw: 0, height: 0.85 }, // strisciante senza gambe
    dog: { url: 'assets/models/dog.glb', yaw: 0, height: 0.95 },
    // Gli scheletri (4.8 MB l'uno) compaiono solo dall'ondata 6: caricati in
    // sottofondo per non rallentare l'avvio.
    skeleton_a: { url: 'assets/models/skeleton_a.glb', yaw: 0, height: 1.75, deferred: true },
    skeleton_b: { url: 'assets/models/skeleton_b.glb', yaw: 0, height: 1.75, deferred: true },
    skeleton_c: { url: 'assets/models/skeleton_c.glb', yaw: 0, height: 1.8, deferred: true },
  },
  guns: {
    pistol: { url: 'assets/models/gun_pistol.glb', length: 0.45 },
    shotgun: { url: 'assets/models/gun_shotgun.glb', length: 0.85 },
    smg: { url: 'assets/models/gun_rifle.glb', length: 0.85 },
    magnum: { url: 'assets/models/gun_rifle.glb', length: 0.85 },
  },
  props: {
    gravestone: { url: 'assets/models/gravestone.gltf', height: 1.1 },
    grave_A: { url: 'assets/models/grave_A.gltf', height: 0.8 },
    gravemarker_A: { url: 'assets/models/gravemarker_A.gltf', height: 1.0 },
    crypt: { url: 'assets/models/crypt.gltf', height: 3.6 },
    tree_dead_large: { url: 'assets/models/tree_dead_large.gltf', height: 5.2 },
    tree_dead_medium: { url: 'assets/models/tree_dead_medium.gltf', height: 4.0 },
    fence: { url: 'assets/models/fence.gltf', height: 1.1 },
    fence_broken: { url: 'assets/models/fence_broken.gltf', height: 1.1 },
    post_lantern: { url: 'assets/models/post_lantern.gltf', height: 3.0 },
    lantern_standing: { url: 'assets/models/lantern_standing.gltf', height: 0.7 },
    coffin: { url: 'assets/models/coffin.gltf', height: 0.7 },
    skull: { url: 'assets/models/skull.gltf', height: 0.3 },
    ribcage: { url: 'assets/models/ribcage.gltf', height: 0.5 },
    pumpkin: { url: 'assets/models/pumpkin_orange_jackolantern.gltf', height: 0.55 },
    shrine: { url: 'assets/models/shrine.gltf', height: 1.6 },
    bone_A: { url: 'assets/models/bone_A.gltf', height: 0.25 },
    barrel: { url: 'assets/models/barrel.glb', height: 1.0 },
    crate: { url: 'assets/models/crate.glb', height: 0.8 },
  },
  groundTexture: 'assets/textures/ground.jpg',
};

export const Assets = {
  player: null,          // { scene, animations, yaw, scale, footOffset }
  characters: new Map(), // nome -> idem
  guns: new Map(),       // nome -> { scene, length }
  props: new Map(),      // nome -> { scene, scale, footOffset }
  groundTexture: null,
};

function prepModel(gltf, targetHeight, yaw) {
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false; // i clip di animazione spostano i vertici fuori dal bbox di riposo
      if (o.material) {
        o.material.metalness = Math.min(o.material.metalness ?? 0, 0.4);
      }
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  const h = Math.max(box.max.y - box.min.y, 0.01);
  const scale = targetHeight / h;
  return {
    scene,
    animations: gltf.animations || [],
    yaw,
    scale,
    footOffset: -box.min.y * scale,
  };
}

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const tryGLB = (url) => new Promise((res) => loader.load(url, (g) => res(g), undefined, () => res(null)));
  const tryTex = (url) => new Promise((res) => texLoader.load(url, (t) => res(t), undefined, () => res(null)));

  const jobs = [];
  let done = 0, total = 0;
  const track = (p) => {
    total++;
    return p.then((r) => { done++; onProgress?.(done / total); return r; });
  };

  jobs.push(track(tryGLB(MANIFEST.player.url)).then((g) => {
    if (g) Assets.player = prepModel(g, MANIFEST.player.height, MANIFEST.player.yaw);
  }));
  for (const [name, z] of Object.entries(MANIFEST.characters)) {
    if (z.deferred) continue; // caricati dopo, in sottofondo
    jobs.push(track(tryGLB(z.url)).then((g) => {
      if (g) Assets.characters.set(name, prepModel(g, z.height, z.yaw));
    }));
  }
  for (const [name, def] of Object.entries(MANIFEST.guns)) {
    jobs.push(track(tryGLB(def.url)).then((g) => {
      if (g) {
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        Assets.guns.set(name, { scene: g.scene, length: def.length });
      }
    }));
  }
  for (const [name, def] of Object.entries(MANIFEST.props)) {
    jobs.push(track(tryGLB(def.url)).then((g) => {
      if (g) {
        const prepped = prepModel(g, def.height, 0);
        prepped.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
        Assets.props.set(name, prepped);
      }
    }));
  }
  jobs.push(track(tryTex(MANIFEST.groundTexture)).then((t) => {
    if (t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(14, 14);
      t.anisotropy = 4;
      Assets.groundTexture = t;
    }
  }));

  await Promise.all(jobs);

  if (!Assets.groundTexture) Assets.groundTexture = makeProceduralGroundTexture();
}

/** Carica in sottofondo i modelli pesanti non necessari all'avvio (scheletri). */
export async function loadDeferredAssets() {
  const loader = new GLTFLoader();
  const tryGLB = (url) => new Promise((res) => loader.load(url, (g) => res(g), undefined, () => res(null)));
  const jobs = [];
  for (const [name, z] of Object.entries(MANIFEST.characters)) {
    if (!z.deferred || Assets.characters.has(name)) continue;
    jobs.push(tryGLB(z.url).then((g) => {
      if (g) Assets.characters.set(name, prepModel(g, z.height, z.yaw));
    }));
  }
  await Promise.all(jobs);
}

/** Variante personaggio per nome, con catena di ripieghi; null = fallback procedurale. */
export function getCharacter(...names) {
  for (const n of names) {
    const c = Assets.characters.get(n);
    if (c) return c;
  }
  for (const c of Assets.characters.values()) return c;
  return null;
}

// ------------------------------------------------------------- fallbacks --

function makeProceduralGroundTexture() {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a241c';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const v = 30 + Math.random() * 28;
    const tint = Math.random();
    g.fillStyle = tint > 0.85
      ? `rgb(${v * 0.9 | 0},${v | 0},${v * 0.6 | 0})`   // ciuffi verdastri
      : `rgb(${v | 0},${v * 0.82 | 0},${v * 0.6 | 0})`; // terra
    g.globalAlpha = 0.25 + Math.random() * 0.4;
    const r = 1 + Math.random() * 3.5;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(10, 10);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Zombi procedurale articolato (fallback se nessun GLB è disponibile).
 * Le "ossa" sono gruppi nominati in userData.bones, animati a codice in enemies.js.
 */
export function makeProceduralZombie() {
  const skin = new THREE.MeshStandardMaterial({ color: 0x9aa37c, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3c3a45, roughness: 0.95 });
  const root = new THREE.Group();

  const torso = new THREE.Group();
  torso.position.y = 1.0;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), cloth);
  chest.position.y = 0.35;
  torso.add(chest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 0.92;
  torso.add(head);
  // occhi luminosi
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), eyeMat);
    eye.position.set(0.08 * sx, 0.95, 0.18);
    torso.add(eye);
  }

  const mkLimb = (mat, len, w) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2;
    pivot.add(m);
    return pivot;
  };
  const armL = mkLimb(skin, 0.62, 0.16); armL.position.set(-0.39, 0.62, 0);
  const armR = mkLimb(skin, 0.62, 0.16); armR.position.set(0.39, 0.62, 0);
  torso.add(armL, armR);

  const legL = mkLimb(cloth, 0.95, 0.2); legL.position.set(-0.17, 1.0, 0);
  const legR = mkLimb(cloth, 0.95, 0.2); legR.position.set(0.17, 1.0, 0);

  root.add(torso, legL, legR);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  root.userData.procedural = true;
  root.userData.bones = { torso, head, armL, armR, legL, legR, eyeMat };
  return root;
}

/** Fucile low-poly da attaccare al giocatore. */
export function makeRifle() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.45);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.22), wood);
  stock.position.set(0, -0.04, -0.38);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), wood);
  grip.position.set(0, -0.1, -0.05);
  g.add(body, barrel, stock, grip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Soldato procedurale (fallback giocatore). */
export function makeProceduralSoldier() {
  const uniform = new THREE.MeshStandardMaterial({ color: 0x44503e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a585, roughness: 0.85 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.8 });
  const root = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.32), uniform);
  torso.position.y = 1.32;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.38), gear);
  vest.position.y = 1.36;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
  head.position.y = 1.88;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.36), gear);
  helmet.position.y = 2.02;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.95, 0.2), uniform);
  legL.position.set(-0.16, 0.48, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), uniform);
  armL.position.set(-0.38, 1.35, 0.1);
  const armR = armL.clone(); armR.position.x = 0.38;
  root.add(torso, vest, head, helmet, legL, legR, armL, armR);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.procedural = true;
  return root;
}

// --------------------------------------------------------------- animator --

// I pattern sono provati in ordine sul nome del clip senza il prefisso
// dell'armatura ("CharacterArmature|Idle" -> "Idle"). Coprono i pacchetti
// Quaternius (Idle, Walk, Run, Punch, Death, HitReact, Idle_Gun…) e
// KayKit (Walking_A, Running_B, 1H_Melee_Attack_Chop, Death_A, Spellcast_Shoot…).
const PURPOSE_PATTERNS = {
  idle: [/^idle_gun$/i, /^idle$/i, /^idle_combat$/i, /^idle(?!_attack)/i, /idle/i],
  walk: [/^walk_gun$/i, /^walk$/i, /^walking_[abc]$/i, /walking/i, /^walk/i, /run/i],
  run: [/^run_gun$/i, /^run$/i, /^running_[ab]$/i, /running/i, /^run(?!_attack)/i, /walk/i],
  crawl: [/^crawl$/i, /crawl/i, /walk/i],
  attack: [/^punch$/i, /^attack$/i, /melee_attack/i, /^idle_attack$/i, /attack|punch|bite|slash|chop|stab|kick/i],
  cast: [/^spellcast_shoot$/i, /spellcast/i, /ranged_shoot/i, /^attack$/i, /attack|punch/i],
  death: [/^death$/i, /^death_[ab]$/i, /death/i, /die|dead/i],
  hit: [/^hitreact/i, /^hit_[ab]$/i, /hit/i],
  spawn: [/spawn_ground/i, /awaken_floor/i, /awaken/i],
};

const stripArmature = (name) => name.split('|').pop();

/** Avvolge AnimationMixer e trova i clip giusti per scopo, qualunque sia il pack. */
export class Animator {
  constructor(root, clips) {
    this.root = root;
    this.clips = clips || [];
    this.mixer = this.clips.length ? new THREE.AnimationMixer(root) : null;
    this.current = null;
    this.currentPurpose = null;
    this._cache = new Map();
  }

  _find(purpose) {
    if (this._cache.has(purpose)) return this._cache.get(purpose);
    let found = [];
    for (const re of PURPOSE_PATTERNS[purpose] || []) {
      found = this.clips.filter((c) => re.test(stripArmature(c.name)));
      if (found.length) break;
    }
    // dedup di clip duplicati ("Idle" + "CharacterArmature|Idle"): tieni un solo nome base
    if (found.length > 1) {
      const seen = new Set();
      found = found.filter((c) => {
        const base = stripArmature(c.name).toLowerCase();
        if (seen.has(base)) return false;
        seen.add(base);
        return true;
      });
    }
    this._cache.set(purpose, found);
    return found;
  }

  has(purpose) { return this.mixer && this._find(purpose).length > 0; }

  /**
   * Riproduce un clip per scopo. Ritorna la durata effettiva (s) o null.
   * opts: fade, once, timeScale
   */
  play(purpose, { fade = 0.22, once = false, timeScale = 1 } = {}) {
    if (!this.mixer) return null;
    const found = this._find(purpose);
    if (!found.length) return null;
    const clip = found[(Math.random() * found.length) | 0];
    const action = this.mixer.clipAction(clip);
    if (this.current && this.current !== action) {
      action.reset();
      action.crossFadeFrom(this.current, fade, false);
    } else {
      action.reset();
    }
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat);
    action.clampWhenFinished = once;
    action.timeScale = timeScale;
    action.play();
    this.current = action;
    this.currentPurpose = purpose;
    return clip.duration / Math.max(timeScale, 0.01);
  }

  update(dt) { this.mixer?.update(dt); }
}
