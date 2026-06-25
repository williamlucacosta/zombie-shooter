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
// base ortonormale dello sguardo per il viewmodel FPS
const _vF = new THREE.Vector3();
const _vR = new THREE.Vector3();
const _vU = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);

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
const RELOAD_SOUNDS = { pistol: 'reload_pistol', shotgun: 'shotgun_pump', smg: 'reload_rifle', magnum: 'reload_rifle' };

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
    // sfera sottile spostata in avanti (z>=0): stirata diventa una scia che parte DALL'origine
    // (la bocca) ed esce in avanti, invece di estendersi anche dietro la canna.
    this._bulletGeo = new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0, 0.05);
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
    this._vmRecoil = 0;            // 0..1, scatta a ogni colpo e decade
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

  _mountGun(id) {
    this._gunMixer = null; this._gunClips = null; this._gunShoot = null; this._gunReload = null; this._gunHands = null;
    while (this.gunMount.children.length) this.gunMount.remove(this.gunMount.children[0]);
    const def = WEAPONS[id];
    const entry = Assets.guns.get(id);
    // gun ruotato così che la canna guardi +Z (avanti), poi ricentrato sull'impugnatura
    if (entry) {
      const animated = entry.animations && entry.animations.length > 0;
      // skeletonClone preserva lo scheletro per l'animazione delle parti (carrello/caricatore)
      const gun = animated ? skeletonClone(entry.scene) : entry.scene.clone();
      // separa l'arma dalle mani/guanti del rig FPS: le mani fanno da VIEWMODEL in prima
      // persona (visibili solo in FPS); in top-down restano nascoste e si usa il braccio del soldato.
      const hands = [];
      const gunBox = new THREE.Box3();
      gun.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.frustumCulled = false;
        if (/hand|glove/i.test(o.name)) { hands.push(o); return; }
        o.updateWorldMatrix(true, false);
        gunBox.expandByObject(o);
      });
      this._gunHands = hands;
      const size = gunBox.getSize(_v1);
      // l'asse più lungo dell'arma è la canna: portalo lungo +Z
      if (size.x >= size.y && size.x >= size.z) gun.rotation.y = -Math.PI / 2;
      else if (size.y >= size.x && size.y >= size.z) gun.rotation.x = Math.PI / 2;
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
      this.gunMount.add(wrap);
      for (const h of hands) h.visible = !!this._fps; // mani visibili solo in FPS
      if (animated) {
        this._gunMixer = new THREE.AnimationMixer(gun);
        this._gunClips = entry.animations;
        const shoot = entry.animations.find((c) => /shoot/i.test(c.name));
        const reload = entry.animations.find((c) => /reload/i.test(c.name));
        // la clip Shoot del glock dura ~3.6s ma il carrello arretra solo a t≈3.3-3.55s:
        // ne estraggo quella finestra come breve animazione di sparo (frame 98..109 @30fps).
        this._gunShoot = shoot ? THREE.AnimationUtils.subclip(shoot.clone(), 'shoot', 98, 109, 30) : null;
        this._gunReload = reload || null;
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
      if (!o.isMesh || /hand|glove|mag/i.test(o.name) || !o.geometry) return;
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
    const a = this._gunMixer.clipAction(clip);
    a.stop(); a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = clip.duration / Math.max(fitTime, 0.05);
    a.play();
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

    // rinculo: scatta indietro e su, poi decade
    this._vmRecoil = Math.max(0, this._vmRecoil - dt * 7);
    const rec = this._vmRecoil;

    // posizione: occhio (altezza camera) + offset lungo la base dello sguardo
    const eyeY = 1.62;
    _v1.set(0, 0, 0)
      .addScaledVector(R, vm.x + this._vmSwayX + bobX)
      .addScaledVector(U, vm.y + this._vmSwayY + bobY + rec * 0.03)
      .addScaledVector(F, vm.fwd - rec * 0.10);
    this.gunMount.position.set(this.pos.x + _v1.x, eyeY + _v1.y, this.pos.z + _v1.z);

    // orientamento: canna (+Z locale) lungo F; poi calcio (muzzle su) e sway
    this._vmBasis.makeBasis(R, U, F);
    this.gunMount.quaternion.setFromRotationMatrix(this._vmBasis);
    this.gunMount.rotateX(-(vm.pitch + rec * vm.recoilRot)); // muzzle leggermente in su
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
    this.fireTimer = Math.max(this.fireTimer, 0.12);
    this._mountGun(id);
    Audio.play('click', { vol: 0.6 });
    this.game.ui.weapons(this);
    this.game.ui.ammo(this);
  }

  startReload() {
    const def = this.weaponDef;
    const w = this.ammo;
    if (this.reloadT > 0 || w.mag >= def.mag || w.reserve <= 0 || this.dead) return;
    this.reloadT = def.reload;
    Audio.play(RELOAD_SOUNDS[this.current] || 'reload_pistol', { vol: 0.85, pitchVar: 0.04 });
    this._playGunAnim(this._gunReload, def.reload); // ricarica (caricatore), scalata sul tempo arma
    this.game.ui.reloading(true);
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
    if (wantFire && this.fireTimer <= 0 && this.reloadT <= 0) {
      if (this.ammo.mag <= 0) {
        Audio.play('click', { vol: 0.7 });
        this.fireTimer = 0.25;
        this.startReload();
      } else {
        this._fire(def);
      }
    }

    this._updateBullets(dt, enemies);
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

    for (let p = 0; p < def.pellets; p++) {
      const spread = THREE.MathUtils.degToRad(def.spread);
      const a = (Math.random() - Math.random()) * spread;
      const cos = Math.cos(a), sin = Math.sin(a);
      const dir = new THREE.Vector3(
        aimD.x * cos - aimD.z * sin,
        aimD.y,
        aimD.x * sin + aimD.z * cos,
      ).normalize();
      // additivo: il tracciante caldo "brucia" sul fondo scuro e viene esaltato dal bloom,
      // come un vero proiettile illuminante invece di un dardo di plastica colorata.
      let mat = this._bulletMats.get(def.tracer);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({
          color: def.tracer, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        this._bulletMats.set(def.tracer, mat);
      }
      const mesh = new THREE.Mesh(this._bulletGeo, mat);
      mesh.position.copy(muzzle);
      mesh.quaternion.setFromUnitVectors(_zAxis, dir); // dardo orientato lungo la traiettoria
      mesh.scale.set(0.6, 0.6, 5.5); // sottile e allungato: una scia, non una sfera
      mesh.renderOrder = 13;
      g.scene.add(mesh);
      this.bullets.push({
        mesh, prev: muzzle.clone(), vel: dir.clone().multiplyScalar(def.speed),
        dmg: def.dmg, pierce: def.pierce, knock: def.knock, life: 0.8,
        hitIds: new Set(), color: def.tracer,
      });
      g.effects.tracer(muzzle, _v2.copy(muzzle).addScaledVector(dir, 1.8), def.tracer);
    }
    g.stats.shots += def.pellets;

    // lampo di volata: in FPS piccolo e ancorato alla bocca (no flash a schermo); in
    // visuale dall'alto la versione ampia, leggibile da lontano.
    if (this._fps) {
      g.effects.muzzleViewmodel(this._gunPos, this._fwd, def.light);
    } else {
      g.effects.muzzle(muzzle, this.aimDir, def.light, 1 + def.shake * 1.8);
    }
    this._playGunAnim(this._gunShoot, 0.13); // carrello che arretra (clip corta estratta)
    this._vmRecoil = Math.min(1, this._vmRecoil + 0.85); // calcio del viewmodel in FPS
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
      // sottile scia luminosa che si dissolve dietro il tracciante (non un alone gonfio)
      g.effects.additive.emit({
        pos: b.mesh.position,
        vel: _v2.set(0, 0, 0),
        color: b.color, life: 0.06, size: 0.08, sizeEnd: 0.005, gravity: 0, drag: 1,
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
    if (!on) { this._vmRecoil = 0; this._vmSwayX = 0; this._vmSwayY = 0; }
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
    this.fireTimer = 0;
    this.dashCharges = CONFIG.player.dashCharges;
    this.dashRegen = 0;
    this.dashT = 0;
    this.iframes = 0;
    this.vel.set(0, 0, 0);
    this.pos.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    for (const b of this.bullets) this.game.scene.remove(b.mesh);
    this.bullets = [];
    for (const gh of this._dashGhosts) { this.game.scene.remove(gh.obj); gh.mat.dispose(); }
    this._dashGhosts = [];
    this.anim.play('idle');
  }
}
