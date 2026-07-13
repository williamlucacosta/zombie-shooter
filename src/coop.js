// ====================== CO-OP: sincronizzazione di gioco (sopra src/net.js) ======================
// Livelli 2-3: MONDO CONDIVISO (seed deterministico) + GIOCATORI (avatar del peer + sync di stato).
// Il combattimento/orda host-autoritativo è il livello 4 (in arrivo).
//
// Ogni peer manda ~20 volte/s lo stato del PROPRIO giocatore (posizione, facing, velocità, vita, arma)
// e renderizza un AVATAR del peer remoto interpolando i pacchetti ricevuti (movimento fluido anche
// con pochi update/s).

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { Assets, Animator } from './assets.js';
import { Net } from './net.js';
import { Enemy } from './enemies.js';
import { ENEMY_TYPES, BOSSES, WEAPONS } from './config.js';

const _up = new THREE.Vector3(0, 1, 0), _tv = new THREE.Vector3(), _tv2 = new THREE.Vector3();

// crea un "puppet" (nemico di sola rappresentazione) col tipo/boss indicati dall'host
function makePuppet(game, typeId, bossIdx, x, z) {
  const typeDef = ENEMY_TYPES[typeId] || ENEMY_TYPES.walker;
  const boss = (bossIdx != null && bossIdx >= 0) ? BOSSES[bossIdx] : null;
  const e = new Enemy(game, typeDef, { hpMult: 1, speedMult: 1, dmgMult: 1, wave: 1, boss }, new THREE.Vector3(x, 0, z));
  e._puppet = true;
  e.state = 'active';       // salta la fase spawn (l'host l'ha già gestita)
  e.root.position.y = 0;
  return e;
}

// PRNG deterministico (mulberry32): sostituisce temporaneamente Math.random così buildWorld genera
// un mondo IDENTICO da un seed → host e client vedono lo stesso bosco/collider. Ritorna la funzione
// di ripristino di Math.random (da chiamare subito dopo buildWorld).
export function seedRandom(seed) {
  const orig = Math.random;
  let s = (seed >>> 0) || 1;
  Math.random = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = orig; };
}

// Avatar del compagno: modello del soldato clonato + Animator, mosso dai pacchetti di stato del peer.
class RemotePlayer {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    const entry = Assets.player;
    if (entry && entry.scene) {
      this.model = skeletonClone(entry.scene);
      this.model.scale.setScalar(entry.scale);
      this.model.rotation.y = entry.yaw;
      this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      this.anim = new Animator(this.model, entry.animations);
      this.root.add(this.model);
    }
    // marcatore luminoso sopra la testa per riconoscere il compagno (sprite additivo, niente luce)
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grd.addColorStop(0, 'rgba(120,200,255,0.95)'); grd.addColorStop(0.4, 'rgba(90,160,255,0.4)'); grd.addColorStop(1, 'rgba(90,160,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.marker.scale.setScalar(0.9); this.marker.position.y = 2.5; this.marker.renderOrder = 7;
    this.root.add(this.marker);
    scene.add(this.root);
    this.tx = 0; this.tz = 0; this.tyaw = 0; this.spd = 0; this.hp = 100; this.dead = false;
    this._cur = null; this._hasState = false;
    if (this.anim) this.anim.play('idle');
  }
  setState(m) {
    this.tx = m.x; this.tz = m.z; this.tyaw = m.ry; this.spd = m.spd || 0; this.hp = m.hp; this.dead = !!m.d;
    if (!this._hasState) { this.root.position.set(m.x, 0, m.z); this._hasState = true; } // primo pacchetto: teletrasporto
  }
  update(dt) {
    // interpolazione di posizione (fluida anche a 20 Hz)
    const k = 1 - Math.exp(-16 * dt);
    this.root.position.x += (this.tx - this.root.position.x) * k;
    this.root.position.z += (this.tz - this.root.position.z) * k;
    // facing: verso l'angolo più breve
    let d = this.tyaw - this.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.root.rotation.y += d * Math.min(1, 14 * dt);
    // animazione da velocità
    if (this.anim) {
      const want = this.dead ? 'death' : (this.spd > 5.5 ? 'run' : (this.spd > 0.8 ? 'walk' : 'idle'));
      if (want !== this._cur) { this.anim.play(want, want === 'death' ? { once: true } : {}); this._cur = want; }
      this.anim.update(dt);
    }
    // pulsazione del marcatore
    this.marker.material.opacity = this.dead ? 0.15 : (0.55 + 0.25 * Math.sin(performance.now() * 0.004));
  }
  dispose() { this.scene.remove(this.root); }
}

export const Coop = {
  active: false,
  role: null,       // 'host' | 'client'
  game: null,
  remote: null,
  _sendT: 0,
  _enT: 0,
  _puppets: new Map(), // (client) id -> Enemy puppet
  _wired: false,

  start(game, role) {
    this.active = true; this.role = role; this.game = game;
    this.remote = new RemotePlayer(game.scene);
    this._sendT = 0; this._enT = 0;
    this._wire();
  },
  stop() {
    this.active = false; this.role = null;
    if (this.remote) { this.remote.dispose(); this.remote = null; }
    for (const e of this._puppets.values()) { try { this.game.scene.remove(e.root); } catch { /* ignore */ } }
    this._puppets.clear();
  },
  isHost() { return this.role === 'host'; },
  isClient() { return this.role === 'client'; },

  // registra i gestori di rete UNA volta (Net vive oltre le partite)
  _wire() {
    if (this._wired) return; this._wired = true;
    Net.onMessage('ps', (m) => { if (this.active && this.remote) this.remote.setState(m); });
    Net.onMessage('en', (m) => { if (this.active && this.isClient()) this._applyEnemies(m); });
    Net.onMessage('shot', (m) => { if (this.active) this._spawnShotFx(m); });
    Net.onMessage('dmg', (m) => { if (this.active && this.isHost()) this._applyDamage(m); });
    Net.onMessage('over', () => { if (this.active && this.isClient()) this.game.endGame(); });
  },

  // chiamata ogni frame dal loop di gioco
  update(dt) {
    if (!this.active) return;
    this._sendT -= dt;
    if (this._sendT <= 0) { this._sendT = 0.05; this._sendState(); } // ~20 Hz stato giocatore
    if (this.isHost()) {
      this._enT -= dt;
      if (this._enT <= 0) { this._enT = 0.066; this._sendEnemies(); } // ~15 Hz orda + HUD
    } else {
      for (const e of this._puppets.values()) e.update(dt, null); // il client anima i puppet (director spento)
    }
    if (this.remote) this.remote.update(dt);
  },

  _sendState() {
    const p = this.game.player;
    if (!p) return;
    Net.send({ t: 'ps', x: p.pos.x, z: p.pos.z, ry: p.root.rotation.y, spd: p._netSpeed || 0, hp: p.hp, d: p.dead ? 1 : 0 });
  },

  // ---- ORDA (host trasmette lo stato dei nemici + HUD) ----
  _sendEnemies() {
    const a = [];
    for (const e of this.game.director.enemies) {
      if (e.dead) continue;
      const bi = e.boss ? BOSSES.indexOf(e.boss) : -1;
      a.push([e.id, e.def.id, +e.pos.x.toFixed(2), +e.pos.z.toFixed(2), +e.root.rotation.y.toFixed(2), e.anim.currentPurpose || 'walk', bi]);
    }
    Net.send({ t: 'en', a, w: this.game.wave, sc: Math.round(this.game.score), so: Math.round(this.game.souls), rem: this.game.director.remaining() });
  },
  _applyEnemies(m) {
    const seen = new Set();
    for (const t of m.a) {
      const [id, typeId, x, z, ry, purpose, bossIdx] = t;
      seen.add(id);
      let e = this._puppets.get(id);
      if (!e) { e = makePuppet(this.game, typeId, bossIdx, x, z); e.id = id; this._puppets.set(id, e); this.game.director.enemies.push(e); }
      e.setNet(x, z, ry, purpose);
    }
    for (const [id, e] of this._puppets) { if (!seen.has(id)) this._removePuppet(id, e); }
    if (this.game.coopApplyHud) this.game.coopApplyHud(m);
  },
  _removePuppet(id, e) {
    const g = this.game;
    if (g.opt && g.opt.blood) g.effects.blood(_tv.set(e.pos.x, e.pos.y + 1.0, e.pos.z), _up, 14);
    g.effects.dirt(e.pos, 6);
    g.scene.remove(e.root);
    const arr = g.director.enemies, i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1);
    this._puppets.delete(id);
  },

  // ---- SPARI (visibili su entrambi gli schermi) ----
  sendShot(muzzle, dir, def) {
    Net.send({ t: 'shot', x: +muzzle.x.toFixed(2), y: +muzzle.y.toFixed(2), z: +muzzle.z.toFixed(2), dx: +dir.x.toFixed(3), dy: +dir.y.toFixed(3), dz: +dir.z.toFixed(3), w: def.id });
  },
  _spawnShotFx(m) {
    const g = this.game, def = WEAPONS[m.w] || WEAPONS.pistol;
    const pos = _tv.set(m.x, m.y, m.z), dir = _tv2.set(m.dx, m.dy, m.dz);
    g.effects.muzzle(pos, dir, def.light, 1.3);
    g.effects.tracer(pos, _tmpTo.copy(pos).addScaledVector(dir, 7), def.tracer); // scia visibile del compagno
  },

  // ---- DANNO (client → host, autoritativo) ----
  reportHit(id, dmg, opts) { Net.send({ t: 'dmg', id, dmg, h: opts.head ? 1 : 0, c: opts.crit ? 1 : 0 }); },
  _applyDamage(m) {
    const e = this.game.director.enemies.find((x) => x.id === m.id && !x.dead && !x._puppet);
    if (!e) return;
    const rp = this.remote ? this.remote.root.position : this.game.player.pos;
    const dir = _tv.set(e.pos.x - rp.x, 0, e.pos.z - rp.z).normalize();
    e.takeDamage(m.dmg, dir, { head: !!m.h, crit: !!m.c, knock: 2 });
  },
};

const _tmpTo = new THREE.Vector3();
