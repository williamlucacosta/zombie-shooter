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

const RELOAD_SOUNDS = { pistol: 'reload_pistol', shotgun: 'shotgun_pump', smg: 'reload_rifle', magnum: 'reload_rifle' };

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
    this.bullets = [];
    this._bulletMats = new Map();
    this._bulletGeo = new THREE.SphereGeometry(0.07, 6, 6);

    // ---- modello ----
    this.root = new THREE.Group();
    const entry = Assets.player;
    if (entry) {
      this.model = skeletonClone(entry.scene);
      this.model.scale.setScalar(entry.scale);
      this.model.rotation.y = entry.yaw;
      this.anim = new Animator(this.model, entry.animations);
    } else {
      this.model = makeProceduralSoldier();
      this.anim = new Animator(this.model, []);
    }
    this.root.add(this.model);

    // attacco arma (all'altezza del fianco, ruota con il personaggio)
    this.gunMount = new THREE.Group();
    this.gunMount.position.set(0.24, 1.0, 0.3);
    this.root.add(this.gunMount);
    this._mountGun('pistol');

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
    while (this.gunMount.children.length) this.gunMount.remove(this.gunMount.children[0]);
    const def = WEAPONS[id];
    const entry = Assets.guns.get(id);
    let gun;
    if (entry) {
      gun = entry.scene.clone();
      const box = new THREE.Box3().setFromObject(gun);
      const size = box.getSize(_v1);
      // orienta l'asse più lungo del modello verso +Z (avanti)
      if (size.x >= size.y && size.x >= size.z) gun.rotation.y = -Math.PI / 2;
      else if (size.y >= size.x && size.y >= size.z) gun.rotation.x = Math.PI / 2;
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      gun.scale.setScalar(entry.length / maxDim);
      const wrap = new THREE.Group();
      wrap.add(gun);
      // ricentra
      const box2 = new THREE.Box3().setFromObject(wrap);
      const c = box2.getCenter(_v2);
      gun.position.sub(c);
      this.gunMount.add(wrap);
    } else {
      gun = makeRifle();
      gun.scale.setScalar(def.slot === 1 ? 0.7 : 1);
      this.gunMount.add(gun);
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
    Audio.play(RELOAD_SOUNDS[this.current] || 'reload_pistol', { vol: 0.8 });
    this.game.ui.reloading(true);
  }

  takeDamage(dmg, fromPos) {
    if (this.dead || this.iframes > 0) return;
    this.hp -= dmg;
    this.iframes = 0.45;
    const g = this.game;
    g.effects.addTrauma(0.42);
    g.effects.blood(_v1.set(this.pos.x, 1.2, this.pos.z), _v2.set(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z).normalize(), 8);
    Audio.play('hurt', { vol: 0.9 });
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
    if (this.dead) { this._updateBullets(dt, enemies); return; }

    this.iframes = Math.max(0, this.iframes - dt);

    // ---- mira ----
    this.aimDir.set(aim.x - this.pos.x, 0, aim.z - this.pos.z);
    if (this.aimDir.lengthSq() > 0.01) this.aimDir.normalize();
    this.root.rotation.y = Math.atan2(this.aimDir.x, this.aimDir.z);

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

    if ((input.wasPressed('ShiftLeft') || input.wasPressed('Space')) && this.dashCharges > 0 && this.dashT <= 0) {
      this.dashCharges--;
      if (this.dashRegen <= 0) this.dashRegen = CONFIG.player.dashCooldown;
      this.dashT = CONFIG.player.dashTime;
      this.iframes = Math.max(this.iframes, CONFIG.player.dashIFrames);
      this.dashDir.set(moving ? mx / ml : this.aimDir.x, 0, moving ? mz / ml : this.aimDir.z);
      Audio.play('dash', { vol: 0.7 });
      g.ui.stamina(this.dashCharges);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.pos.addScaledVector(this.dashDir, CONFIG.player.dashSpeed * dt);
      // scia spettrale
      g.effects.additive.emit({
        pos: _v1.set(this.pos.x, 0.9, this.pos.z),
        vel: _v2.set(0, 0.3, 0),
        color: 0x5ad0ff, life: 0.3, size: 0.5, sizeEnd: 0.05, gravity: 0, drag: 2,
      });
    } else {
      const sp = CONFIG.player.speed;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, (mx / ml) * sp, 12, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, (mz / ml) * sp, 12, dt);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    resolveCollisions(this.pos, CONFIG.player.radius, g.colliders);

    // animazione di movimento
    const spd = this.dashT > 0 ? 12 : Math.hypot(this.vel.x, this.vel.z);
    let purpose = 'idle';
    if (spd > 5.5) purpose = 'run';
    else if (spd > 0.8) purpose = 'walk';
    if (this.anim.currentPurpose !== purpose) {
      this.anim.play(purpose, { timeScale: purpose === 'idle' ? 1 : THREE.MathUtils.clamp(spd / (purpose === 'run' ? 7 : 3), 0.7, 1.8) });
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

    const muzzle = _v1.set(
      this.pos.x + this.aimDir.x * 1.0,
      1.15,
      this.pos.z + this.aimDir.z * 1.0,
    ).clone();

    for (let p = 0; p < def.pellets; p++) {
      const spread = THREE.MathUtils.degToRad(def.spread);
      const a = (Math.random() - Math.random()) * spread;
      const cos = Math.cos(a), sin = Math.sin(a);
      const dir = new THREE.Vector3(
        this.aimDir.x * cos - this.aimDir.z * sin,
        0,
        this.aimDir.x * sin + this.aimDir.z * cos,
      );
      let mat = this._bulletMats.get(def.tracer);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: def.tracer });
        this._bulletMats.set(def.tracer, mat);
      }
      const mesh = new THREE.Mesh(this._bulletGeo, mat);
      mesh.position.copy(muzzle);
      g.scene.add(mesh);
      this.bullets.push({
        mesh, prev: muzzle.clone(), vel: dir.clone().multiplyScalar(def.speed),
        dmg: def.dmg, pierce: def.pierce, knock: def.knock, life: 0.8,
        hitIds: new Set(), color: def.tracer,
      });
      g.effects.tracer(muzzle, _v2.copy(muzzle).addScaledVector(dir, 2.2), def.tracer);
    }
    g.stats.shots += def.pellets;

    g.effects.muzzle(muzzle, this.aimDir, def.light);
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
        if (b.pierce > 0) {
          b.pierce--;
          b.dmg *= 0.75;
        } else {
          b.life = 0;
        }
      }

      if (b.life <= 0 || Math.hypot(qx, qz) > CONFIG.arenaRadius + 6) {
        g.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  reset() {
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
    this.anim.play('idle');
  }
}
