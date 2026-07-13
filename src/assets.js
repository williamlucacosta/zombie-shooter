// Caricamento asset: modelli GLB (giocatore, zombi, oggetti di scena), texture
// e font. Ogni risorsa ha un fallback procedurale: il gioco funziona comunque.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

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
    // ORDA REALISTICA COERENTE dalla libreria di temptecn/DanteGuy (Sketchfab, tutti CC-BY,
    // low-poly game-ready, molte animazioni, stile horror uniforme). Clip standard Walk/Run/Attack*/
    // Death* → matchate da PURPOSE_PATTERNS. Le anim sono IN-PLACE (drift 0), niente stripPos.
    // Solo il walker è EAGER (ondata 1); il resto differito.
    // yaw = correzione dell'orientamento perché il "davanti" nativo finisca su +Z (verso il player).
    // VERIFICATO visivamente (tools/enemy-measure*.mjs + visore /models con freccia +Z): il davanti
    // nativo di slow1 e crawler è -X → +90°; putrid guarda -Z → 180°; chainsaw guarda già +Z → 0°.
    // I piedi vengono piantati a terra in enemies.js (l'origine di alcuni modelli è al bacino).
    // ⚠ crawler height BASSA (0.45): normalizzando per l'altezza Y, questo mezzo busto orizzontale a
    // 1.05 diventava gigante (~2.5 m in Walk, più alto di uno zombi in piedi); 0.45 → ~1.2 m lungo.
    zombie_slow1: { url: 'assets/models/sf/zombie_slow1.glb', yaw: Math.PI / 2, height: 1.85 }, // walker: infetto classico (11 anim)
    zombie_putrid: { url: 'assets/models/sf/zombie_putrid.glb', yaw: Math.PI, height: 1.92, deferred: true }, // runner/spitter: emaciato (15 anim)
    zombie_crawler: { url: 'assets/models/sf/zombie_crawler.glb', yaw: Math.PI / 2, height: 0.45, deferred: true }, // strisciante: mezzo busto (5 anim)
    zombie_chainsaw: { url: 'assets/models/sf/zombie_chainsaw.glb', yaw: 0, height: 1.98, deferred: true }, // brute: bestione motosega (10 anim)
    // Cane infetto realistico per l'hound (cane veloce). Differito.
    dog: { url: 'assets/models/dog.glb', yaw: 0, height: 0.95, deferred: true },
  },
  guns: {
    // Le 4 armi sono VIEWMODEL FPS COMPLETI (braccia+mani+arma in un solo rig skinnato) con clip
    // AUTORALI di idle/sparo/ricarica (fast + full) → mount dedicato player._mountViewmodel:
    // misura la geometria in posa idle, scala la canna a `length`, braccia visibili solo in FPS,
    // idle in loop, sparo/ricarica una volta e ritorno all'idle in dissolvenza.
    // gunRe = regex sui nomi dei MATERIALI che individua le mesh dell'ARMA (a runtime i nomi
    // mesh sono persi: GLTFLoader li sovrascrive col nome nodo "Object_N", i materiali no).
    // Le mesh che non matchano = braccia. Senza gunRe si usa l'euristica geometrica (canna =
    // mesh più lunga in Z, braccia = mesh larghe in X). File da tools/sf-gun-clean.mjs.
    // ⚠️ vmShift è nel frame dello SGUARDO con base R=cross(up,F): **x POSITIVO = SINISTRA dello
    // schermo, NEGATIVO = destra** (y su, z avanti). Il global __VM {x:0.2,y:-0.19,fwd:0.5} è
    // tarato sul fucile a pompa (arma lunga, quasi centrata): le armi corte senza correzione
    // finivano in basso a sinistra, mezze fuori schermo → vmShift le porta a DESTRA e le ALZA
    // (posa da FPS classico); la convergenza fa comunque puntare la volata sul mirino.
    // muzzleY (opzionale) = frazione 0..1 dell'altezza dell'arma a cui sta la linea di canna;
    // di default si usa il centro del pezzo più avanzato (canna/silenziatore), che basta.
    // ⚠️ I candidati Sketchfab vanno VERIFICATI con tools/vm-measure.mjs prima di integrarli:
    // in alcune conversioni glTF (Makarov Cransh, Deagle 1Matzh) braccia o arma restano in
    // bind-pose esplosa in ogni clip → mesh a ±15000 unità, inutilizzabili.
    // ⚠️ `length` a SCALA REALE (come il pompa, 1.2 ≈ vero Remington): il rig scala tutto
    // insieme, quindi un'arma ingrandita 2× porta con sé braccia di 1.2 m che riempiono lo
    // schermo (gomiti dietro la camera, spalle in inquadratura). Armi vere: XD ~0.19 m,
    // MPA ~0.55 m col silenziatore, revolver ~0.33 m — qui appena sopra il vero per leggibilità.
    // tdShift = TRIM opzionale SOLO in top-down (assi del gunMount: +z = canna avanti, +y su).
    // In terza persona l'arma è ancorata al POLSO DESTRO del rig del viewmodel (in idle la sua
    // mano stringe già l'impugnatura → l'impugnatura cade nel palmo del soldato per costruzione,
    // vedi player._applyVmView); il default {y:0.02, z:0.06} sposta il tutto dal polso al palmo.
    pistol: {
      url: 'assets/models/gun_pistol_xd.glb', length: 0.22, viewmodel: true,
      gunRe: /^material\b/i, shootFit: 0.16,
      // in basso a destra, stile FPS classico: il braccio entra dall'angolo invece di tagliare
      // la visuale in diagonale (a y più alte l'avambraccio attraversava mezzo schermo).
      vmShift: { x: -0.305, y: 0.04, z: -0.04 },        // fianchi (calibrato in /aim-position)
      adsPos: { x: -0.025, y: -0.095, fwd: 0.44 },      // mira (calibrato in /aim-position)
      adsRot: { x: -0.5, y: -5.5, z: 0 },               // rotazione mira (gradi)
    }, // "FPS pistol animations" Springfield XD (Cransh, CC-BY; arma di raimeiyonke, mani di DJMaesen)
    smg: {
      url: 'assets/models/gun_smg_mpa.glb', length: 0.55, viewmodel: true, deferred: true,
      gunRe: /material_45\d/i, shootFit: 0.1,
      // y/z: abbassato e arretrato come il pompa (canna ~26° sotto il mirino) così spalle e
      // monconi delle braccia (tagliati dal near plane) restano FUORI dai bordi.
      vmShift: { x: -0.315, y: -0.07, z: -0.23 },       // fianchi (calibrato in /aim-position)
      adsPos: { x: 0.02, y: -0.2, fwd: 0.345 },         // mira (calibrato in /aim-position)
      adsRot: { x: 0, y: -1.5, z: 5.5 },                // rotazione mira (gradi)
    }, // "SMG FPS Animations" MPA 30 SST (Cransh, CC-BY; arma di eNse7en, mani di DJMaesen)
    magnum: {
      url: 'assets/models/gun_magnum_revolver.glb', length: 0.36, viewmodel: true, deferred: true,
      gunRe: /revolver/i, shootFit: 0.45,
      // timeline unica "allanims" (10.67s), finestre MISURATE offline sui nodi del rig (tracking
      // di bullet1..6/release/revolver, vedi sessione tools gun-diag):
      // 0–0.9 estrazione · 0.9–7.35 RICARICA (tamburo si apre, i 6 colpi entrano a 1.24/2.00/2.78/
      // 3.54/4.30/5.08s dall'inizio finestra, chiusura a ~5.85) · 8.08–8.90 SPARO (il VERO rinculo:
      // canna che scatta su +22° e si riassesta; la vecchia finestra 7.43–7.78 prendeva la
      // TRANSIZIONE verso il fanning, dove l'arma CROLLA in basso → "pistola calata" a ogni colpo) ·
      // 8.9–9.75 idle a tamburo CHIUSO. (Vedi anche _subclipHold: tiene le ossa statiche in posa.)
      clipWindows: { draw: [0, 0.9], shoot: [8.08, 8.9], reload: [0.9, 7.35], idle: [8.9, 9.75] },
      vmShift: { x: -0.345, y: 0.015, z: 0.09 },       // fianchi (calibrato in /aim-position)
      adsPos: { x: -0.01, y: -0.095, fwd: 0.595 },      // mira (calibrato in /aim-position)
      tdShift: { y: 0.02, z: 0.04 },                    // trim top-down (canna corta, palmo vicino)
    }, // "revolver animated" (bumstrum/DJMaesen, CC-BY)
    // Fucile a pompa con presa a due mani e ricarica a COLPO SINGOLO (la mano carica i
    // pallettoni uno a uno). "FPS Arms remington (shotgun)" di Cransh.
    shotgun: {
      url: 'assets/models/gun_shotgun_cransh.glb', length: 1.2, viewmodel: true, deferred: true,
      gunRe: /remington|12ge/i,
      vmAdjust: { x: -0.18, y: 0.08, z: -0.04 },
      // vmShift: abbassa il viewmodel nel frame camera così la volata/le mani stanno SOTTO il
      // centro schermo e il mirino (anche ampio) non finisce sull'arma.
      vmShift: { x: -0.15, y: -0.085, z: 0 },           // fianchi (calibrato in /aim-position)
      adsPos: { x: 0.17, y: -0.195, fwd: 0.475 },       // mira (calibrato in /aim-position)
      adsRot: { x: 0, y: -1.5, z: -0.5 },               // rotazione mira (gradi)
      // shootFit: durata dell'animazione di sparo/pompa. Più lunga della pistola così il movimento
      // del carrello non è compresso/scattoso (il fucile spara lento, c'è tempo).
      shootFit: 0.5,
    }, // FPS Arms remington shotgun (Cransh, CC-BY)
  },
  props: {
    // --- FORESTA (Sketchfab CC-BY, statici, scaricati con tools/sketchfab-dl.mjs) ---
    // height = altezza mondo normalizzata da prepModel.
    // pines = SET di ~9 pini in una scena (varianti raggruppate per prefisso "N_"): world.js
    // le estrae, le fonde per materiale e le INSTANZIA (foresta intera in poche draw call).
    pines: { url: 'assets/models/sf/pines_scots.glb', height: 15 },        // Scots Pine Set (c3posw01)
    cabin: { url: 'assets/models/sf/cabin_wood.glb', height: 3.5 },        // capanna del ranger (donnichols)
    shed: { url: 'assets/models/sf/shed_old.glb', height: 3.1 },           // capanno marcio (donnichols)
    streetlight: { url: 'assets/models/sf/prop_streetlight.glb', height: 4.6 }, // fari del campo base
    jersey: { url: 'assets/models/sf/prop_jersey.glb', height: 0.85 },
    sandbags: { url: 'assets/models/sf/prop_sandbags.glb', height: 1.0 },  // barricata di sacchi (fertator99)
    watchtower: { url: 'assets/models/sf/prop_watchtower.glb', height: 5.6 }, // torretta militare (edminchi)
    debris: { url: 'assets/models/sf/prop_debris.glb', height: 1.2 },      // macerie di cemento, scan (albentan2012)
    truck_m725: { url: 'assets/models/sf/truck_m725.glb', height: 2.4 },   // ambulanza militare M725 (kryik1023)
    // lanterna in legno realistica (PolyHaven CC0)
    lantern_standing: { url: 'assets/models/ph/wooden_lantern_01/wooden_lantern_01_1k.glb', height: 0.62 },
    coffin: { url: 'assets/models/coffin.gltf', height: 0.7 },
    skull: { url: 'assets/models/skull.gltf', height: 0.3 },
    ribcage: { url: 'assets/models/ribcage.gltf', height: 0.5 },
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
  grass: 'ph_forest_ground_04',         // sottobosco muschioso (PolyHaven CC0) — terreno principale
  bark: 'ph_bark_brown_02',             // corteccia (PolyHaven CC0) — tronchi/pali/pontile
  cobble: 'ph_cobblestone_floor_08',
  rock: 'ph_rock_wall_10',
  planks: 'ph_weathered_planks',
  // --- città abbandonata ---
  asphalt: 'ph_asphalt_02',            // manto stradale
  paving: 'ph_rectangular_paving',     // marciapiedi / piazza
  brick: 'ph_brick_wall_04',           // facciate in mattoni
  plaster: 'ph_plastered_wall_04',     // facciate intonacate
  panels: 'ph_concrete_panels',        // facciate in pannelli di cemento
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
  // Solo la PISTOLA (arma iniziale) è eager: le altre 3 (~27 MB, pompa/mitra/magnum) si sbloccano
  // molto dopo (ondata 5+) → si caricano in VERO sottofondo dopo il menu (loadBackgroundGuns).
  for (const [name, def] of Object.entries(MANIFEST.guns)) {
    if (def.deferred) continue;
    jobs.push(track(tryGLB(def.url), 'Armi').then((g) => { if (g) setGunEntry(name, def, g); }));
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

  // texture PBR realistiche per i terreni delle zone (caricamento sincrono, leggere).
  // Mappa FORESTA: niente più set urbani (asfalto/facciate) → meno byte e decode all'avvio.
  // terreni: repeat più ALTO = piastrella d'erba/fango più piccola (dettaglio e rilievo veri, non
  // una macro-texture "spalmata"). L'antiTile in world.js uccide la ripetizione visibile.
  // Terreno principale = sottobosco muschioso PolyHaven (forest_ground_04), decode UNA volta,
  // due repeat (hub grande + zone).
  Assets.tex.forest = loadPBRSet(texLoader, PBR_SETS.grass, 16);        // terreno zone
  Assets.tex.forestHub = loadPBRSet(texLoader, PBR_SETS.grass, 50);     // terreno hub (stesso decode, repeat diverso)
  Assets.tex.bark = loadPBRSet(texLoader, PBR_SETS.bark, 3);            // corteccia tronchi/pali
  Assets.tex.cobble = loadPBRSet(texLoader, PBR_SETS.cobble, 7);        // radura + sentieri (UV planari in world.js)
  Assets.tex.rock = loadPBRSet(texLoader, PBR_SETS.rock, 4);
  Assets.tex.planks = loadPBRSet(texLoader, PBR_SETS.planks, 2);
  // pietra per statue/monumenti procedurali: repeat basso = blocchi di pietra leggibili
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

  // 3 varianti pre-bakate del walker (geometria+colore) per un'orda meno clonata: lo spawn ne
  // sceglie una a caso (vedi config.walker.variants + enemies). Fatto una volta, qui, non in live.
  makeGeoVariants('zombie_slow1', 3);

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

/** Registra una voce arma in Assets.guns (usata da caricamento eager e in sottofondo). */
function setGunEntry(name, def, g) {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  Assets.guns.set(name, {
    scene: g.scene, length: def.length, axis: def.axis, flip: def.flip, viewmodel: def.viewmodel,
    gunRe: def.gunRe, muzzleY: def.muzzleY, clipWindows: def.clipWindows, vmAdjust: def.vmAdjust,
    vmShift: def.vmShift, adsPos: def.adsPos, vmRot: def.vmRot, adsRot: def.adsRot,
    tdShift: def.tdShift, shootFit: def.shootFit, animations: g.animations || [],
  });
}

/**
 * Carica le armi PESANTI (pompa/mitra/magnum, ~27 MB) in VERO sottofondo, DOPO che il menu è
 * pronto: non bloccano il time-to-play (il giocatore parte con la pistola). Ritorna i nomi caricati
 * così il chiamante può pre-scaldarne gli shader ed eventualmente rimontare l'arma in mano.
 */
export async function loadBackgroundGuns() {
  const loader = makeLoader();
  const tryGLB = (url) => new Promise((res) => loader.load(url, (g) => res(g), undefined, () => res(null)));
  const loaded = [];
  // SEQUENZIALI con un respiro tra l'una e l'altra: il PARSE di un GLB (specie il mitra ~18 MB) è
  // un blocco sincrono → caricandole in parallelo i parse si accavallavano e inchiodavano il menu.
  for (const [name, def] of Object.entries(MANIFEST.guns)) {
    if (!def.deferred || Assets.guns.has(name)) continue;
    const g = await tryGLB(def.url);
    if (g) { setGunEntry(name, def, g); loaded.push(name); }
    await new Promise((r) => setTimeout(r, 150));
  }
  return loaded;
}

// Carica UNA SOLA arma differita (la prossima non ancora caricata) e ne restituisce il nome (o null
// se non ce n'è più / tutte in errore). Il PARSE del GLB è un blocco sincrono di alcuni secondi →
// questa va chiamata negli INTERMEZZI tra le ondate (momenti calmi) o ON-DEMAND quando il giocatore
// impugna un'arma non ancora pronta, così il freeze del parse non capita mai in combattimento né
// all'avvio della partita.
//   • `preferred`: nome dell'arma da caricare PER PRIMA (di solito quella-scatola in mano) → il
//     modello vero rimpiazza il ripiego prima possibile.
//   • ⚠️ su errore di un'arma NON si ferma la catena (prima faceva `return null`: un magnum in errore
//     bloccava per sempre anche lo shotgun a valle) → prova comunque le successive.
export async function loadNextBackgroundGun(preferred) {
  const loader = makeLoader();
  const pending = Object.keys(MANIFEST.guns).filter((n) => MANIFEST.guns[n].deferred && !Assets.guns.has(n));
  if (!pending.length) return null; // tutte caricate
  if (preferred && pending.includes(preferred)) { pending.splice(pending.indexOf(preferred), 1); pending.unshift(preferred); }
  for (const name of pending) {
    const def = MANIFEST.guns[name];
    const g = await new Promise((res) => loader.load(def.url, (r) => res(r), undefined, () => res(null)));
    if (g) { setGunEntry(name, def, g); return name; }
    // errore su QUESTA: non bloccare le altre, prova la prossima (si ritenterà al prossimo giro)
  }
  return null;
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

// ---------------------------------------------------- varianti pre-bakate --
// Rumore 3D "value noise" economico e DETERMINISTICO (hash intero → smoothstep trilineare): serve
// a deformare la geometria degli zombi una sola volta al load (mai in tempo reale) per creare
// varianti fisicamente diverse (bitorzoli sulla carne, pancia/emaciato), non solo colori.
function _hash3(x, y, z, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2246822519 + seed * 3266489917 + 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function _vnoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => _hash3(xi + dx, yi + dy, zi + dz, seed);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w,
  );
}
// Versione 2D (per la mappa dei bubboni campionata sugli UV).
function _vnoise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy) => _hash3(xi + dx, yi + dy, 0, seed);
  return L(L(c(0, 0), c(1, 0), u), L(c(0, 1), c(1, 1), u), v);
}

// Converte un attributo (eventualmente Int16/8 NORMALIZZATO, come nei modelli quantizzati) in
// Float32 non normalizzato leggendo i valori già denormalizzati (getX li denormalizza). ⚠️ Cruciale:
// gli zombi sono QUANTIZZATI (position = Int16 in [-1,1]); scrivere valori spostati sull'attributo
// normalizzato sfora il range intero e WRAPPA il vertice dall'altro lato (triangoli giganti/neri).
function _dequantAttr(attr) {
  if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) return attr;
  const f = new THREE.BufferAttribute(new Float32Array(attr.count * attr.itemSize), attr.itemSize);
  for (let i = 0; i < attr.count; i++) f.setXYZ(i, attr.getX(i), attr.getY(i), attr.getZ(i));
  return f;
}

/**
 * Applica IN-PLACE la perturbazione a tutte le mesh di una scena (clona le geometrie così non
 * tocca l'originale). Riusata sia dal gioco (makeGeoVariant) sia dal visore /models (anteprima).
 * Tre effetti pre-bakati:
 *  1) LUMPS: rumore 3D lungo la normale (ondulazione generale della carne) + GIRTH (scala
 *     orizzontale uniforme → corporatura più tozza/snella, proporzionata).
 *  2) BUBBONI: mappa 2D di rumore campionata sugli UV, con soglia+potenza → gonfiori TONDI che
 *     spuntano dalla superficie (solo verso l'esterno) nei punti dove la mappa è alta.
 *  3) COLORE per fascia d'altezza via VERTEX COLOR: pelle in alto (opts.skin) e pantaloni in
 *     basso (opts.pants) → jeans di colore diverso per variante. material.color resta la base
 *     (il gioco ci moltiplica la tinta d'ondata), i vertex color moltiplicano la texture.
 * opts: { seed, amp, freq, girth, boilAmp, boilFreq, boilThr, skin, pants }
 */
export function perturbSceneGeometry(scene, opts) {
  const skin = new THREE.Color(opts.skin ?? 0xffffff);
  const pants = new THREE.Color(opts.pants ?? 0xffffff);
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry.clone(); // NON condividere con l'originale
    o.geometry = geo;
    // de-quantizza in Float32 così lo spostamento non può sforare/wrappare (vedi _dequantAttr)
    geo.setAttribute('position', _dequantAttr(geo.attributes.position));
    if (geo.attributes.normal) geo.setAttribute('normal', _dequantAttr(geo.attributes.normal));
    else geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv; // per la mappa dei bubboni
    geo.computeBoundingBox();
    const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3());
    const diag = size.length() || 1;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const minY = bb.min.y, hY = Math.max(size.y, 1e-6);
    const amp = diag * opts.amp, freq = opts.freq / diag, girth = opts.girth || 0;
    const boilAmp = diag * (opts.boilAmp || 0), boilFreq = opts.boilFreq || 18, boilThr = opts.boilThr ?? 0.62;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      const nz = _vnoise(_p.x * freq, _p.y * freq, _p.z * freq, opts.seed) - 0.5; // -0.5..0.5
      let disp = nz * amp;
      if (uv && boilAmp) {
        // BUBBONE: mappa 2D sugli UV, sopra soglia → gonfiore tondo (potenza = bordi netti, solo +)
        let b = _vnoise2(uv.getX(i) * boilFreq, uv.getY(i) * boilFreq, opts.seed + 101);
        b = Math.max(0, b - boilThr) / (1 - boilThr);
        disp += b * b * boilAmp;
      }
      pos.setXYZ(i,
        _p.x + _n.x * disp + (_p.x - cx) * girth,
        _p.y + _n.y * disp,
        _p.z + _n.z * disp + (_p.z - cz) * girth);
      // colore per fascia: pantaloni (basso) → pelle (alto), transizione morbida alla vita (~48%)
      const pantsMix = 1 - THREE.MathUtils.smoothstep((_p.y - minY) / hY, 0.42, 0.54);
      _c.copy(skin).lerp(pants, pantsMix);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    if (o.material) {
      const m = o.material.clone();
      m.vertexColors = true; // pelle/pantaloni per variante moltiplicano la texture
      o.material = m;
    }
  });
}

function makeGeoVariant(entry, opts) {
  const scene = skeletonClone(entry.scene);
  perturbSceneGeometry(scene, opts);
  return { scene, animations: entry.animations, yaw: entry.yaw, scale: entry.scale, footOffset: entry.footOffset };
}

// 3 profili di variante ben distinti: tozzo/gonfio, emaciato, deforme (tanti bubboni). skin =
// tinta pelle (tenue), pants = colore jeans (MOLTIPLICA la texture blu: toni scuri distinti).
// Il gioco moltiplica ANCORA la tinta d'ondata su material.color → tieni le tinte non troppo cupe.
export const VARIANT_PROFILES = [
  { seed: 11, amp: 0.011, freq: 5.5, girth: 0.15, boilAmp: 0.032, boilFreq: 19, boilThr: 0.58, skin: 0xffdccb, pants: 0xffb060 }, // tozzo · pantaloni marroni
  { seed: 37, amp: 0.015, freq: 7.0, girth: -0.13, boilAmp: 0.024, boilFreq: 26, boilThr: 0.64, skin: 0xe2e8d6, pants: 0x8fc070 }, // emaciato · pantaloni verdi
  { seed: 63, amp: 0.018, freq: 6.0, girth: 0.05, boilAmp: 0.046, boilFreq: 15, boilThr: 0.54, skin: 0xdcebca, pants: 0xd87068 }, // deforme · tanti bubboni · pantaloni rossastri
];

/** Registra `count` varianti (max 3) di `baseName` come "<baseName>_v1.._vN" (una volta, al load). */
export function makeGeoVariants(baseName, count) {
  const base = Assets.characters.get(baseName);
  if (!base) return;
  const n = Math.min(count, VARIANT_PROFILES.length);
  for (let i = 0; i < n; i++) {
    const key = `${baseName}_v${i + 1}`;
    if (Assets.characters.has(key)) continue;
    try { Assets.characters.set(key, makeGeoVariant(base, VARIANT_PROFILES[i])); } catch { /* ripiego sull'originale */ }
  }
}

// ---------------------------------------------------- varianti di PELLE (texture) --
// Ogni zombi ha UNA texture diffusa (1024², webp): qui la pre-lavoriamo con strati di RUMORE
// professionali (chiazze di decomposizione, venature, sangue rappreso, cenere) in 4 "sapori"
// tematici → l'orda smette di essere una tinta piatta e ogni non morto racconta la sua morte.
// Il lavoro per-pixel gira su tile 256² (maschere) e la composizione a 512² usa drawImage +
// globalCompositeOperation (accelerati): ~decine di ms per variante, generate in SOTTOFONDO
// dopo il menu (makeSkinVariantsAll) — zero impatto sul time-to-play; finché una variante non
// è pronta si usa la texture originale.
export const SKIN_FLAVORS = {
  rot: {   // putrefazione: chiazze verdastre di decomposizione + venature scure + poco sangue
    layers: [
      { kind: 'mottle', color: '#42582f', alpha: 0.5, scale: 3.2, lo: 0.45, hi: 0.78 },
      { kind: 'soft', color: '#77854e', alpha: 0.24, scale: 2.1, lo: 0.5, hi: 0.85 },
      { kind: 'veins', color: '#1e2c18', alpha: 0.42, scale: 7.0, width: 0.035 },
      { kind: 'blood', color: '#380d08', alpha: 0.45, scale: 4.5, thr: 0.68 },
    ],
    grade: 'saturate(0.92) brightness(0.97)',
  },
  pale: {  // esangue: pelle sbiancata, lividi bluastri da ristagno (livor mortis), vene violacee
    layers: [
      { kind: 'soft', color: '#d4d8d4', alpha: 0.3, scale: 2.2, lo: 0.42, hi: 0.8 },
      { kind: 'mottle', color: '#525c72', alpha: 0.34, scale: 2.6, lo: 0.5, hi: 0.82 },
      { kind: 'veins', color: '#39334e', alpha: 0.34, scale: 8.0, width: 0.03 },
    ],
    grade: 'saturate(0.6) brightness(1.05)',
  },
  char: {  // carbonizzato/annerito: bruciature a chiazze, crepe scure, velo di cenere
    layers: [
      { kind: 'mottle', color: '#1b1512', alpha: 0.6, scale: 2.4, lo: 0.4, hi: 0.72 },
      { kind: 'veins', color: '#0d0a08', alpha: 0.45, scale: 6.0, width: 0.05 },
      { kind: 'soft', color: '#8d867a', alpha: 0.15, scale: 5.0, lo: 0.62, hi: 0.9 },
    ],
    grade: 'saturate(0.72) brightness(0.9) contrast(1.06)',
  },
  gore: {  // insanguinato: schizzi larghi + colature verticali di sangue rappreso
    layers: [
      { kind: 'blood', color: '#3e0806', alpha: 0.7, scale: 3.4, thr: 0.6, streak: 3 },
      { kind: 'blood', color: '#5a1410', alpha: 0.45, scale: 6.5, thr: 0.7 },
      { kind: 'mottle', color: '#5c4038', alpha: 0.28, scale: 2.8, lo: 0.5, hi: 0.82 },
    ],
    grade: 'saturate(1.05) brightness(0.96)',
  },
};

Assets.skins = new Map(); // baseName modello -> { flavorId: THREE.CanvasTexture }

// fBm (3 ottave di value noise 2D, tileable per costruzione del campionamento in [0,scale))
function _fbm2(x, y, seed) {
  return 0.5 * _vnoise2(x, y, seed) + 0.3 * _vnoise2(x * 2.03, y * 2.03, seed + 7) + 0.2 * _vnoise2(x * 4.07, y * 4.07, seed + 13);
}
const _sstep = (lo, hi, x) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

// maschera RGBA 128²: colore pieno, alpha dal rumore secondo il tipo di strato.
// ⚠️ È il lavoro per-pixel in JS: va tenuto PICCOLO (128² basta: viene stirata col filtro
// bilineare) e CONDIVISO — a 256² per-modello i bake in serie congelavano il menu ~10s.
function _skinMask(layer, seed) {
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const col = new THREE.Color(layer.color);
  const r = (col.r * 255) | 0, g = (col.g * 255) | 0, b = (col.b * 255) | 0;
  const sc = layer.scale, streak = layer.streak || 1;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = _fbm2((x / S) * sc, (y / S) * sc / streak, seed); // streak>1 = colature verticali
      let a;
      if (layer.kind === 'veins') { // linee sottili: banda stretta attorno alla curva di livello n=0.5
        a = Math.max(0, 1 - Math.abs(n - 0.5) / (layer.width || 0.04));
      } else if (layer.kind === 'blood') { // schizzi a soglia dura (bordi netti)
        a = _sstep(layer.thr, layer.thr + 0.07, n);
      } else { // mottle / soft: chiazze morbide
        a = _sstep(layer.lo, layer.hi, n);
      }
      const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = Math.min(255, a * layer.alpha * 255) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// Le maschere sono CONDIVISE tra tutti i modelli (cache per sapore+strato): la stessa maschera
// su UV diverse appare comunque diversa su ogni zombi, e il costo per-pixel si paga UNA volta.
const _maskCache = new Map(); // "flavorId:k" -> canvas
function _flavorMasks(flavorId, flavor) {
  return flavor.layers.map((layer, k) => {
    const key = `${flavorId}:${k}`;
    let m = _maskCache.get(key);
    if (!m) { m = _skinMask(layer, 5 + k * 31 + flavorId.length * 7); _maskCache.set(key, m); }
    return m;
  });
}

// costruisce UNA variante 512² dalla texture sorgente (ImageBitmap/HTMLImage del GLB):
// SOLO composizioni drawImage (accelerate) — niente lavoro per-pixel qui.
function _bakeSkin(srcTex, flavorId, flavor) {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.drawImage(srcTex.image, 0, 0, S, S);
  const masks = _flavorMasks(flavorId, flavor);
  for (let k = 0; k < flavor.layers.length; k++) {
    ctx.globalCompositeOperation = flavor.layers[k].kind === 'soft' ? 'soft-light' : 'multiply';
    ctx.drawImage(masks[k], 0, 0, S, S);
  }
  ctx.globalCompositeOperation = 'source-over';
  // grade finale (saturazione/luminosità del sapore) su un canvas di uscita
  const out = document.createElement('canvas'); out.width = out.height = S;
  const octx = out.getContext('2d');
  if (flavor.grade) octx.filter = flavor.grade;
  octx.drawImage(cv, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.flipY = srcTex.flipY;             // le texture glTF NON sono flippate
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT;
  tex.anisotropy = srcTex.anisotropy;
  // eventuale KHR_texture_transform della sorgente: la variante deve mappare identica
  tex.repeat.copy(srcTex.repeat); tex.offset.copy(srcTex.offset);
  tex.center.copy(srcTex.center); tex.rotation = srcTex.rotation;
  return tex;
}

/**
 * Genera in SOTTOFONDO tutte le pelli variate dei non morti (un canvas per volta, con una pausa
 * tra l'uno e l'altro → il menu/gioco resta fluido). Rieseguibile: salta quelle già pronte.
 */
export async function makeSkinVariantsAll() {
  const names = ['zombie_slow1', 'zombie_putrid', 'zombie_crawler', 'zombie_chainsaw'];
  const yieldFrame = () => new Promise((r) => setTimeout(r, 40));
  // 1) le maschere condivise, UNA per volta con un respiro tra l'una e l'altra (per-pixel JS)
  for (const [id, flavor] of Object.entries(SKIN_FLAVORS)) {
    _flavorMasks(id, flavor);
    await yieldFrame();
  }
  // 2) i bake per modello×sapore: solo drawImage (veloci), comunque uno per volta
  for (const name of names) {
    const entry = Assets.characters.get(name);
    if (!entry) continue;
    let srcTex = null;
    entry.scene.traverse((o) => {
      if (!srcTex && o.isMesh && o.material && o.material.map && o.material.map.image) srcTex = o.material.map;
    });
    if (!srcTex) continue;
    const set = Assets.skins.get(name) || {};
    Assets.skins.set(name, set);
    for (const [id, flavor] of Object.entries(SKIN_FLAVORS)) {
      if (set[id]) continue;
      try { set[id] = _bakeSkin(srcTex, id, flavor); } catch { /* texture non leggibile: si resta sull'originale */ }
      await yieldFrame(); // cede il thread tra una variante e l'altra
    }
  }
}

/**
 * Pelle variata per il nemico: `flavorId` = sapore del tema d'ondata (con un po' di caso per non
 * uniformare l'orda: 60% tema, 25% un sapore qualsiasi, 15% texture originale). null = originale.
 */
export function pickSkin(baseName, flavorId, force = false) {
  const set = Assets.skins.get(baseName.replace(/_v\d+$/, ''));
  if (!set) return null;
  if (force) return (flavorId && set[flavorId]) || null; // boss: sempre il suo sapore
  const roll = Math.random();
  if (roll < 0.15) return null;
  let id = flavorId;
  if (roll >= 0.75 || !id || !set[id]) {
    const ids = Object.keys(set);
    if (!ids.length) return null;
    id = ids[(Math.random() * ids.length) | 0];
  }
  return set[id] || null;
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
  death: [/^death$/i, /^death_[ab]$/i, /death/i, /die|dead/i, /knock/i, /fall/i],
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
   * opts: fade, once, timeScale, startFrac (salta la frazione iniziale della clip, es. la parte in
   * cui il nemico resta ancora in piedi prima di crollare), fit (durata target in s del tratto
   * RIPRODOTTO: se il tratto è più lungo lo accelera, non lo rallenta → morte più rapida).
   */
  play(purpose, { fade = 0.22, once = false, timeScale = 1, startFrac = 0, fit = 0 } = {}) {
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
    // salto della parte iniziale + eventuale accelerazione per far combaciare il tratto a `fit`
    const startAt = THREE.MathUtils.clamp(startFrac, 0, 0.9) * clip.duration;
    const played = Math.max(0.05, clip.duration - startAt);
    let ts = timeScale;
    if (fit > 0 && played / ts > fit) ts = played / fit; // accelera se troppo lungo (mai rallenta)
    action.timeScale = ts;
    action.play();
    if (startAt > 0) action.time = startAt;
    this.current = action;
    this.currentPurpose = purpose;
    return played / Math.max(ts, 0.01);
  }

  update(dt) { this.mixer?.update(dt); }

  /** Sfasa la clip corrente a un punto casuale: rompe la sincronia tra nemici simili. */
  desync() {
    if (!this.current) return;
    const clip = this.current.getClip?.();
    if (clip) this.current.time = Math.random() * clip.duration;
  }
}
