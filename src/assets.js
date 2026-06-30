// Caricamento asset: modelli GLB (giocatore, zombi, oggetti di scena), texture
// e font. Ogni risorsa ha un fallback procedurale: il gioco funziona comunque.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Loader glTF con decoder meshopt registrato (lo zombie Hazmat usa EXT_meshopt_compression).
function makeLoader() {
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return l;
}

// Nomi canonici dei file: lo script tools/download-assets.ps1 salva con questi nomi.
// Personaggi: Quaternius Post-Apocalypse + KayKit Skeletons (CC0).
const MANIFEST = {
  // Soldato realistico (rig Mixamo "Vanguard", via three.js examples). Clip: Idle/Walk/Run.
  // yaw=π: il rig Mixamo guarda nel verso opposto a Quaternius, va girato per puntare la mira.
  player: { url: 'assets/models/player_soldier.glb', yaw: Math.PI, height: 1.85 },
  characters: {
    // SOLO il walker dell'ondata 1 (zombie_aiden) è eager: è l'unico nemico che può comparire nei
    // primi secondi. Tutti gli altri sono `deferred` (caricati in sottofondo dopo il menu): il primo
    // nemico spunta ≥2.4s dopo "GIOCA", quindi arrivano in tempo e non rallentano l'avvio.
    zombie_aiden: { url: 'assets/models/sf/zombie_aiden.glb', yaw: 0, height: 1.85, stripPos: true }, // emaciato/insanguinato (CC-BY)
    // Zombie Hazmat PBR realistico (rig Mixamo, EXT_meshopt). Solo lateModel (ondata 6+).
    zombie_hazmat: { url: 'assets/models/zombie_hazmat.glb', yaw: 0, height: 1.9, deferred: true },
    // Zombie realistici da Sketchfab (Download API). Hanno ROOT MOTION nelle clip di locomozione:
    // stripPos rimuove le tracce di posizione (l'IA controlla la posizione, sennò scivolano).
    zombie_larnox: { url: 'assets/models/sf/zombie_larnox.glb', yaw: 0, height: 1.8, stripPos: true, deferred: true }, // runner ondata 2+ (CC-BY-NC)
    zombie_a: { url: 'assets/models/zombie_a.glb', yaw: 0, height: 1.85, deferred: true },
    zombie_b: { url: 'assets/models/zombie_b.glb', yaw: 0, height: 1.8, deferred: true },
    zombie_c: { url: 'assets/models/zombie_c.glb', yaw: 0, height: 2.1, deferred: true },  // Big Arm (ripiego brute)
    // Mutant realistico (rig Mixamo, 13 animazioni di combattimento: idle/running/punch/fist/
    // hit/jumpAttack/knockDown). Texture creatura roccia+carne con crepe luminescenti (a.jpg).
    mutant: { url: 'assets/models/mutant/a.glb', yaw: 0, height: 2.0, deferred: true }, // brute ondata 4+
    zombie_d: { url: 'assets/models/zombie_d.glb', yaw: 0, height: 0.85, deferred: true }, // strisciante senza gambe (ripiego)
    dog: { url: 'assets/models/dog.glb', yaw: 0, height: 0.95, deferred: true },
    // Wolf realistico per il "crawler" (cane che carica): creep/run/walk. Root motion -> stripPos.
    wolf: { url: 'assets/models/sf/wolf_3dhaupt.glb', yaw: 0, height: 1.0, stripPos: true, deferred: true },
    // Gli scheletri (4.8 MB l'uno) compaiono solo dall'ondata 6: caricati in
    // sottofondo per non rallentare l'avvio.
    skeleton_a: { url: 'assets/models/skeleton_a.glb', yaw: 0, height: 1.75, deferred: true },
    skeleton_b: { url: 'assets/models/skeleton_b.glb', yaw: 0, height: 1.75, deferred: true },
    skeleton_c: { url: 'assets/models/skeleton_c.glb', yaw: 0, height: 1.8, deferred: true },
  },
  guns: {
    // Armi realistiche skinnate con mani guantate + clip Reload/Shoot/Hide/Draw, stessa "serie"
    // (rig Hand_D/Glove_D) → mani e ricarica coerenti tra le armi. La canna è l'asse più lungo
    // (auto-allineata a +Z in player._buildGunWrap); `length` = lunghezza in mano (unità mondo).
    // axis:'z' = canna già lungo +Z (i modelli realistici lo sono tutti); evita l'euristica
    // "asse più lungo" che sbaglia sulle pistole tozze (Mark 23 più alto che lungo).
    pistol: { url: 'assets/models/gun_pistol_glock.glb', length: 0.42, axis: 'z' }, // Glock-17 (BarcodeGames, CC-BY)
    // vmShift: abbassa il viewmodel così l'avambraccio si vede INTERO ma il gomito "tagliato"
    // (osso aperto) finisce sotto il bordo dello schermo.
    smg: { url: 'assets/models/gun_smg_kriss.glb', length: 0.62, axis: 'z', vmShift: { y: -0.05, z: -0.04 } }, // KRISS Vector (CC-BY)
    // Mark 23: pistola → usa le mani guantate + ricarica del Glock (borrowHands); il suo guanto
    // proprio in viewmodel mostra un avambraccio "tagliato".
    magnum: {
      url: 'assets/models/gun_magnum_mk23.glb', length: 0.46, axis: 'z', borrowHands: true,
      handGrip: { scale: 0.95, z: 0.04, y: 0.0, x: 0.0 },
    }, // Mark 23 .45 (CC-BY)
    // Fucile a pompa: viewmodel FPS COMPLETO (braccia+mani+arma in un rig skinnato) con presa a due
    // mani e ricarica a COLPO SINGOLO (la mano carica i pallettoni uno a uno). "FPS Arms remington
    // (shotgun)" di Cransh. viewmodel:true → mount dedicato (misura idle, scala, idle in loop).
    shotgun: {
      url: 'assets/models/gun_shotgun_cransh.glb', length: 1.2, viewmodel: true,
      vmAdjust: { x: -0.18, y: 0.08, z: -0.04 },
      // vmShift: abbassa il viewmodel nel frame camera così la volata/le mani stanno SOTTO il
      // centro schermo e il mirino (anche ampio) non finisce sull'arma.
      vmShift: { y: -0.09 },
      // shootFit: durata dell'animazione di sparo/pompa. Più lunga della pistola così il movimento
      // del carrello non è compresso/scattoso (il fucile spara lento, c'è tempo).
      shootFit: 0.5,
    }, // FPS Arms remington shotgun (Cransh, CC-BY)
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
    // lanterna in legno realistica (PolyHaven CC0) al posto della low-poly
    lantern_standing: { url: 'assets/models/ph/wooden_lantern_01/wooden_lantern_01_1k.glb', height: 0.62 },
    coffin: { url: 'assets/models/coffin.gltf', height: 0.7 },
    skull: { url: 'assets/models/skull.gltf', height: 0.3 },
    ribcage: { url: 'assets/models/ribcage.gltf', height: 0.5 },
    pumpkin: { url: 'assets/models/pumpkin_orange_jackolantern.gltf', height: 0.55 },
    shrine: { url: 'assets/models/shrine.gltf', height: 1.6 },
    bone_A: { url: 'assets/models/bone_A.gltf', height: 0.25 },
    barrel: { url: 'assets/models/barrel.glb', height: 1.0 },
    crate: { url: 'assets/models/crate.glb', height: 0.8 },
    // --- props realistici PBR (PolyHaven CC0, texture 1k). I "trunk" sono tronchi DISTESI:
    //     mappati come tronchi caduti (height = diametro target, la lunghezza segue la scala). ---
    log_fallen: { url: 'assets/models/ph/dead_tree_trunk/dead_tree_trunk_1k.glb', height: 0.42 },
    log_fallen_big: { url: 'assets/models/ph/dead_tree_trunk_02/dead_tree_trunk_02_1k.glb', height: 0.95 },
    tree_stump: { url: 'assets/models/ph/tree_stump_01/tree_stump_01_1k.glb', height: 0.7 },
    boulder: { url: 'assets/models/ph/boulder_01/boulder_01_1k.glb', height: 1.25 },
    rocks_moss: { url: 'assets/models/ph/rock_moss_set_01/rock_moss_set_01_1k.glb', height: 1.0 },
    rock_small: { url: 'assets/models/ph/rock_07/rock_07_1k.glb', height: 0.42 },
    statue_bust: { url: 'assets/models/ph/marble_bust_01/marble_bust_01_1k.glb', height: 0.78 },
  },
  groundTexture: 'assets/textures/ground.webp',
};

export const Assets = {
  player: null,          // { scene, animations, yaw, scale, footOffset }
  characters: new Map(), // nome -> idem
  guns: new Map(),       // nome -> { scene, length }
  props: new Map(),      // nome -> { scene, scale, footOffset }
  groundTexture: null,
  tex: {},               // set PBR realistici (PolyHaven CC0): { nome: { map, normalMap, roughnessMap } }
};

// Set di texture PBR realistiche (PolyHaven, CC0): diffuse + normale + rugosità.
const PBR_SETS = {
  forest: 'ph_forrest_ground_01',
  cobble: 'ph_cobblestone_floor_08',
  rock: 'ph_rock_wall_10',
  planks: 'ph_weathered_planks',
};

// Ogni set è scaricato e decodificato UNA SOLA volta (cache per `base`); gli usi con repeat diverso
// (es. forest serve sia a `forest` repeat 9 sia a `hubGround` repeat 30) riusano la stessa immagine
// via clone — niente doppio download né doppio decode (il decode è il collo di bottiglia in locale).
const _pbrCache = new Map(); // base -> { map, normalMap, roughnessMap } canonici (immagine condivisa)

function loadPBRSet(texLoader, base, repeat) {
  let canon = _pbrCache.get(base);
  if (!canon) {
    const load = (suffix, srgb) => {
      const t = texLoader.load(`assets/textures/${base}_${suffix}.webp`, undefined, undefined, () => {});
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    canon = { map: load('diff', true), normalMap: load('nor_gl', false), roughnessMap: load('rough', false) };
    _pbrCache.set(base, canon);
  }
  const variant = (t) => {
    const c = t.clone(); // condivide la Source (immagine): nessun nuovo fetch/decode
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat, repeat);
    c.anisotropy = 8;
    c.colorSpace = t.colorSpace;
    c.needsUpdate = true;
    return c;
  };
  return { map: variant(canon.map), normalMap: variant(canon.normalMap), roughnessMap: variant(canon.roughnessMap) };
}

function prepModel(gltf, targetHeight, yaw, opts = {}) {
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
  // root motion: alcune clip includono la traslazione del bacino -> il mesh slitterebbe rispetto
  // alla posizione IA. `stripPos` toglie TUTTE le tracce di posizione (modelli con root motion non
  // marcato, es. Sketchfab); altrimenti togliamo solo bacino/root delle clip "...Root" (Mixamo).
  for (const clip of gltf.animations || []) {
    if (opts.stripPos) {
      clip.tracks = clip.tracks.filter((t) => !/\.position$/.test(t.name));
    } else if (/root/i.test(clip.name)) {
      clip.tracks = clip.tracks.filter((t) => !(/\.position$/.test(t.name) && /(hips|root)/i.test(t.name)));
    }
  }
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
  const loader = makeLoader();
  const texLoader = new THREE.TextureLoader();
  const tryGLB = (url) => new Promise((res) => loader.load(url, (g) => res(g), undefined, () => res(null)));
  const tryTex = (url) => new Promise((res) => texLoader.load(url, (t) => res(t), undefined, () => res(null)));

  // Caricamento in parallelo, ma l'etichetta mostra la categoria a priorità più alta ancora in
  // corso (Personaggi -> Armi -> Ambiente): progressione leggibile senza saltellare a caso.
  const jobs = [];
  let done = 0, total = 0;
  const pending = { Personaggi: 0, Armi: 0, Ambiente: 0 };
  const ORDER = ['Personaggi', 'Armi', 'Ambiente'];
  const track = (p, phase) => {
    total++; pending[phase]++;
    return p.then((r) => {
      done++; pending[phase]--;
      onProgress?.(done / total, (ORDER.find((k) => pending[k] > 0) || 'Ambiente') + '…');
      return r;
    });
  };

  jobs.push(track(tryGLB(MANIFEST.player.url), 'Personaggi').then((g) => {
    if (g) Assets.player = prepModel(g, MANIFEST.player.height, MANIFEST.player.yaw);
  }));
  for (const [name, z] of Object.entries(MANIFEST.characters)) {
    if (z.deferred) continue; // caricati dopo, in sottofondo
    jobs.push(track(tryGLB(z.url), 'Personaggi').then((g) => {
      if (g) Assets.characters.set(name, prepModel(g, z.height, z.yaw, z));
    }));
  }
  for (const [name, def] of Object.entries(MANIFEST.guns)) {
    jobs.push(track(tryGLB(def.url), 'Armi').then((g) => {
      if (g) {
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        Assets.guns.set(name, { scene: g.scene, length: def.length, axis: def.axis, flip: def.flip, gloveOnly: def.gloveOnly, borrowHands: def.borrowHands, viewmodel: def.viewmodel, vmAdjust: def.vmAdjust, vmShift: def.vmShift, shootFit: def.shootFit, handGrip: def.handGrip, animations: g.animations || [] });
      }
    }));
  }
  for (const [name, def] of Object.entries(MANIFEST.props)) {
    jobs.push(track(tryGLB(def.url), 'Ambiente').then((g) => {
      if (g) {
        const prepped = prepModel(g, def.height, 0);
        prepped.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
        Assets.props.set(name, prepped);
      }
    }));
  }
  jobs.push(track(tryTex(MANIFEST.groundTexture), 'Ambiente').then((t) => {
    if (t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(14, 14);
      t.anisotropy = 4;
      Assets.groundTexture = t;
    }
  }));

  // texture PBR realistiche per i terreni/muri delle zone (caricamento sincrono, leggere)
  Assets.tex.forest = loadPBRSet(texLoader, PBR_SETS.forest, 9);
  Assets.tex.cobble = loadPBRSet(texLoader, PBR_SETS.cobble, 7);
  Assets.tex.rock = loadPBRSet(texLoader, PBR_SETS.rock, 4);
  Assets.tex.planks = loadPBRSet(texLoader, PBR_SETS.planks, 2);
  // terreno dell'hub: stesso set foresta (terra+foglie, adatto a un cimitero) ma su un piano
  // molto più grande -> repeat alto per non sgranare. Set PBR dedicato (riusa i file in cache).
  Assets.tex.hubGround = loadPBRSet(texLoader, PBR_SETS.forest, 30);
  // pietra per lapidi/mausolei/statue procedurali: repeat basso = blocchi di pietra leggibili
  Assets.tex.graveStone = loadPBRSet(texLoader, PBR_SETS.rock, 2);

  await Promise.all(jobs);

  // Arricchisci lo zombie realistico (Hazmat, solo 4 clip) con una CORSA vera: retarget della
  // clip "Run" del soldato — stesso rig Mixamo standard, basta rimappare i nomi delle ossa
  // (il Hazmat ha il suffisso _NN). Così il runner corre davvero invece di "camminare veloce".
  try {
    const hz = Assets.characters.get('zombie_hazmat');
    const sol = Assets.player;
    if (hz && sol) {
      const runSrc = (sol.animations || []).find((c) => /^run$/i.test(stripArmature(c.name)));
      if (runSrc && !hz.animations.some((c) => /^run$/i.test(stripArmature(c.name)))) {
        const rt = retargetSameFamily(runSrc, hz.scene, 'Run');
        if (rt) hz.animations.push(rt);
      }
    }
  } catch { /* il runner ricade sulla camminata velocizzata */ }

  if (!Assets.groundTexture) Assets.groundTexture = makeProceduralGroundTexture();
}

/**
 * Retarget di una clip tra due scheletri della STESSA famiglia Mixamo che differiscono solo nei
 * nomi delle ossa (es. `mixamorig:Hips` -> `mixamorig:Hips_01`). Rimappa i nomi delle tracce sulle
 * ossa del target e scarta le tracce di posizione (tiene solo le rotazioni: niente drift/scala).
 */
function retargetSameFamily(srcClip, targetRoot, newName) {
  const map = {};
  targetRoot.traverse((o) => {
    if (o.isBone) { const base = o.name.replace(/_\d+$/, ''); if (!(base in map)) map[base] = o.name; }
  });
  const tracks = [];
  for (const t of srcClip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'position') continue; // niente traslazioni (evita drift/scala)
    // niente rotazione di bacino/root: il bind dell'Hazmat è orientato diversamente da quello del
    // soldato, quindi applicare la quaternione dell'Hips lo CORICA. Le gambe bastano per la corsa.
    if (/hips/i.test(bone) || /(^|:)_?root/i.test(bone)) continue;
    const target = map[bone] || map[bone.replace(/_\d+$/, '')];
    if (!target) continue;
    const nt = t.clone();
    nt.name = target + '.' + prop;
    tracks.push(nt);
  }
  return tracks.length ? new THREE.AnimationClip(newName, srcClip.duration, tracks) : null;
}

/** Carica in sottofondo i modelli pesanti non necessari all'avvio (scheletri). */
export async function loadDeferredAssets() {
  const loader = makeLoader();
  const tryGLB = (url) => new Promise((res) => loader.load(url, (g) => res(g), undefined, () => res(null)));
  const jobs = [];
  for (const [name, z] of Object.entries(MANIFEST.characters)) {
    if (!z.deferred || Assets.characters.has(name)) continue;
    jobs.push(tryGLB(z.url).then((g) => {
      if (g) Assets.characters.set(name, prepModel(g, z.height, z.yaw, z));
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
  walk: [/^walk_gun$/i, /^walk$/i, /^walking_[abc]$/i, /walking/i, /^walk/i, /walk/i, /run/i],
  run: [/^run_gun$/i, /^run$/i, /^running_[ab]$/i, /running/i, /^run(?!_attack)/i, /run/i, /walk/i],
  crawl: [/^crawl$/i, /crawl/i, /creep/i, /walk/i],
  attack: [/^punch$/i, /^attack$/i, /melee_attack/i, /^idle_attack$/i, /^fist$/i, /attack|punch|bite|slash|chop|stab|kick|fist/i, /skill/i],
  cast: [/^spellcast_shoot$/i, /spellcast/i, /ranged_shoot/i, /^attack$/i, /attack|punch/i],
  death: [/^death$/i, /^death_[ab]$/i, /death/i, /die|dead/i, /knock/i],
  hit: [/^hitreact/i, /^hit_[ab]$/i, /hit/i, /damage/i],
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

  /** Sfasa la clip corrente a un punto casuale: rompe la sincronia tra nemici simili. */
  desync() {
    if (!this.current) return;
    const clip = this.current.getClip?.();
    if (clip) this.current.time = Math.random() * clip.duration;
  }
}
