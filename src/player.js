// Giocatore: movimento WASD, mira col mouse, 4 armi (proiettili reali con
// perforazione), ricarica, scatto con invulnerabilità, animazioni con pistola.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { Assets, Animator, makeProceduralSoldier, makeRifle } from './assets.js';
import { CONFIG, WEAPONS } from './config.js';
import { Audio } from './audio.js';
import { resolveCollisions } from './enemies.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1); // asse di riferimento per orientare i proiettili
const _xAxis = new THREE.Vector3(1, 0, 0); // fallback per la base quando si guarda quasi a piombo
const _bR = new THREE.Vector3(); // basi perpendicolari per il cono di spread 2D (FPS)
const _bU = new THREE.Vector3();
const _bDir = new THREE.Vector3();

// Texture morbida (gradiente radiale) per la "testa" luminosa del tracciante: alone soffuso,
// non un bordo netto. Creata una sola volta e condivisa tra tutti i proiettili.
let _softTex = null;
function softDotTexture() {
  if (_softTex) return _softTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad; c.fillRect(0, 0, 64, 64);
  _softTex = new THREE.CanvasTexture(cv);
  return _softTex;
}
// base ortonormale dello sguardo per il viewmodel FPS
const _vF = new THREE.Vector3();
const _vR = new THREE.Vector3();
const _vU = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _cTarget = new THREE.Vector3(); // convergenza viewmodel: punto di mira sul raggio di vista
const _cF = new THREE.Vector3();
const _cR = new THREE.Vector3();
const _cU = new THREE.Vector3();

// Trova un osso per nome (regex), qualunque sia il rig (Quaternius "Middle1.R" o Mixamo
// "mixamorig:RightHandMiddle1", con eventuale suffisso "_NNN").
const findBone = (root, re) => { let f = null; root.traverse((o) => { if (!f && re.test(o.name)) f = o; }); return f; };

// temp per il puntamento procedurale del braccio (aim a 1 osso)
const _aShoulder = new THREE.Vector3();
const _aHand = new THREE.Vector3();
const _aCur = new THREE.Vector3();
const _aDes = new THREE.Vector3();
const _aQd = new THREE.Quaternion();
const _aWorld = new THREE.Quaternion();
const _aParent = new THREE.Quaternion();
// direzione di tiro top-down = angolo reale (clampato) dell'arma
const _fireDir = new THREE.Vector3();
// temp per la rotazione della testa verso la mira
const _hQ = new THREE.Quaternion();
const _hWorld = new THREE.Quaternion();
const _hParent = new THREE.Quaternion();
const _worldUp = new THREE.Vector3(0, 1, 0);
// limiti realistici (rad) rispetto al busto. Il braccio è ASIMMETRICO: ampio verso il proprio
// lato (l'arma), stretto verso il petto (lato opposto) per non compenetrare il busto.
const MAX_ARM_OUT = 1.85;  // ~106° verso il lato dell'arma
const MAX_ARM_IN = 0.78;   // ~45° verso il petto (lato opposto)
const MAX_HEAD = 1.25;     // ~72° collo, simmetrico

// Campione di ricarica per arma (registrazioni reali CC0, corte).
const RELOAD_SOUNDS = { pistol: 'reload_pistol', shotgun: 'shotgun_pump', smg: 'reload_rifle', magnum: 'reload_pistol' };

// Dopo l'ULTIMO inserimento del fucile a pompa, lascia scorrere ancora questo tanto di clip (s) così
// la mano COMPLETA la spinta del bossolo nel portello prima che l'arma si abbassi: sennò la dissolvenza
// verso l'idle parte sul picco e taglia la spinta → "l'ultimo bossolo non si vede entrare".
const SHELL_FINISH = 0.45;

// Calibrazione dell'aggancio dell'arma alla mano. Anchor nel palmo (frazione polso->nocca)
// + offset fini nella base dell'arma (x=lato, y=su, z=avanti). lateralSign/upSign correggono
// l'orientamento se la base esce rovesciata. Esposto su window.__GUNCAL per il tuning live.
const GUN_CAL = { palm: 0.5, x: 0.0, y: -0.04, z: 0.02, lateralSign: 1, upSign: 1, muzzle: 0.5 };
if (typeof window !== 'undefined') window.__GUNCAL = GUN_CAL;

export class Player {
  constructor(game) {
    this.game = game;
    this.hp = CONFIG.player.hp;
    this.maxHp = CONFIG.player.hp;
    this.vel = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.dead = false;

    this.dashCharges = CONFIG.player.dashCharges;
    this.dashRegen = 0;
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.iframes = 0;

    this.weapons = { pistol: { mag: WEAPONS.pistol.mag, reserve: Infinity } };
    this.current = 'pistol';
    this.fireTimer = 0;
    this.reloadT = 0;
    this._stepHalf = -1; // metà del ciclo di camminata (per passi sincronizzati ai piedi)
    this.bullets = [];
    this._bulletMats = new Map();
    this._bloom = 0; // rinculo accumulato (rad di spread extra), rientra nel tempo
    // tracciante: capsula SOTTILE liscia (estremi arrotondati, niente "parallelepipedo") che TRAILA
    // dietro la testa luminosa (z<=0) come una vera scia di tracciante: dardo discreto e affusolato,
    // non una barra. Additiva ma tenue (vedi opacity in _fire). Più segmenti = curva pulita da vicino.
    this._bulletGeo = new THREE.CapsuleGeometry(0.02, 0.34, 4, 10).rotateX(Math.PI / 2).translate(0, 0, -0.19);
    this._bulletHaloMats = new Map(); // materiali sprite alone per colore (testa luminosa morbida)
    this._dashGhosts = []; // scia-fantasma del corpo durante lo scatto
    this._ghostT = 0;

    // ---- modello ----
    this.root = new THREE.Group();
    const entry = Assets.player;
    if (entry) {
      this.model = skeletonClone(entry.scene);
      this.model.scale.setScalar(entry.scale);
      this.model.rotation.y = entry.yaw;
      this.anim = new Animator(this.model, entry.animations);
      // Il modello "Sam" include un'ascia agganciata alla mano sinistra:
      // la nascondiamo perché equipaggeremo i modelli reali delle armi da fuoco.
      this.model.traverse((o) => {
        if (o.isMesh && /axe|sword|blade|knife|melee|hammer/i.test(o.name)) o.visible = false;
      });
      // mano (impugnatura) e avambraccio del braccio che mira: il braccio destro
      // è quello esteso nelle pose con arma. La direzione gomito->mano orienta l'arma.
      // nocca del medio (avanti nella mano) e polso (radice delle dita): rig Quaternius o Mixamo
      this.handBone = findBone(this.model, /(Middle1\.R|RightHandMiddle1)(_\d+)?$/i)
        || findBone(this.model, /(Middle1\.L|LeftHandMiddle1)(_\d+)?$/i);
      this.armBone = findBone(this.model, /(LowerArm\.R|RightHand)(_\d+)?$/i)
        || findBone(this.model, /(LowerArm\.L|LeftHand)(_\d+)?$/i);
      // indice e mignolo: la loro differenza dà l'asse laterale della mano -> ROLL reale
      this.indexBone = findBone(this.model, /(Index1\.R|RightHandIndex1)(_\d+)?$/i);
      this.pinkyBone = findBone(this.model, /(Pinky1\.R|RightHandPinky1)(_\d+)?$/i);
      // braccio superiore + avambraccio destri: per alzare e irrigidire il braccio verso la
      // mira quando il modello non ha una posa con arma (soldato Mixamo).
      this.aimArmBone = findBone(this.model, /(UpperArm\.R|RightArm)(_\d+)?$/i);
      this.aimForeBone = findBone(this.model, /(LowerArm\.R|RightForeArm)(_\d+)?$/i);
      // testa (per farla girare verso la mira): esclude "HeadTop_End"
      this.headBone = findBone(this.model, /(Head)(_\d+)?$/i);
      // se il modello ha pose con arma (es. Quaternius Idle_Gun) si aggancia alla mano;
      // altrimenti (es. soldato Mixamo, braccia ai fianchi) l'arma resta davanti al corpo.
      this._gunPosed = (entry.animations || []).some((c) => /gun|aim|rifle|ranged|shoot|pistol|combat/i.test(c.name));
    } else {
      this.model = makeProceduralSoldier();
      this.anim = new Animator(this.model, []);
      this.handBone = null;
      this.armBone = null;
      this.indexBone = null;
      this.pinkyBone = null;
      this.headBone = null;
    }
    // mira clampata rispetto al busto (niente contorsioni del braccio): valori smussati
    this._armRel = 0;   // offset yaw braccio/arma rispetto al corpo
    this._headRel = 0;  // offset yaw testa rispetto al corpo
    this._aimYaw = 0;   // yaw del braccio/arma in coordinate mondo (= corpo + _armRel)
    this._gunSide = 0;  // +1/-1: lato del braccio armato (misurato una volta), 0 = da misurare
    this._muzzleLocal = new THREE.Vector3(0, 0, 0.3); // punta canna in coordinate gunMount
    this.root.add(this.model);

    // L'arma vive nella scena: ogni frame la mettiamo sulla mano e la orientiamo
    // lungo l'avambraccio (segue posizione E rotazione reale del braccio animato).
    this.gunMount = new THREE.Group();
    this.gunMount.visible = false; // mostrata solo in partita (vedi _updateGun)
    game.scene.add(this.gunMount);
    this._gunPos = new THREE.Vector3();
    this._handPos = new THREE.Vector3();
    this._elbowPos = new THREE.Vector3();
    this._indexPos = new THREE.Vector3();
    this._pinkyPos = new THREE.Vector3();
    this._armDir = new THREE.Vector3();
    this._lat = new THREE.Vector3();
    this._anchor = new THREE.Vector3();
    this._ux = new THREE.Vector3();
    this._uy = new THREE.Vector3();
    this._uz = new THREE.Vector3();
    this._basis = new THREE.Matrix4();
    this._mountGun('pistol');

    // --- viewmodel prima persona: l'arma (con le mani guantate del rig) agganciata alla
    // camera, come in un vero FPS. Segue lo sguardo (yaw+pitch) con sway, bob e rinculo. ---
    this._fps = false;
    this._vmRecoil = 0;            // posizione del rinculo (molla): kick morbido + assestamento
    this._vmRecoilVel = 0;        // velocità della molla del rinculo (vedi _updateViewmodel)
    this._vmSwayX = 0; this._vmSwayY = 0; // l'arma insegue il mouse-look con ritardo
    this._vmBobT = 0;             // fase dell'ondeggio del passo
    this._vmBasis = new THREE.Matrix4();
    this._fwd = new THREE.Vector3(0, 0, 1); // direzione reale della canna (per il lampo FPS)
    // calibrazione viewmodel relativa allo sguardo: destra (x), giù (y<0), avanti (fwd),
    // muzzle = distanza della bocca della canna dalla base del viewmodel. Live: window.__VM
    this.VM = { x: 0.2, y: -0.19, fwd: 0.5, muzzle: 0.34, pitch: 0.04, recoilRot: 0.22 };
    if (typeof window !== 'undefined') window.__VM = this.VM;

    // luce calda personale: tiene leggibile l'eroe nel buio
    this.lamp = new THREE.PointLight(0xffd9a8, 2.6, 10, 1.7);
    this.lamp.position.set(0, 2.3, 0);
    this.root.add(this.lamp);

    game.scene.add(this.root);
    this.anim.play('idle');
  }

  get pos() { return this.root.position; }
  get weaponDef() { return WEAPONS[this.current]; }
  get ammo() { return this.weapons[this.current]; }

  /**
   * RIPIEGO per armi senza viewmodel:true (in gioco non ce ne sono più; resta come rete di
   * sicurezza): ruota l'arma (canna lungo +Z), la scala e la ricentra sull'impugnatura.
   * `handsOnly` tiene solo le eventuali mani/guanti del rig. Ritorna {wrap, gun, hands}.
   */
  _buildGunWrap(entry, handsOnly = false) {
    const animated = entry.animations && entry.animations.length > 0;
    // skeletonClone preserva lo scheletro per l'animazione delle parti (carrello/caricatore/mani)
    const gun = animated ? skeletonClone(entry.scene) : entry.scene.clone();
    const hands = [];
    const gunBox = new THREE.Box3();
    gun.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (/hand|glove/i.test(o.name)) {
        // pelle nuda dell'avambraccio: con gloveOnly la nascondo (tengo solo il guanto, che
        // copre mano+polso) → niente avambraccio "tagliato" a vista (l'osso aperto del gomito).
        if (entry.gloveOnly && !/glove/i.test(o.name)) { o.visible = false; return; }
        hands.push(o); return;
      }
      o.updateWorldMatrix(true, false);
      gunBox.expandByObject(o);
    });
    if (handsOnly) { // mani in prestito: nascondi tutte le parti dell'arma, tieni solo le mani
      gun.traverse((o) => { if (o.isMesh && !/hand|glove/i.test(o.name)) o.visible = false; });
    }
    const size = gunBox.getSize(_v1);
    // orientazione canna: usa l'hint esplicito entry.axis se presente, sennò l'asse più lungo
    // (euristica fragile su pistole tozze: una pistola può essere più ALTA che lunga → ruotata a
    // sproposito; per questo i modelli realistici dichiarano axis:'z', canna già lungo +Z).
    const axis = entry.axis
      || (size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.x && size.y >= size.z ? 'y' : 'z'));
    if (axis === 'x') gun.rotation.y = -Math.PI / 2;
    else if (axis === 'y') gun.rotation.x = Math.PI / 2;
    // 'z' = nessuna rotazione (canna già allineata a +Z)
    if (entry.flip) gun.rotateY(Math.PI); // modello con la canna verso -Z → girala a +Z
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    gun.scale.setScalar(entry.length / maxDim);
    const wrap = new THREE.Group();
    wrap.add(gun);
    // ricentra sulla sola arma (escluse le mani), poi spingi avanti sull'impugnatura
    gun.updateWorldMatrix(true, true);
    const gb2 = new THREE.Box3();
    gun.traverse((o) => { if (o.isMesh && !/hand|glove/i.test(o.name)) gb2.expandByObject(o); });
    gun.position.sub(gb2.getCenter(_v2));
    gun.position.z += entry.length * 0.42;
    return { wrap, gun, hands, animated, maxDim };
  }

  _mountGun(id) {
    this._gunMixer = null; this._gunClips = null; this._gunShoot = null; this._gunReload = null; this._gunHands = null;
    this._gunReloadFull = null; this._gunDraw = null;
    this._gunIdle = null; this._gunShootFit = 0.13; this._gunCurAction = null; this._shellInsertTimes = null;
    while (this.gunMount.children.length) this.gunMount.remove(this.gunMount.children[0]);
    const def = WEAPONS[id];
    const entry = Assets.guns.get(id);
    this._vmShift = (entry && entry.vmShift) || null;
    // viewmodel FPS completo (braccia+arma in un unico rig): gestione dedicata (misura, scala,
    // idle in loop; ricarica a colpo singolo solo per il fucile a pompa, def.shellReload).
    if (entry && entry.viewmodel) { this._mountViewmodel(entry, def); return; }
    // ramo di RIPIEGO (in gioco tutte le armi sono viewmodel:true): arma "nuda" agganciata al
    // mount, con eventuali clip proprie di sparo/ricarica se il modello le porta.
    if (entry) {
      const built = this._buildGunWrap(entry);
      const { wrap, gun, hands, animated } = built;
      // le mani fanno da VIEWMODEL in prima persona (visibili solo in FPS); in top-down restano
      // nascoste e si usa il braccio del soldato.
      this.gunMount.add(wrap);
      this._gunHands = hands;
      for (const h of this._gunHands) h.visible = !!this._fps; // mani visibili solo in FPS
      if (animated) {
        this._gunMixer = new THREE.AnimationMixer(gun);
        this._gunClips = entry.animations;
        const shoot = entry.animations.find((c) => /shoot|fire/i.test(c.name));
        const reload = entry.animations.find((c) => /reload/i.test(c.name));
        // alcune serie di clip stanno su una timeline condivisa (keyframe solo nella propria
        // finestra): estraggo la finestra reale di ciascuna (min..max) e la ribaso a 0.
        this._gunShoot = shoot ? this._trimClip(shoot, 'shoot') : null;
        this._gunReload = reload ? this._trimClip(reload, 'reload') : null;
      }
    } else {
      const gun = makeRifle();
      gun.scale.setScalar(def.slot === 1 ? 0.7 : 1);
      gun.position.z += 0.2;
      this.gunMount.add(gun);
    }
    this._computeMuzzleLocal();
  }

  /**
   * Monta un VIEWMODEL FPS completo (braccia+mani+arma in un solo rig skinnato): tutte e 4 le armi.
   * Misura la geometria in posa idle (la bind-pose di questi rig è "esplosa" e inutilizzabile),
   * scala la canna a entry.length, classifica arma vs braccia (entry.gunRe sui nomi dei MATERIALI,
   * o euristica geometrica), raddrizza i rig esportati verso -Z, calcola la bocca e fa girare
   * l'idle in loop. Sparo/ricarica/estrazione interrompono e poi tornano a idle in dissolvenza.
   */
  _mountViewmodel(entry, def) {
    const model = skeletonClone(entry.scene);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    let clips = entry.animations || [];
    // timeline UNICA (es. revolver bumstrum: una sola clip con tutte le azioni in fila):
    // entry.clipWindows = { idle:[t0,t1], shoot:[..], reload:[..], draw:[..] } in SECONDI →
    // la affetto in clip nominate; la selezione per scopo sotto procede come per clip separate.
    if (entry.clipWindows && clips.length === 1) {
      clips = Object.entries(entry.clipWindows).map(([nm, [t0, t1]]) =>
        THREE.AnimationUtils.subclip(clips[0], nm, Math.round(t0 * 100), Math.round(t1 * 100), 100));
    }
    const idle = clips.find((c) => /idle|watch/i.test(c.name)) || clips[0];
    const mixer = new THREE.AnimationMixer(model);
    // posa idle per misurare la geometria SKINNATA (computeBoundingBox usa i vertici deformati)
    if (idle) { mixer.clipAction(idle).play(); mixer.update(0.3); }
    const measure = () => {
      model.updateMatrixWorld(true);
      const out = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        const box = new THREE.Box3();
        if (o.isSkinnedMesh) { o.computeBoundingBox(); box.copy(o.boundingBox); }
        else { o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox); }
        box.applyMatrix4(o.matrixWorld);
        out.push({ o, box, sz: box.getSize(new THREE.Vector3()) });
      });
      return out;
    };
    // classificazione ARMA vs BRACCIA. Coi gunRe: matcha i MATERIALI (i nomi mesh a runtime sono
    // "Object_N": GLTFLoader li sovrascrive col nome del nodo; i nomi materiale invece restano).
    // Senza gunRe (ripiego): canna = mesh più lunga in Z, braccia = mesh nettamente più larghe.
    const matName = (o) => {
      const m = o.material;
      return (Array.isArray(m) ? m.map((x) => x && x.name).join(' ') : (m && m.name) || '') + ' ' + o.name;
    };
    const classify = (metas) => {
      let gunParts, arms;
      if (entry.gunRe) {
        gunParts = metas.filter((m) => entry.gunRe.test(matName(m.o)));
        arms = metas.filter((m) => !gunParts.includes(m)).map((m) => m.o);
        // regex che non matcha niente: tutto-arma e niente braccia (mai mesh nascoste a vuoto)
        if (!gunParts.length) { gunParts = metas; arms = []; }
      } else {
        let g = metas[0];
        for (const m of metas) if (m.sz.z > g.sz.z) g = m;
        arms = metas.filter((m) => m !== g && m.sz.x > Math.max(0.2, g.sz.x * 1.6)).map((m) => m.o);
        gunParts = metas.filter((m) => !arms.includes(m.o));
      }
      // unione dei box di TUTTE le mesh dell'arma: le armi spezzate in più mesh (corpo +
      // silenziatore, slitta + fusto) altrimenti verrebbero scalate/centrate su un pezzo solo
      // (mitra gigante, impugnatura sotto il bordo dello schermo).
      const gunBox = new THREE.Box3();
      for (const m of gunParts) gunBox.union(m.box);
      return { gunParts, gunBox, arms };
    };
    let metas = measure();
    let { gunParts, gunBox, arms } = classify(metas);
    // AUTO-FLIP: alcuni rig sono esportati con la canna verso -Z (dipende dall'autore). In un
    // viewmodel le braccia stanno DIETRO l'arma: se il centro delle braccia risulta DAVANTI al
    // centro dell'arma, il rig guarda -Z → lo giro di 180° e rimisuro.
    if (arms.length) {
      const armsBox = new THREE.Box3();
      for (const m of metas) if (arms.includes(m.o)) armsBox.union(m.box);
      const armsC = armsBox.getCenter(new THREE.Vector3());
      const gunC = gunBox.getCenter(new THREE.Vector3());
      if (armsC.z > gunC.z) {
        model.rotation.y = Math.PI;
        metas = measure();
        ({ gunParts, gunBox, arms } = classify(metas));
      }
    }
    // scala: lunghezza dell'arma intera -> entry.length (la canna è comunque lungo +Z).
    const gunSz = gunBox.getSize(_v1);
    const scale = entry.length / Math.max(gunSz.z, 0.01);
    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.scale.setScalar(scale);
    const gc = gunBox.getCenter(_v2);
    const adj = entry.vmAdjust || {};
    wrap.position.set(
      -gc.x * scale + (adj.x || 0),
      -gc.y * scale + (adj.y || 0),
      -gc.z * scale + entry.length * 0.05 + (adj.z || 0),
    );
    this.gunMount.add(wrap);
    this._vmWrap = wrap; // per la calibrazione live
    // bocca = fronte (max z) dell'arma. La LINEA DI CANNA è il centro Y del pezzo PIÙ AVANZATO
    // (quello che contiene il fronte: canna/silenziatore) — robusto anche quando il box totale
    // include l'impugnatura che pende sotto. entry.muzzleY (frazione 0..1 dell'altezza
    // dell'unione) lo sovrascrive se serve.
    let front = gunParts[0];
    for (const m of gunParts) if (m.box.max.z > front.box.max.z) front = m;
    const muzY = entry.muzzleY != null
      ? gunBox.min.y + (gunBox.max.y - gunBox.min.y) * entry.muzzleY
      : (front.box.min.y + front.box.max.y) / 2;
    this._muzzleLocal.set(
      (front.box.min.x + front.box.max.x) / 2,
      muzY,
      gunBox.max.z,
    ).multiplyScalar(scale).add(wrap.position);
    // braccia = "mani" (visibili solo in FPS; in top-down resta l'arma sul braccio del soldato)
    this._gunHands = arms;
    for (const h of arms) h.visible = !!this._fps;
    // animazioni: idle in loop; sparo/ricarica/estrazione una volta poi ritorno a idle
    this._gunMixer = mixer;
    this._gunClips = clips;
    this._gunIdle = idle;
    this._gunShoot = clips.find((c) => /shot|fire|shoot/i.test(c.name)) || null;
    // due ricariche autorali: "fast/tactical" (cambio caricatore, ce n'è ancora uno in canna) e
    // "full/empty" (arma VUOTA: sblocco del carrello compreso). A caricatore vuoto startReload
    // usa la full; nomenclatura per autore: Cransh "Reload_full", 1Matzh "Reload_Empty".
    const reloads = clips.filter((c) => /reload/i.test(c.name));
    this._gunReload = reloads.find((c) => !/full|empty/i.test(c.name)) || reloads[0] || null;
    this._gunReloadFull = reloads.find((c) => /full|empty/i.test(c.name)) || null;
    // estrazione (Draw/Equip, NON Unequip): riprodotta al cambio arma, poi idle.
    this._gunDraw = clips.find((c) => /draw|(?<!un)equip/i.test(c.name)) || null;
    // Solo per la ricarica a COLPO SINGOLO del fucile a pompa (def.shellReload): la clip mostra
    // ~4 inserimenti ma il caricatore è 6 → duplico 2 volte UN ciclo di caricamento dentro la clip
    // (finestra [1.10,2.47]s = un ciclo intero, giunzione alla stessa fase → fluida) e ricavo gli
    // istanti di inserimento nella clip estesa (_shellInsertTimes: suono e +1 al caricatore
    // scattano quando l'animazione li raggiunge, vedi update → in fase col gesto, non su un timer).
    // _playGunAnim gira la clip estesa in mag*shellTime (shellTime in config tiene il gesto ≈1.62×).
    const RL_INS = [1.06, 2.43, 3.77, 5.07]; // inserimenti nella clip ORIGINALE (picchi mano al portello)
    const RL_T0 = 1.10, RL_T1 = 2.47, RL_COPIES = 2;
    if (def && def.shellReload && this._gunReload) {
      this._gunReload = this._extendReloadClip(this._gunReload, RL_T0, RL_T1, RL_COPIES);
      this._shellInsertTimes = this._extendedInsertTimes(RL_INS, RL_T0, RL_T1, RL_COPIES);
    }
    this._gunShootFit = entry.shootFit || 0.4;
    mixer.addEventListener('finished', () => this._playIdle());
    this._playIdle();
    // estrazione al cambio arma: parte sopra l'idle appena impostato e vi ritorna da sola
    if (this._gunDraw) {
      const fit = Math.min(this._gunDraw.duration, 0.45);
      this._playGunAnim(this._gunDraw, fit);
      this.fireTimer = Math.max(this.fireTimer || 0, fit * 0.7); // niente sparo a metà estrazione
    }
  }

  /**
   * Torna all'idle in loop del viewmodel con una DISSOLVENZA dall'animazione corrente (sparo/
   * ricarica), così la fine ricarica non "scatta" bruscamente ma riabbassa l'arma in modo fluido.
   */
  _playIdle() {
    if (!this._gunMixer || !this._gunIdle) return;
    const idle = this._gunMixer.clipAction(this._gunIdle);
    const prev = this._gunCurAction;
    idle.reset(); idle.setLoop(THREE.LoopRepeat, Infinity); idle.enabled = true; idle.play();
    if (prev && prev !== idle && prev.isRunning()) prev.crossFadeTo(idle, 0.35, false); // dissolvenza morbida
    else idle.setEffectiveWeight(1);
    this._gunCurAction = idle;
  }

  /** Ritaglia una clip alla finestra reale dei suoi keyframe (min..max @30fps) e la ribasa a 0. */
  _trimClip(clip, name) {
    let mn = Infinity, mx = 0;
    for (const t of clip.tracks) {
      if (!t.times.length) continue;
      mn = Math.min(mn, t.times[0]);
      mx = Math.max(mx, t.times[t.times.length - 1]);
    }
    if (!isFinite(mn)) return clip.clone();
    return THREE.AnimationUtils.subclip(clip.clone(), name, Math.floor(mn * 30), Math.ceil(mx * 30) + 1, 30);
  }

  /**
   * Allunga una clip duplicando `copies` volte il ciclo di keyframe [t0,t1] (secondi) e inserendolo
   * subito dopo t1 → la clip "ripete" quel gesto altre `copies` volte, restando UNA clip continua
   * (nessun loop a runtime, nessuno scatto se t0 e t1 sono la stessa posa). Per ogni traccia: tiene i
   * keyframe ≤ t1, poi le copie del segmento (t0,t1] sfasate di k·(t1−t0), poi il resto sfasato di
   * copies·(t1−t0). Usato per portare la ricarica del fucile a pompa da ~4 a 6 inserimenti VISIBILI.
   */
  _extendReloadClip(clip, t0, t1, copies) {
    try {
      const dt = t1 - t0, eps = 1e-4;
      const out = clip.clone();
      for (const track of out.tracks) {
        const T = track.times, V = track.values;
        const stride = V.length / T.length;
        const nt = [], nv = [];
        const push = (time, i) => { nt.push(time); for (let s = 0; s < stride; s++) nv.push(V[i * stride + s]); };
        for (let i = 0; i < T.length; i++) if (T[i] <= t1 + eps) push(T[i], i);                 // A: ≤ t1
        for (let k = 1; k <= copies; k++)                                                        // copie del ciclo
          for (let i = 0; i < T.length; i++) if (T[i] > t0 + eps && T[i] <= t1 + eps) push(T[i] + k * dt, i);
        for (let i = 0; i < T.length; i++) if (T[i] > t1 + eps) push(T[i] + copies * dt, i);     // B: resto sfasato
        track.times = new Float32Array(nt);
        track.values = new Float32Array(nv);
      }
      out.resetDuration();
      return out;
    } catch (e) {
      return clip; // in caso di clip con struttura inattesa, meglio l'originale che un crash
    }
  }

  /**
   * Dove finiscono gli istanti di inserimento dopo _extendReloadClip (stessa logica A/copie/B): serve
   * a far scattare suono+caricatore in fase col gesto. Ritorna i tempi (s) ordinati nella clip estesa.
   */
  _extendedInsertTimes(inserts, t0, t1, copies) {
    const dt = t1 - t0, out = [];
    for (const x of inserts) if (x <= t1) out.push(x);                                  // A
    for (let k = 1; k <= copies; k++) for (const x of inserts) if (x > t0 && x <= t1) out.push(x + k * dt); // copie
    for (const x of inserts) if (x > t1) out.push(x + copies * dt);                     // B
    return out.sort((a, b) => a - b);
  }

  /**
   * Calcola la punta della canna (centro-fronte della mesh dell'arma) in coordinate gunMount,
   * così l'origine dei proiettili/lampo combacia con la bocca reale dell'arma in ogni visuale.
   */
  _computeMuzzleLocal() {
    this.gunMount.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(this.gunMount.matrixWorld).invert();
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    let found = false;
    // escludi mani/guanti E il caricatore (che pende sotto): la bocca sta in alto sulla canna,
    // non al centro verticale dell'intera arma.
    this.gunMount.traverse((o) => {
      // escludi mani/caricatore E le mesh nascoste
      if (!o.isMesh || !o.visible || /hand|glove|mag/i.test(o.name) || !o.geometry) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
        v.applyMatrix4(o.matrixWorld).applyMatrix4(inv); // -> coordinate gunMount
        box.expandByPoint(v);
        found = true;
      }
    });
    // bocca: fronte (max z), centro laterale, verso l'alto sulla linea della canna (~78% altezza)
    if (found) this._muzzleLocal.set((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.78, box.max.z);
    else this._muzzleLocal.set(0, 0, 0.3);
  }

  /** Riproduce una clip dell'arma (sparo/ricarica) una volta, adattata al tempo voluto. */
  _playGunAnim(clip, fitTime) {
    if (!this._gunMixer || !clip) return;
    this._gunMixer.stopAllAction(); // niente blending tra sparo e ricarica sullo stesso rig
    const a = this._gunMixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = clip.duration / Math.max(fitTime, 0.05);
    a.setEffectiveWeight(1);
    a.play();
    this._gunCurAction = a; // per la dissolvenza verso l'idle (vedi _playIdle)
  }

  /**
   * Aggancia l'arma alla mano seguendone posizione E rotazione reali (roll compreso).
   * La base ortonormale è costruita dalle ossa: canna = polso->nocca, lato = mignolo->indice.
   * Così l'arma resta saldata nel pugno in ogni posa (idle/cammina/corri) e ne segue
   * la modulazione del braccio con precisione. L'arma è ancorata nel palmo, non sulla nocca.
   */
  /**
   * Aim procedurale a 1 osso: ruota il braccio superiore destro così che il braccio
   * (spalla->mano) punti verso il cursore, sollevando l'arma in posizione di tiro.
   * Usato solo per i modelli senza posa con arma (es. soldato Mixamo). Va chiamato dopo
   * anim.update e prima di _updateGun.
   */
  _aimArm() {
    const arm = this.aimArmBone, hand = this.handBone || this.armBone;
    if (!arm || !hand || !arm.parent) return;
    // avambraccio rigido: annulla l'oscillazione del braccio data dalla clip di cammino
    if (this.aimForeBone) this.aimForeBone.quaternion.set(0, 0, 0, 1);
    arm.getWorldPosition(_aShoulder);
    hand.getWorldPosition(_aHand); // riflette l'avambraccio appena raddrizzato
    _aCur.subVectors(_aHand, _aShoulder);
    if (_aCur.lengthSq() < 1e-6) return;
    _aCur.normalize();
    // direzione desiderata CLAMPATA rispetto al busto (this._aimYaw): il braccio non si
    // contorce mai oltre l'angolo massimo della spalla. Lievemente verso il basso.
    _aDes.set(Math.sin(this._aimYaw), -0.2, Math.cos(this._aimYaw)).normalize();
    _aQd.setFromUnitVectors(_aCur, _aDes);
    arm.getWorldQuaternion(_aWorld);
    _aWorld.premultiply(_aQd);                       // nuova orientazione mondo = qDelta * arm
    arm.parent.getWorldQuaternion(_aParent);
    arm.quaternion.copy(_aParent.invert().multiply(_aWorld)); // -> locale
  }

  /** Gira la testa di `rel` radianti verso la mira (yaw attorno alla verticale del mondo). */
  _aimHead(rel) {
    const head = this.headBone;
    if (!head || !head.parent) return;
    _hQ.setFromAxisAngle(_worldUp, rel);
    head.getWorldQuaternion(_hWorld);
    _hWorld.premultiply(_hQ);                 // ruota l'orientazione mondo della testa
    head.parent.getWorldQuaternion(_hParent);
    head.quaternion.copy(_hParent.invert().multiply(_hWorld)); // -> locale
  }

  /**
   * Viewmodel FPS in coordinate mondo: l'arma vive davanti agli occhi, orientata lungo lo
   * sguardo come in un vero FPS. La canna (asse +Z locale dell'arma) viene allineata alla
   * direzione di vista F: lo stesso meccanismo, affidabile, usato in terza persona. Aggiunge
   * sway col mouse-look, bob in camminata e rinculo a ogni colpo.
   */
  _updateViewmodel(dt) {
    const g = this.game, vm = this.VM;
    const yaw = g.fpsYaw, pitch = g.fpsPitch, cp = Math.cos(pitch);
    // base ortonormale destrorsa dello sguardo: F avanti, R destra, U su
    const F = _vF.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
    const R = _vR.crossVectors(_vUp, F).normalize();
    const U = _vU.crossVectors(F, R).normalize();

    // sway: l'arma insegue lo sguardo con ritardo
    const swTX = THREE.MathUtils.clamp(-g.input.lookDX * 0.0006, -0.06, 0.06);
    const swTY = THREE.MathUtils.clamp(-g.input.lookDY * 0.0006, -0.05, 0.05);
    this._vmSwayX = THREE.MathUtils.damp(this._vmSwayX, swTX, 9, dt);
    this._vmSwayY = THREE.MathUtils.damp(this._vmSwayY, swTY, 9, dt);

    // bob: ondeggio del passo quando si cammina/corre (non durante lo scatto)
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let bobX = 0, bobY = 0;
    if (this.dashT <= 0 && speed > 0.8) {
      this._vmBobT += dt * (speed > 5.5 ? 13 : 9);
      const amp = Math.min(speed / 8, 1) * 0.02;
      bobX = Math.cos(this._vmBobT) * amp;
      bobY = Math.abs(Math.sin(this._vmBobT)) * amp;
    } else {
      this._vmBobT += dt * 1.6;
      bobY = Math.sin(this._vmBobT) * 0.004; // respiro a riposo
    }

    // rinculo come MOLLA smorzata: il colpo dà un IMPULSO alla velocità (_fire), qui la molla
    // riporta dolcemente a 0 con un piccolo overshoot → kick fluido e assestamento "professionale",
    // niente più scatto istantaneo. Integrata a SUB-STEP fissi (~8ms) così è identica e stabile a
    // qualunque framerate (anche a dt alto / cali di fps). K=rigidità, C=smorzamento (ζ≈0.74: vivo).
    {
      const K = 260, C = 24;
      const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this._vmRecoilVel += (-K * this._vmRecoil - C * this._vmRecoilVel) * h;
        this._vmRecoil += this._vmRecoilVel * h;
      }
    }
    const rec = this._vmRecoil;

    // posizione: occhio (altezza camera) + offset lungo la base dello sguardo
    const eyeY = 1.62;
    _v1.set(0, 0, 0)
      .addScaledVector(R, vm.x + this._vmSwayX + bobX)
      .addScaledVector(U, vm.y + this._vmSwayY + bobY + rec * 0.03)
      .addScaledVector(F, vm.fwd - rec * 0.10);
    // spostamento per-arma nel frame della camera (es. abbassa il fucile a pompa così volata e
    // mani stanno sotto il centro dello schermo, vedi vmShift nel MANIFEST).
    const sh = this._vmShift;
    if (sh) _v1.addScaledVector(R, sh.x || 0).addScaledVector(U, sh.y || 0).addScaledVector(F, sh.z || 0);
    this.gunMount.position.set(this.pos.x + _v1.x, eyeY + _v1.y, this.pos.z + _v1.z);

    // orientamento con CONVERGENZA sul mirino: la canna (+Z locale) non resta parallela allo
    // sguardo (e quindi spostata di lato), ma punta verso un punto sul RAGGIO DI VISTA (occhio +
    // F*dist). Quel punto si proietta esattamente sul mirino, quindi la volata "guarda" il mirino
    // per tutte le armi. (I proiettili partono comunque lungo F, vedi _fwd.)
    const aimDist = 30;
    _cTarget.set(this.pos.x + F.x * aimDist, eyeY + F.y * aimDist, this.pos.z + F.z * aimDist);
    const cF = _cF.subVectors(_cTarget, this.gunMount.position).normalize();
    const cR = _cR.crossVectors(_vUp, cF).normalize();
    const cU = _cU.crossVectors(cF, cR).normalize();
    this._vmBasis.makeBasis(cR, cU, cF);
    this.gunMount.quaternion.setFromRotationMatrix(this._vmBasis);
    this.gunMount.rotateX(-(rec * vm.recoilRot)); // solo rinculo (la convergenza alza già la volata)
    this.gunMount.rotateY(-this._vmSwayX * 0.6);

    // bocca REALE dell'arma (dalla geometria) in coordinate mondo: origine di proiettili e lampo
    this.gunMount.updateMatrix();
    this._gunPos.copy(this._muzzleLocal).applyMatrix4(this.gunMount.matrix);
    this._fwd.copy(F);
  }

  _updateGun(dt = 0) {
    this.gunMount.visible = !this.dead;
    if (this.dead) return;
    if (this._fps) { this._updateViewmodel(dt); return; }
    if (this.handBone && this.armBone && this._gunPosed) {
      this.handBone.getWorldPosition(this._handPos);    // nocca del medio
      this.armBone.getWorldPosition(this._elbowPos);     // polso
      // +Z (canna) = direzione della mano (polso -> nocca)
      this._armDir.subVectors(this._handPos, this._elbowPos);
      if (this._armDir.lengthSq() < 1e-6) this._armDir.set(this.aimDir.x, 0, this.aimDir.z);
      const z = this._uz.copy(this._armDir).normalize();

      // asse laterale della mano dalle dita (mignolo -> indice): porta il ROLL reale del polso.
      // Fallback al "su" del mondo se le ossa delle dita mancano.
      const cal = GUN_CAL;
      let haveLat = false;
      if (this.indexBone && this.pinkyBone) {
        this.indexBone.getWorldPosition(this._indexPos);
        this.pinkyBone.getWorldPosition(this._pinkyPos);
        this._lat.subVectors(this._indexPos, this._pinkyPos).multiplyScalar(cal.lateralSign);
        haveLat = this._lat.lengthSq() > 1e-7;
      }
      let x;
      if (haveLat) {
        // x = lato ortogonalizzato rispetto alla canna
        x = this._ux.copy(this._lat).addScaledVector(z, -this._lat.dot(z));
        if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
        x.normalize();
      } else {
        x = this._ux.crossVectors(this._uy.set(0, 1, 0), z);
        if (x.lengthSq() < 1e-5) x.set(1, 0, 0);
        x.normalize();
      }
      const y = this._uy.crossVectors(z, x).multiplyScalar(cal.upSign).normalize();
      // ricomponi x per garantire una terna destrorsa pulita
      x.crossVectors(y, z).normalize();
      this._basis.makeBasis(x, y, z);

      // ancora nel palmo (tra polso e nocca) + calibrazione fine nella base dell'arma
      this._anchor.lerpVectors(this._elbowPos, this._handPos, cal.palm);
      this.gunMount.position.copy(this._anchor)
        .addScaledVector(x, cal.x).addScaledVector(y, cal.y).addScaledVector(z, cal.z);
      this.gunMount.quaternion.setFromRotationMatrix(this._basis);
      // bocca REALE della canna (dalla geometria, this._muzzleLocal) come in FPS: il lampo e i
      // proiettili partono esattamente dalla volata, non da un punto stimato davanti alla mano.
      this.gunMount.updateMatrix();
      this._gunPos.copy(this._muzzleLocal).applyMatrix4(this.gunMount.matrix);
    } else if (this.armBone || this.handBone) {
      // mano trovata ma senza posa con arma (soldato Mixamo): arma ANCORATA al polso, orientata
      // lungo l'angolo del braccio CLAMPATO (this._aimYaw), così segue il braccio senza contorcersi.
      (this.armBone || this.handBone).getWorldPosition(this._handPos);
      this.gunMount.position.copy(this._handPos);
      this.gunMount.position.y += 0.04;
      this.gunMount.rotation.set(0, this._aimYaw, 0);
      this.gunMount.updateMatrix();
      this._gunPos.copy(this._muzzleLocal).applyMatrix4(this.gunMount.matrix); // bocca reale
    } else {
      // fallback procedurale (nessuno scheletro): arma davanti al corpo
      this._gunPos.set(
        this.pos.x + this.aimDir.x * 0.52 + this.aimDir.z * 0.14,
        1.22,
        this.pos.z + this.aimDir.z * 0.52 - this.aimDir.x * 0.14,
      );
      this.gunMount.position.copy(this._gunPos);
      this.gunMount.rotation.set(0, Math.atan2(this.aimDir.x, this.aimDir.z), 0);
    }
  }

  giveWeapon(id) {
    const def = WEAPONS[id];
    if (this.weapons[id]) {
      this.weapons[id].reserve = Math.min((this.weapons[id].reserve || 0) + def.reserve, def.maxReserve ?? Infinity);
    } else {
      this.weapons[id] = { mag: def.mag, reserve: def.reserve };
    }
    this.switchTo(id);
    Audio.play('weapon_pickup', { vol: 0.9 });
    this.game.ui.toast(`${def.name} OTTENUTO!`);
    this.game.ui.weapons(this);
  }

  addAmmo() {
    for (const [id, w] of Object.entries(this.weapons)) {
      const def = WEAPONS[id];
      if (def.maxReserve) w.reserve = Math.min(w.reserve + Math.ceil(def.maxReserve * 0.4), def.maxReserve);
    }
    this.game.ui.ammo(this);
  }

  heal(x) {
    this.hp = Math.min(this.maxHp, this.hp + x);
    this.game.ui.health(this.hp, this.maxHp);
  }

  switchTo(id) {
    if (!this.weapons[id] || this.current === id || this.dead) return;
    this.current = id;
    this.reloadT = 0;
    this._shellReloading = false; // annulla un'eventuale ricarica a colpo singolo in corso
    this.fireTimer = Math.max(this.fireTimer, 0.12);
    this._mountGun(id);
    Audio.play('click', { vol: 0.6 });
    this.game.ui.weapons(this);
    this.game.ui.ammo(this);
  }

  startReload() {
    const def = this.weaponDef;
    const w = this.ammo;
    if (this.reloadT > 0 || this._shellReloading || w.mag >= def.mag || w.reserve <= 0 || this.dead) return;
    // ricarica a COLPO SINGOLO (fucile a pompa): carica un bossolo alla volta, interrompibile.
    if (def.shellReload) {
      this._shellReloading = true;
      this._shellNext = 0; // prossimo inserimento da contabilizzare (in fase con la clip, vedi update)
      this._shellDone = false; // l'ultimo bossolo è entrato: si attende che il gesto si completi
      // l'intera clip di caricamento scorre nel tempo di un caricatore pieno → pacing naturale
      this._playGunAnim(this._gunReload, def.mag * def.shellTime);
      Audio.play('shotgun_pump', { vol: 0.55, pitchVar: 0.05 });
      this.game.ui.reloading(true);
      return;
    }
    // a caricatore VUOTO usa la ricarica "full/empty" autorale (sblocco carrello compreso), un
    // filo più lunga (def.reloadFull); col colpo in canna la "fast/tactical" (def.reload).
    const empty = w.mag <= 0 && this._gunReloadFull;
    const dur = empty ? (def.reloadFull || def.reload * 1.25) : def.reload;
    this.reloadT = dur;
    Audio.play(RELOAD_SOUNDS[this.current] || 'reload_pistol', { vol: 0.85, pitchVar: 0.04 });
    this._playGunAnim(empty ? this._gunReloadFull : this._gunReload, dur); // gesto scalato sul tempo arma
    this.game.ui.reloading(true);
  }

  /** Termina la ricarica a colpo singolo (mag pieno / riserva finita / annullata sparando). */
  _endShellReload() {
    if (!this._shellReloading) return;
    this._shellReloading = false;
    this.game.ui.reloading(false);
    this._playIdle(); // torna alla posa di pronti (il viewmodel ha l'idle in loop)
  }

  takeDamage(dmg, fromPos) {
    if (this.dead || this.iframes > 0) return;
    this.hp -= dmg;
    this.iframes = 0.45;
    const g = this.game;
    g.effects.addTrauma(0.42);
    if (g.opt.blood) g.effects.blood(_v1.set(this.pos.x, 1.2, this.pos.z), _v2.set(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z).normalize(), 8);
    Audio.play('hurt', { vol: 0.9, pitchVar: 0.08, volVar: 0.12 });
    g.ui.damageFlash();
    g.ui.health(this.hp, this.maxHp);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.anim.play('death', { once: true }) ?? null;
      g.onPlayerDied();
    }
  }

  /** aim = punto di mira sul terreno (Vector3). */
  update(dt, input, aim, enemies) {
    const g = this.game;
    this.anim.update(dt);
    this._updateDashGhosts(dt); // le scie-fantasma svaniscono anche da morto
    if (this._gunMixer) this._gunMixer.update(dt); // animazioni dell'arma (carrello/caricatore)
    if (this.dead) { this.gunMount.visible = false; this._updateBullets(dt, enemies); return; }

    this.iframes = Math.max(0, this.iframes - dt);
    this._bloom = THREE.MathUtils.damp(this._bloom, 0, 7, dt); // il rinculo rientra (cerchio che torna)

    // ---- mira ---- (la canna punta sempre verso il cursore; il corpo si orienta dopo,
    // verso la mira se fermo o verso la direzione di marcia se cammina)
    this.aimDir.set(aim.x - this.pos.x, 0, aim.z - this.pos.z);
    if (this.aimDir.lengthSq() > 0.01) this.aimDir.normalize();

    // ---- scatto ----
    if (this.dashRegen > 0) {
      this.dashRegen -= dt;
      if (this.dashRegen <= 0 && this.dashCharges < CONFIG.player.dashCharges) {
        this.dashCharges++;
        if (this.dashCharges < CONFIG.player.dashCharges) this.dashRegen = CONFIG.player.dashCooldown;
        g.ui.stamina(this.dashCharges);
      }
    }

    // ---- movimento ----
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const ml = Math.hypot(mx, mz) || 1;
    // direzione di movimento desiderata; in FPS è relativa allo sguardo (W = avanti)
    let tx = mx / ml, tz = mz / ml;
    if (g.viewMode === 'fps') {
      const fx = this.aimDir.x, fz = this.aimDir.z; // avanti
      const rx = -fz, rz = fx;                       // destra (A/D)
      tx = (fx * (-mz) + rx * mx) / ml;
      tz = (fz * (-mz) + rz * mx) / ml;
    }

    if ((input.wasPressed('ShiftLeft') || input.wasPressed('Space')) && this.dashCharges > 0 && this.dashT <= 0) {
      this.dashCharges--;
      if (this.dashRegen <= 0) this.dashRegen = CONFIG.player.dashCooldown;
      this.dashT = CONFIG.player.dashTime;
      this.iframes = Math.max(this.iframes, CONFIG.player.dashIFrames);
      this.dashDir.set(moving ? tx : this.aimDir.x, 0, moving ? tz : this.aimDir.z);
      Audio.play('dash', { vol: 0.7 });
      g.effects.dashBurst(this.pos, this.dashDir); // raffica d'aria + onda a terra
      this._ghostT = 0; // prima scia-fantasma subito
      this._spawnDashGhost();
      g.ui.stamina(this.dashCharges);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.pos.addScaledVector(this.dashDir, CONFIG.player.dashSpeed * dt);
      g.effects.dashTrail(this.pos, this.dashDir); // vento che sfreccia + polvere
      this._ghostT -= dt;
      if (this._ghostT <= 0) { this._ghostT = 0.045; this._spawnDashGhost(); }
    } else {
      const sp = CONFIG.player.speed;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, tx * sp, 12, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, tz * sp, 12, dt);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    resolveCollisions(this.pos, CONFIG.player.radius, g.colliders);

    // orientamento del corpo: verso la direzione di marcia se cammina/scatta, verso la mira se fermo
    let faceYaw;
    if (this.dashT > 0) faceYaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    else if (moving) faceYaw = Math.atan2(tx, tz);
    else faceYaw = Math.atan2(this.aimDir.x, this.aimDir.z);
    let fdy = faceYaw - this.root.rotation.y;
    while (fdy > Math.PI) fdy -= Math.PI * 2;
    while (fdy < -Math.PI) fdy += Math.PI * 2;
    this.root.rotation.y += fdy * Math.min(1, 16 * dt); // rotazione fluida

    // offset di mira rispetto al busto, CLAMPATO a un massimo realistico (niente contorsioni).
    // Misura UNA volta da che lato è il braccio armato: di lì ruota ampio, verso il petto poco.
    if (this._gunSide === 0 && this.handBone) {
      this.handBone.getWorldPosition(_aHand);
      const ry = this.root.rotation.y, rX = Math.cos(ry), rZ = -Math.sin(ry); // asse destro del busto
      const lat = (_aHand.x - this.pos.x) * rX + (_aHand.z - this.pos.z) * rZ;
      this._gunSide = lat >= 0 ? 1 : -1;
    }
    let rel = Math.atan2(this.aimDir.x, this.aimDir.z) - this.root.rotation.y;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const hi = this._gunSide >= 0 ? MAX_ARM_OUT : MAX_ARM_IN;  // verso il lato dell'arma: ampio
    const lo = this._gunSide >= 0 ? -MAX_ARM_IN : -MAX_ARM_OUT; // verso il petto: stretto
    const armRel = THREE.MathUtils.clamp(rel, lo, hi);
    const headRel = THREE.MathUtils.clamp(rel, -MAX_HEAD, MAX_HEAD);
    this._armRel = THREE.MathUtils.damp(this._armRel, armRel, 14, dt);
    this._headRel = THREE.MathUtils.damp(this._headRel, headRel, 12, dt);
    this._aimYaw = this.root.rotation.y + this._armRel; // yaw mondo di braccio e arma

    if (!this._fps && this.headBone) this._aimHead(this._headRel); // testa verso la mira (limitata)
    if (!this._fps && !this._gunPosed && this.aimArmBone) this._aimArm(); // braccio verso la mira (limitato)
    this._updateGun(dt);

    // animazione di movimento
    const spd = this.dashT > 0 ? 12 : Math.hypot(this.vel.x, this.vel.z);
    let purpose = 'idle';
    if (spd > 5.5) purpose = 'run';
    else if (spd > 0.8) purpose = 'walk';
    if (this.anim.currentPurpose !== purpose) {
      this.anim.play(purpose, { timeScale: purpose === 'idle' ? 1 : THREE.MathUtils.clamp(spd / (purpose === 'run' ? 7 : 3), 0.7, 1.8) });
    }

    // passi SINCRONIZZATI ai piedi: due appoggi per ciclo dell'animazione (non a tempo fisso).
    // Leggo la fase dell'azione di camminata/corsa e suono al cambio di metà-ciclo, così il
    // rumore cade quando il piede tocca terra a QUALSIASI velocità (la clip è già time-scalata).
    const act = (purpose !== 'idle') ? this.anim.current : null;
    const clip = act && act.getClip ? act.getClip() : null;
    if (this.dashT <= 0 && spd > 0.8 && clip && clip.duration > 0) {
      const STEP_OFFSET = 0.12; // fase di contatto del piede nella clip (Mixamo ~ inizio passo)
      const phase = ((act.time % clip.duration) / clip.duration + 1) % 1;
      const half = Math.floor(((phase - STEP_OFFSET + 1) % 1) * 2); // 0 o 1 (piede sx / dx)
      if (half !== this._stepHalf) {
        this._stepHalf = half;
        const running = purpose === 'run';
        // ampia variazione di intonazione + volume: ogni passo suona diverso
        Audio.play('step', { vol: running ? 0.5 : 0.36, pitchVar: 0.18, volVar: 0.3 });
      }
    } else if (spd <= 0.8 || this.dashT > 0) {
      this._stepHalf = -1; // da fermo/in scatto: il prossimo contatto suonerà subito
    }

    // ---- ricarica ----
    if (input.wasPressed('KeyR')) this.startReload();
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const def = this.weaponDef;
        const w = this.ammo;
        const need = def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        if (w.reserve !== Infinity) w.reserve -= take;
        g.ui.reloading(false);
        g.ui.ammo(this);
      }
    } else if (this._shellReloading) {
      // SINCRONIZZATO ALL'ANIMAZIONE: il bossolo (suono + caricatore) entra quando l'animazione
      // raggiunge ciascun istante di inserimento della clip (_shellInsertTimes), non su un timer fisso
      // → click e +1 cadono esattamente quando la mano spinge il bossolo nel portello.
      const act = this._gunMixer && this._gunReload ? this._gunMixer.clipAction(this._gunReload) : null;
      const t = act ? act.time : Infinity;
      const times = this._shellInsertTimes || [];
      while (!this._shellDone && this._shellNext < times.length && t >= times[this._shellNext]) {
        this._shellNext++;
        const def = this.weaponDef, w = this.ammo;
        if (w.mag < def.mag && w.reserve > 0) {
          w.mag++;
          if (w.reserve !== Infinity) w.reserve--;
          Audio.play('shotgun_insert', { vol: 0.6, pitchVar: 0.06, volVar: 0.08 });
          g.ui.ammo(this);
        }
        if (w.mag >= def.mag || w.reserve <= 0) {
          // ULTIMO bossolo entrato: NON abbassare subito. Lascia completare la spinta+ritiro della mano
          // (altri SHELL_FINISH s di clip), poi _endShellReload → così il bossolo si vede entrare.
          this._shellDone = true;
          this._shellEndAt = t + SHELL_FINISH;
          g.ui.reloading(false); // il caricatore è pieno: spegni subito l'indicatore "RICARICA…"
        }
      }
      if (this._shellDone && t >= this._shellEndAt) this._endShellReload(); // gesto completato → abbassa
    }

    // ---- cambio arma ----
    for (const [code, id] of [['Digit1', 'pistol'], ['Digit2', 'shotgun'], ['Digit3', 'smg'], ['Digit4', 'magnum']]) {
      if (input.wasPressed(code)) this.switchTo(id);
    }
    if (input.wheelDelta !== 0) {
      const owned = Object.keys(WEAPONS).filter((id) => this.weapons[id]);
      const idx = owned.indexOf(this.current);
      const next = owned[(idx + (input.wheelDelta > 0 ? 1 : -1) + owned.length) % owned.length];
      this.switchTo(next);
    }

    // ---- fuoco ----
    this.fireTimer -= dt;
    const def = this.weaponDef;
    const wantFire = def.auto ? input.mouseDown : input.mousePressed;
    if (wantFire && this.fireTimer <= 0) {
      if (this._shellReloading) {
        // sparare ANNULLA la ricarica a colpo singolo: tieni i bossoli già caricati e spara
        if (this.ammo.mag > 0) { this._endShellReload(); this._fire(def); }
        // se non c'è ancora nessun colpo in canna, ignora (continua a caricare)
      } else if (this.reloadT <= 0) {
        if (this.ammo.mag <= 0) {
          Audio.play('click', { vol: 0.7 });
          this.fireTimer = 0.25;
          this.startReload();
        } else {
          this._fire(def);
        }
      }
    }

    this._updateBullets(dt, enemies);
  }

  /** Spread EFFETTIVO in radianti = cono base dell'arma + rinculo accumulato (`_bloom`). */
  currentSpread() {
    const def = this.weaponDef;
    return THREE.MathUtils.degToRad(def.spread) + this._bloom;
  }

  _fire(def) {
    const g = this.game;
    this.fireTimer = def.rof;
    this.ammo.mag--;

    // direzione di tiro: in FPS lungo lo sguardo reale; in visuale dall'alto lungo l'angolo
    // REALE (clampato) dell'arma _aimYaw — il proiettile segue la pistola, NON il cursore
    // quando questo è oltre l'angolo massimo del braccio.
    const aimD = this._fps ? this._fwd : _fireDir.set(Math.sin(this._aimYaw), 0, Math.cos(this._aimYaw));
    // origine = bocca reale della canna (this._gunPos). In FPS esattamente lì; in top-down
    // un filo più avanti per non sovrapporsi al modello.
    _v1.copy(this._gunPos).addScaledVector(aimD, this._fps ? 0 : 0.08);
    if (!this._fps) _v1.y = Math.max(0.7, _v1.y);
    const muzzle = _v1.clone();

    // materiali condivisi per colore: nucleo (capsula) + alone (sprite testa)
    let mat = this._bulletMats.get(def.tracer);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: def.tracer, transparent: true, opacity: 0.42, // tenue: proiettile poco invadente
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this._bulletMats.set(def.tracer, mat);
    }
    let hmat = this._bulletHaloMats.get(def.tracer);
    if (!hmat) {
      hmat = new THREE.SpriteMaterial({
        map: softDotTexture(), color: def.tracer, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this._bulletHaloMats.set(def.tracer, hmat);
    }
    // spread EFFETTIVO = base + rinculo accumulato → i proiettili cadono nel cono del mirino
    const spread = this.currentSpread();
    // basi perpendicolari alla direzione (cono circolare 2D in FPS che RIEMPIE il cerchio)
    const up0 = Math.abs(aimD.y) > 0.92 ? _xAxis : _vUp;
    _bR.crossVectors(up0, aimD).normalize();
    _bU.crossVectors(aimD, _bR).normalize();

    for (let p = 0; p < def.pellets; p++) {
      if (this._fps) {
        // cono circolare attorno allo sguardo (riempie il mirino): azimut + raggio casuali
        const az = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * spread;
        const sr = Math.sin(rr), cr = Math.cos(rr);
        _bDir.copy(aimD).multiplyScalar(cr)
          .addScaledVector(_bR, sr * Math.cos(az))
          .addScaledVector(_bU, sr * Math.sin(az)).normalize();
      } else {
        // top-down: ventaglio ORIZZONTALE (i pallettoni restano a terra, non volano in aria)
        const a = (Math.random() - Math.random()) * spread;
        const cs = Math.cos(a), sn = Math.sin(a);
        _bDir.set(aimD.x * cs - aimD.z * sn, aimD.y, aimD.x * sn + aimD.z * cs).normalize();
      }
      const mesh = new THREE.Mesh(this._bulletGeo, mat);
      mesh.position.copy(muzzle);
      mesh.quaternion.setFromUnitVectors(_zAxis, _bDir);
      mesh.scale.set(1, 1, 1.5); // scia sottile e affusolata (la capsula traila dietro la testa)
      mesh.renderOrder = 13;
      g.scene.add(mesh);
      const head = new THREE.Sprite(hmat); // testa luminosa morbida (piccola = discreta)
      head.scale.setScalar(0.15);
      head.position.copy(muzzle);
      head.renderOrder = 14;
      g.scene.add(head);
      this.bullets.push({
        mesh, head, prev: muzzle.clone(), vel: _bDir.clone().multiplyScalar(def.speed),
        dmg: def.dmg, pierce: def.pierce, knock: def.knock, life: 0.8,
        hitIds: new Set(), color: def.tracer,
      });
      g.effects.tracer(muzzle, _v2.copy(muzzle).addScaledVector(_bDir, 1.8), def.tracer);
    }
    g.stats.shots += def.pellets;
    // RINCULO: accresci lo spread (cerchio + dispersione), poi rientra (vedi update())
    this._bloom = Math.min(this._bloom + THREE.MathUtils.degToRad(def.bloom), THREE.MathUtils.degToRad(def.bloom) * 3.5);

    // lampo di volata: in FPS piccolo e ancorato alla bocca (no flash a schermo); in
    // visuale dall'alto la versione ampia, leggibile da lontano.
    if (this._fps) {
      g.effects.muzzleViewmodel(this._gunPos, this._fwd, def.light);
    } else {
      g.effects.muzzle(muzzle, this.aimDir, def.light, 1 + def.shake * 1.8);
    }
    this._playGunAnim(this._gunShoot, this._gunShootFit); // carrello/pump (fit per arma)
    // IMPULSO alla molla del rinculo, per arma: il fucile calcia forte, l'auto (mitra) poco perché
    // si accumula a raffica (vedi calibrazione in tools/fps-recoil-check.mjs).
    this._vmRecoilVel += def.auto ? 9 : (def.id === 'shotgun' ? 25 : def.id === 'magnum' ? 22 : 15);
    g.effects.addTrauma(def.shake);
    Audio.play('shot_' + def.id, { vol: 0.85 });
    // rinculo visivo della camera gestito dal trauma; piccolo arretramento del corpo
    this.pos.addScaledVector(this.aimDir, -def.knock * 0.004);
    g.ui.ammo(this);
  }

  _updateBullets(dt, enemies) {
    const g = this.game;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.prev.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.head) b.head.position.copy(b.mesh.position); // la testa luminosa segue il nucleo
      // scia luminosa morbida e SOTTILE che si dissolve dietro il tracciante (strascico discreto)
      g.effects.additive.emit({
        pos: b.mesh.position,
        vel: _v2.set(0, 0, 0),
        color: b.color, life: 0.09, size: 0.07, sizeEnd: 0.005, gravity: 0, drag: 1,
      });

      // collisione segmento-cerchio con i nemici
      const px = b.prev.x, pz = b.prev.z;
      const qx = b.mesh.position.x, qz = b.mesh.position.z;
      const dx = qx - px, dz = qz - pz;
      const segLen2 = dx * dx + dz * dz || 1e-6;

      let best = null, bestT = Infinity;
      for (const e of enemies) {
        if (e.dead || e.state === 'spawning' || b.hitIds.has(e.id)) continue;
        const t = THREE.MathUtils.clamp(((e.pos.x - px) * dx + (e.pos.z - pz) * dz) / segLen2, 0, 1);
        const cx = px + dx * t - e.pos.x;
        const cz = pz + dz * t - e.pos.z;
        const r = e.radius + 0.12;
        if (cx * cx + cz * cz < r * r && t < bestT) { best = e; bestT = t; }
      }

      if (best) {
        b.hitIds.add(best.id);
        const crit = Math.random() < CONFIG.critChance;
        const dmg = b.dmg * (crit ? CONFIG.critMult : 1);
        const dir = _v2.set(b.vel.x, 0, b.vel.z).normalize();
        best.takeDamage(dmg, dir, { crit, knock: b.knock });
        g.stats.hits++;
        // lampo d'impatto del proiettile sul bersaglio
        g.effects.bulletImpact(_v1.set(b.mesh.position.x, Math.max(0.5, best.pos.y + 0.9), b.mesh.position.z), b.color);
        if (b.pierce > 0) {
          b.pierce--;
          b.dmg *= 0.75;
        } else {
          b.life = 0;
        }
      }

      if (b.life <= 0 || Math.hypot(qx, qz) > g.world.maxExtent + 6) {
        g.scene.remove(b.mesh);
        if (b.head) g.scene.remove(b.head);
        this.bullets.splice(i, 1);
      }
    }
  }

  /**
   * Scia-fantasma dello scatto: un clone congelato del corpo nella posa attuale, additivo e
   * azzurro, che svanisce sul posto. Lasciandone diversi lungo la traiettoria si ottiene la
   * classica scia "a eco" dei dash. Niente in prima persona (il corpo è nascosto).
   */
  _spawnDashGhost() {
    if (!this.model || !this.model.visible || this._dashGhosts.length >= 8) return;
    const ghost = skeletonClone(this.model); // congela la posa animata corrente
    const mat = new THREE.MeshBasicMaterial({
      color: 0x73d2ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    ghost.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.frustumCulled = false; } });
    const wrap = new THREE.Group(); // riproduce la trasformazione mondo del corpo vivo
    wrap.position.copy(this.root.position);
    wrap.rotation.copy(this.root.rotation);
    wrap.add(ghost);
    this.game.scene.add(wrap);
    this._dashGhosts.push({ obj: wrap, mat, life: 0.3, maxLife: 0.3 });
  }

  _updateDashGhosts(dt) {
    for (let i = this._dashGhosts.length - 1; i >= 0; i--) {
      const gh = this._dashGhosts[i];
      gh.life -= dt;
      gh.mat.opacity = Math.max(0, (gh.life / gh.maxLife) * 0.5);
      if (gh.life <= 0) {
        this.game.scene.remove(gh.obj);
        gh.mat.dispose(); // la geometria è condivisa col modello vivo: NON va liberata
        this._dashGhosts.splice(i, 1);
      }
    }
  }

  /**
   * Modalità prima persona: nasconde il corpo (la camera è negli occhi) e trasforma l'arma
   * in un viewmodel agganciato alla camera, mani guantate comprese. In terza persona l'arma
   * torna nello spazio mondo, impugnata dal braccio del soldato.
   */
  setFpsView(on) {
    this._fps = on;
    if (this.model) this.model.visible = !on;
    if (this._gunHands) for (const h of this._gunHands) h.visible = on; // mani-viewmodel in FPS
    if (!on) { this._vmRecoil = 0; this._vmRecoilVel = 0; this._vmSwayX = 0; this._vmSwayY = 0; }
  }

  reset() {
    if (this.model) this.model.visible = true;
    this.maxHp = CONFIG.player.hp; // applica la vita della difficoltà scelta
    this.hp = this.maxHp;
    this.dead = false;
    this.weapons = { pistol: { mag: WEAPONS.pistol.mag, reserve: Infinity } };
    this.current = 'pistol';
    this._mountGun('pistol');
    this.reloadT = 0;
    this._shellReloading = false;
    this.fireTimer = 0;
    this.dashCharges = CONFIG.player.dashCharges;
    this.dashRegen = 0;
    this.dashT = 0;
    this.iframes = 0;
    this.vel.set(0, 0, 0);
    this.pos.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    for (const b of this.bullets) { this.game.scene.remove(b.mesh); if (b.head) this.game.scene.remove(b.head); }
    this.bullets = [];
    for (const gh of this._dashGhosts) { this.game.scene.remove(gh.obj); gh.mat.dispose(); }
    this._dashGhosts = [];
    this.anim.play('idle');
  }
}
