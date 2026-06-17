// Nemici e direttore delle ondate: IA d'inseguimento con separazione, risalita
// dalle tombe, varianti tematiche per ondata, élite, boss con abilità speciali
// (carica, schianto, evocazione, raffica di proiettili acidi).

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { getCharacter, makeProceduralZombie, Animator } from './assets.js';
import { CONFIG, ENEMY_TYPES, waveComposition, WEAPON_UNLOCKS, DIFF } from './config.js';
import { Audio } from './audio.js';

const ARENA_R = CONFIG.arenaRadius;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Spinge fuori una posizione 2D da colliders circolari e dal bordo arena. */
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const min = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
  const d = Math.hypot(pos.x, pos.z);
  if (d > ARENA_R - radius) {
    pos.x *= (ARENA_R - radius) / d;
    pos.z *= (ARENA_R - radius) / d;
  }
}

let nextEnemyId = 1;

export class Enemy {
  constructor(game, typeDef, mods, pos) {
    this.id = nextEnemyId++;
    this.game = game;
    this.def = typeDef;
    this.boss = mods.boss || null;
    this.elite = !!mods.elite;

    const b = this.boss;
    const eliteMult = this.elite ? 2.6 : 1;
    this.maxHp = (b ? b.hp * (b.hpLoopMult || 1) : typeDef.hp * eliteMult) * mods.hpMult;
    this.hp = this.maxHp;
    this.speed = (b ? b.speed : typeDef.speed) * mods.speedMult * (0.92 + Math.random() * 0.16);
    this.dmg = (b ? b.dmg : typeDef.dmg) * mods.dmgMult;
    this.radius = (b ? b.radius : typeDef.radius) * (this.elite ? 1.18 : 1);
    this.scoreValue = (b ? b.score : typeDef.score) * (this.elite ? 3 : 1);
    this.staggerThreshold = b ? 90 : typeDef.stagger * eliteMult;

    this.state = 'spawning';
    this.stateTime = 0;
    this.attackCooldown = 0;
    this.growlTimer = 2 + Math.random() * 6;
    this.kb = new THREE.Vector3();
    this.hitFlashT = 0;
    this.dead = false;

    // ---- costruzione modello ----
    const visScale = (b ? b.scale : typeDef.scale) * (this.elite ? 1.18 : 1);
    let modelNames = typeDef.models || [];
    if (mods.wave >= 6 && typeDef.lateModels && Math.random() < 0.4) modelNames = typeDef.lateModels;
    const entry = b ? getCharacter(b.model, ...modelNames) : getCharacter(...modelNames);

    this.root = new THREE.Group();
    this.root.position.copy(pos);

    if (entry) {
      this.model = skeletonClone(entry.scene);
      this.model.scale.setScalar(entry.scale * visScale);
      this.model.position.y = 0;
      this.model.rotation.y = entry.yaw;
      this.anim = new Animator(this.model, entry.animations);
      this.procedural = false;
    } else {
      this.model = makeProceduralZombie();
      this.model.scale.setScalar(visScale);
      this.anim = new Animator(this.model, []);
      this.procedural = true;
    }
    this.root.add(this.model);

    // ---- tinta tematica dell'ondata ----
    const theme = mods.theme;
    const tint = new THREE.Color(b ? b.tint : theme.tint);
    const emissive = new THREE.Color(b ? b.emissive : theme.emissive);
    const glow = (b ? b.glow : theme.glow) * (this.elite ? 1.8 : 1);
    this.mats = [];
    const matMap = new Map();
    this.model.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
        if (!matMap.has(o.material)) {
          const m = o.material.clone();
          m.color.multiply(tint);
          m.emissive.copy(emissive);
          m.emissiveIntensity = glow;
          matMap.set(o.material, m);
          this.mats.push({ mat: m, baseEmissive: emissive.clone(), baseIntensity: glow });
        }
        o.material = matMap.get(o.material);
      }
    });
    if (this.procedural) {
      const eyeMat = this.model.userData.bones.eyeMat;
      eyeMat.color.set(b || theme.glow > 0.3 ? emissive : 0xffcc66);
      if (emissive.getHex() === 0) eyeMat.color.set(0xffcc66);
    }

    // luce personale del boss
    if (b) {
      this.bossLight = new THREE.PointLight(b.tint, 3.2, 12, 1.8);
      this.bossLight.position.y = 2.4 * visScale;
      this.root.add(this.bossLight);
    }

    // ---- spawn: scheletri si risvegliano, zombi risalgono dalla terra ----
    this.spawnDepth = (typeDef.lowProfile ? 0.6 : 1.7) * visScale;
    if (this.anim.has('spawn')) {
      this.spawnTime = Math.min(this.anim.play('spawn', { once: true, fade: 0 }) ?? 1.2, 2.2);
      this.spawnRise = false;
    } else {
      this.spawnTime = 1.1;
      this.spawnRise = true;
      this.root.position.y = -this.spawnDepth;
    }

    // abilità boss
    this.abilityTimer = 3.5;
    this.ability = null; // { name, phase: 'telegraph'|'active', t, data }

    game.scene.add(this.root);
    game.effects.spawnPillar(pos, b ? b.tint : 0x76ff8a, b ? 2.2 : 1);
    game.effects.dirt(pos, b ? 30 : 14);
    if (b) Audio.playAt('boss_roar', pos, game.playerPos(), { vol: 1.2 });
    else Audio.playAt('zombie_growl', pos, game.playerPos(), { vol: 0.8 });
  }

  get pos() { return this.root.position; }

  _moveAnim() {
    const purpose = this.def.anim || 'walk';
    const ref = purpose === 'run' ? 4.6 : purpose === 'crawl' ? 2.2 : 2.0;
    const ts = THREE.MathUtils.clamp(this.speed / ref, 0.55, 2.3);
    if (this.anim.currentPurpose !== purpose) this.anim.play(purpose, { timeScale: ts });
  }

  takeDamage(dmg, dir, { crit = false, knock = 0 } = {}) {
    if (this.dead || this.state === 'spawning' || this.state === 'dying') return false;
    this.hp -= dmg;
    this.hitFlashT = 0.08;
    for (const m of this.mats) {
      m.mat.emissive.setHex(0xffffff);
      m.mat.emissiveIntensity = 1.6;
    }
    const g = this.game;
    const hitPos = _v1.set(this.pos.x, this.pos.y + (this.def.lowProfile ? 0.4 : 1.1), this.pos.z);
    g.effects.blood(hitPos, dir, crit ? 16 : 9);
    g.effects.damageNumber(this.pos, String(Math.round(dmg)), '#ffd887', crit);
    if (Math.random() < 0.35) g.effects.bloodDecal(this.pos);
    Audio.playAt(crit ? 'crit' : 'hit_flesh', this.pos, g.playerPos(), { vol: 0.9 });

    if (!this.boss && knock > 0) {
      this.kb.addScaledVector(dir, knock * 0.6);
    }
    if (this.hp <= 0) {
      this.die(dir);
      return true;
    }
    if (dmg >= this.staggerThreshold && this.state !== 'attacking') {
      this.state = 'stagger';
      this.stateTime = 0.38;
      if (this.anim.has('hit')) this.anim.play('hit', { once: true });
    }
    if (this.boss) g.ui.bossHp(this.hp / this.maxHp);
    return false;
  }

  die(dir) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dying';
    this.stateTime = 0;
    const g = this.game;
    g.effects.blood(_v1.set(this.pos.x, 1, this.pos.z), dir, 22);
    g.effects.bloodDecal(this.pos, this.boss ? 2.2 : 1.3);
    Audio.playAt('zombie_death', this.pos, g.playerPos(), { vol: 1 });
    if (this.bossLight) this.bossLight.intensity = 0;

    const d = this.anim.play('death', { once: true, fade: 0.12 });
    this.deathAnimTime = d ?? 0.6;
    this.sinkDelay = this.deathAnimTime + 1.4;
    g.onEnemyKilled(this);
  }

  /** Aggiorna IA e animazioni; enemies = lista per la separazione. */
  update(dt, enemies) {
    const g = this.game;
    this.anim.update(dt);
    this.stateTime += dt;

    if (this.hitFlashT > 0) {
      this.hitFlashT -= dt;
      if (this.hitFlashT <= 0) {
        for (const m of this.mats) {
          m.mat.emissive.copy(m.baseEmissive);
          m.mat.emissiveIntensity = m.baseIntensity;
        }
      }
    }

    switch (this.state) {
      case 'spawning': {
        if (this.spawnRise) {
          const t = Math.min(this.stateTime / this.spawnTime, 1);
          this.root.position.y = -this.spawnDepth * (1 - t * t);
          if (Math.random() < 0.3) g.effects.dirt(this.pos, 1);
        }
        if (this.stateTime >= this.spawnTime) {
          this.root.position.y = 0;
          this.state = 'active';
          this._moveAnim();
        }
        break;
      }

      case 'stagger': {
        if (this.stateTime >= 0.38) { this.state = 'active'; this._moveAnim(); }
        break;
      }

      case 'active': {
        this.attackCooldown -= dt;
        if (this.boss) this._bossUpdate(dt);
        if (this.ability) break; // il boss fermo durante un'abilità

        const pp = g.playerPos();
        const toPlayer = _v1.set(pp.x - this.pos.x, 0, pp.z - this.pos.z);
        const dist = toPlayer.length();
        toPlayer.normalize();

        // attacco
        if (this.def.ranged) {
          if (dist < this.def.attackRange && this.attackCooldown <= 0) {
            this._startAttack();
            break;
          }
        } else if (dist < this.def.attackRange && this.attackCooldown <= 0) {
          this._startAttack();
          break;
        }

        // steering: inseguimento + separazione
        let vx = toPlayer.x, vz = toPlayer.z;
        if (this.def.ranged && dist < this.def.keepDistance) { vx = -vx * 0.6; vz = -vz * 0.6; }
        let sx = 0, sz = 0;
        for (const e of enemies) {
          if (e === this || e.dead) continue;
          const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z;
          const d2 = dx * dx + dz * dz;
          const min = this.radius + e.radius + 0.25;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const f = (min - d) / min;
            sx += (dx / d) * f; sz += (dz / d) * f;
          }
        }
        vx += sx * 1.6; vz += sz * 1.6;
        const vl = Math.hypot(vx, vz) || 1;
        this.pos.x += (vx / vl) * this.speed * dt + this.kb.x * dt;
        this.pos.z += (vz / vl) * this.speed * dt + this.kb.z * dt;
        this.kb.multiplyScalar(Math.max(0, 1 - 7 * dt));
        resolveCollisions(this.pos, this.radius, g.colliders);

        // orientamento verso la direzione di movimento / giocatore
        const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        let dy = targetYaw - this.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.root.rotation.y += dy * Math.min(1, 8 * dt);

        // ringhi casuali
        this.growlTimer -= dt;
        if (this.growlTimer <= 0) {
          this.growlTimer = 4 + Math.random() * 7;
          Audio.playAt('zombie_growl', this.pos, pp, { vol: 0.65, rate: this.boss ? 0.7 : 1 });
        }

        if (this.procedural) this._proceduralWalk();
        break;
      }

      case 'attacking': {
        const pp = g.playerPos();
        // continua a guardare il giocatore
        const targetYaw = Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z);
        this.root.rotation.y += (targetYaw - this.root.rotation.y) * Math.min(1, 4 * dt);

        if (!this.attackHitDone && this.stateTime >= this.attackHitAt) {
          this.attackHitDone = true;
          if (this.def.ranged) {
            this.game.director.spawnSpit(this);
          } else {
            const dist = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
            if (dist < this.def.attackRange * 1.3 + this.radius) {
              g.damagePlayer(this.dmg, this.pos);
            }
          }
        }
        if (this.stateTime >= this.attackDuration) {
          this.state = 'active';
          this.attackCooldown = this.def.ranged ? 2.4 : 0.6;
          this._moveAnim();
        }
        if (this.procedural) {
          const b = this.model.userData.bones;
          const t = Math.min(this.stateTime / this.attackDuration, 1);
          b.armL.rotation.x = b.armR.rotation.x = -1.4 + Math.sin(t * Math.PI) * 1.2;
        }
        break;
      }

      case 'dying': {
        if (this.procedural) {
          const t = Math.min(this.stateTime / 0.5, 1);
          this.root.rotation.x = -Math.PI / 2 * t * t;
        } else if (!this.anim.has('death')) {
          const t = Math.min(this.stateTime / 0.5, 1);
          this.root.rotation.x = -Math.PI / 2 * t * t;
        }
        if (this.stateTime > this.sinkDelay) {
          this.root.position.y -= dt * 0.7;
          if (this.root.position.y < -2.4) this.state = 'dead';
        }
        break;
      }
    }
  }

  _startAttack() {
    this.state = 'attacking';
    this.stateTime = 0;
    this.attackHitDone = false;
    const purpose = this.def.attackAnim || 'attack';
    const d = this.anim.play(purpose, { once: true, fade: 0.12 });
    this.attackDuration = d ?? this.def.attackTime;
    this.attackHitAt = this.def.hitTime * (this.attackDuration / this.def.attackTime);
    Audio.playAt(this.def.ranged ? 'spit' : 'zombie_attack', this.pos, this.game.playerPos(), { vol: 0.9 });
  }

  _proceduralWalk() {
    const b = this.model.userData.bones;
    const t = performance.now() * 0.001 * this.speed * 2.4 + this.id;
    b.legL.rotation.x = Math.sin(t) * 0.55;
    b.legR.rotation.x = -Math.sin(t) * 0.55;
    b.armL.rotation.x = -1.25 + Math.sin(t * 0.7) * 0.12;
    b.armR.rotation.x = -1.25 - Math.sin(t * 0.7) * 0.12;
    b.torso.rotation.z = Math.sin(t * 0.5) * 0.07;
  }

  // ------------------------------------------------------------- boss ----

  _bossUpdate(dt) {
    const g = this.game;
    const pp = g.playerPos();

    if (this.ability) {
      const ab = this.ability;
      ab.t += dt;
      if (ab.phase === 'telegraph') {
        if (ab.t >= ab.telegraphTime) {
          ab.phase = 'active';
          ab.t = 0;
          this._abilityActivate(ab);
        }
      } else if (ab.phase === 'active') {
        this._abilityActive(ab, dt);
      }
      return;
    }

    this.abilityTimer -= dt;
    const dist = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
    if (this.abilityTimer <= 0 && this.state === 'active') {
      const abilities = this.boss.abilities;
      let name = abilities[(Math.random() * abilities.length) | 0];
      // scelte sensate: niente carica se vicino, niente slam se lontano
      if (name === 'charge' && dist < 7) name = 'slam';
      if (name === 'slam' && dist > 9) name = abilities.includes('charge') ? 'charge' : name;
      this.ability = { name, phase: 'telegraph', t: 0, telegraphTime: name === 'charge' ? 0.85 : 0.7 };
      // telegrafo visivo
      if (name === 'slam') {
        g.effects.ring(this.pos, 0xff4020, 6.5, 0.7);
      } else if (name === 'charge') {
        this.chargeDir = _v2.set(pp.x - this.pos.x, 0, pp.z - this.pos.z).normalize().clone();
        g.effects.ring(this.pos, 0xffa020, 3, 0.85);
      } else if (name === 'summon' || name === 'barrage') {
        g.effects.spawnPillar(this.pos, 0x70ff40, 2);
        Audio.playAt('boss_roar', this.pos, pp, { vol: 1 });
      }
    }
  }

  _abilityActivate(ab) {
    const g = this.game;
    const pp = g.playerPos();
    switch (ab.name) {
      case 'slam': {
        g.effects.bigExplosion(this.pos, 0xff5020);
        g.effects.ring(this.pos, 0xff8040, 7.5, 0.6);
        g.effects.addTrauma(0.55);
        Audio.play('slam', { vol: 1 });
        const dist = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
        if (dist < 7) g.damagePlayer(this.dmg * 0.9, this.pos);
        this._endAbility(4.5);
        break;
      }
      case 'charge': {
        ab.duration = 1.05;
        Audio.playAt('zombie_attack', this.pos, pp, { vol: 1, rate: 0.6 });
        break;
      }
      case 'summon': {
        const types = ['walker', 'walker', 'runner', 'crawler'];
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.random();
          const p = new THREE.Vector3(
            this.pos.x + Math.cos(a) * 3.2,
            0,
            this.pos.z + Math.sin(a) * 3.2,
          );
          resolveCollisions(p, 0.6, g.colliders);
          g.director.spawnEnemy(types[i % types.length], p);
        }
        this._endAbility(7);
        break;
      }
      case 'barrage': {
        const n = 10;
        const base = Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z);
        for (let i = 0; i < n; i++) {
          const a = base + (i - n / 2) * 0.22;
          g.director.spawnSpitDir(this, Math.sin(a), Math.cos(a));
        }
        Audio.playAt('spit', this.pos, pp, { vol: 1, rate: 0.7 });
        this._endAbility(5.5);
        break;
      }
    }
  }

  _abilityActive(ab, dt) {
    const g = this.game;
    if (ab.name === 'charge') {
      ab.t0 = (ab.t0 || 0) + dt;
      this.pos.x += this.chargeDir.x * 15 * dt;
      this.pos.z += this.chargeDir.z * 15 * dt;
      resolveCollisions(this.pos, this.radius, g.colliders);
      g.effects.dirt(this.pos, 2);
      const pp = g.playerPos();
      const dist = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
      if (!ab.hitDone && dist < this.radius + 1.1) {
        ab.hitDone = true;
        g.damagePlayer(this.dmg, this.pos);
        g.effects.addTrauma(0.4);
      }
      const ar = Math.hypot(this.pos.x, this.pos.z);
      if (ab.t0 >= ab.duration || ar >= ARENA_R - this.radius - 0.5) {
        g.effects.addTrauma(0.3);
        Audio.play('slam', { vol: 0.6 });
        this._endAbility(4.5);
      }
    } else {
      this._endAbility(5);
    }
  }

  _endAbility(cooldown) {
    this.ability = null;
    this.abilityTimer = cooldown * (0.85 + Math.random() * 0.3);
    // furia sotto il 30% di vita: abilità più frequenti
    if (this.hp < this.maxHp * 0.3) this.abilityTimer *= 0.55;
  }

  dispose() {
    this.game.scene.remove(this.root);
    for (const m of this.mats) m.mat.dispose();
  }
}

// ===================================================================== //

export class WaveDirector {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.queue = [];
    this.spawnTimer = 0;
    this.wave = 0;
    this.mods = null;
    this.bossDef = null;
    this.bossSpawned = false;
    this.active = false;
    this.kills = 0;
    this.weaponDropAtKill = -1;
    this.pendingWeapon = null;
    this.maxAlive = 34;

    // proiettili nemici (sputi acidi)
    this.spits = [];
    this.spitGeo = new THREE.SphereGeometry(0.16, 8, 8);
    this.spitMat = new THREE.MeshBasicMaterial({ color: 0x86ff3a });
  }

  startWave(n) {
    this.wave = n;
    const comp = waveComposition(n);
    this.mods = {
      hpMult: comp.hpMult, speedMult: comp.speedMult, dmgMult: comp.dmgMult,
      theme: comp.theme, wave: n,
    };
    this.queue = comp.list.map((type, i) => ({ type, elite: i < (comp.eliteCount || 0) }));
    // rimescola le élite nella coda
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.bossDef = comp.boss;
    this.bossSpawned = false;
    this.totalCount = this.queue.length + (comp.boss ? 1 : 0);
    this.kills = 0;
    this.pendingWeapon = WEAPON_UNLOCKS[n] || null;
    this.weaponDropAtKill = this.pendingWeapon ? Math.max(2, Math.floor(this.totalCount * 0.45)) : -1;
    this.spawnTimer = 0.8;
    this.maxAlive = Math.round(34 * DIFF.maxAlive); // densità dell'orda per difficoltà
    this.active = true;
  }

  aliveCount() { return this.enemies.filter((e) => !e.dead).length; }
  remaining() { return this.aliveCount() + this.queue.length + (this.bossDef && !this.bossSpawned ? 1 : 0); }

  pickSpawnPos() {
    const pp = this.game.playerPos();
    const graves = this.game.world.graves.filter((gv) => Math.hypot(gv.x - pp.x, gv.z - pp.z) > 13);
    if (graves.length && Math.random() < 0.55) {
      const gv = graves[(Math.random() * graves.length) | 0];
      const p = new THREE.Vector3(gv.x + (Math.random() - 0.5) * 1.6, 0, gv.z + (Math.random() - 0.5) * 1.6);
      resolveCollisions(p, 0.7, this.game.colliders);
      return p;
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = ARENA_R * (0.45 + Math.random() * 0.45);
      const p = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      if (Math.hypot(p.x - pp.x, p.z - pp.z) < 13) continue;
      resolveCollisions(p, 0.7, this.game.colliders);
      return p;
    }
    return new THREE.Vector3(0, 0, -ARENA_R * 0.7);
  }

  spawnEnemy(type, pos, opts = {}) {
    const def = ENEMY_TYPES[type];
    if (!def || !this.mods) return null;
    const e = new Enemy(this.game, def, { ...this.mods, elite: opts.elite, boss: opts.boss }, pos || this.pickSpawnPos());
    this.enemies.push(e);
    return e;
  }

  update(dt) {
    if (!this.active && this.enemies.length === 0) return;

    // spawn scaglionato
    if (this.active) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.aliveCount() < this.maxAlive) {
        if (this.bossDef && !this.bossSpawned) {
          this.bossSpawned = true;
          const e = this.spawnEnemy(this.bossDef.baseType, this.pickSpawnPos(), { boss: this.bossDef });
          if (e) {
            this.game.ui.bossShow(this.bossDef.name);
            this.game.effects.addTrauma(0.4);
          }
          this.spawnTimer = 1.4;
        } else if (this.queue.length) {
          const burst = Math.min(this.queue.length, 2 + (Math.random() < 0.3 ? 1 : 0));
          for (let i = 0; i < burst && this.aliveCount() < this.maxAlive; i++) {
            const item = this.queue.shift();
            this.spawnEnemy(item.type, null, { elite: item.elite });
          }
          this.spawnTimer = (0.55 + Math.random() * 0.5) * DIFF.spawnInterval;
        }
      }
    }

    // aggiornamento nemici
    for (const e of this.enemies) e.update(dt, this.enemies);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].state === 'dead') {
        this.enemies[i].dispose();
        this.enemies.splice(i, 1);
      }
    }

    this._updateSpits(dt);

    // fine ondata
    if (this.active && this.queue.length === 0 && (!this.bossDef || this.bossSpawned) && this.aliveCount() === 0) {
      this.active = false;
      this.game.onWaveCleared();
    }
  }

  /** Chiamato dal gioco quando un nemico muore (per drop e contatori). */
  onKill(enemy) {
    this.kills++;
    const g = this.game;
    if (this.pendingWeapon && (this.kills >= this.weaponDropAtKill || enemy.boss)) {
      g.pickups.spawnWeapon(enemy.pos.clone(), this.pendingWeapon);
      this.pendingWeapon = null;
    } else if (enemy.boss) {
      g.pickups.spawn(enemy.pos.clone().add(new THREE.Vector3(1, 0, 0)), 'medkit');
      g.pickups.spawn(enemy.pos.clone().add(new THREE.Vector3(-1, 0, 0)), 'ammo');
    } else if (enemy.elite) {
      g.pickups.spawn(enemy.pos.clone(), Math.random() < 0.5 ? 'medkit' : 'ammo');
    } else {
      const roll = Math.random();
      if (roll < 0.045) g.pickups.spawn(enemy.pos.clone(), 'medkit');
      else if (roll < 0.1) g.pickups.spawn(enemy.pos.clone(), 'ammo');
    }
    if (enemy.boss) g.ui.bossHide();
  }

  // ---- proiettili acidi ----

  spawnSpit(enemy) {
    const pp = this.game.playerPos();
    const dx = pp.x - enemy.pos.x, dz = pp.z - enemy.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.spawnSpitDir(enemy, dx / d, dz / d);
  }

  spawnSpitDir(enemy, nx, nz) {
    const mesh = new THREE.Mesh(this.spitGeo, this.spitMat);
    const h = enemy.boss ? 2.2 : 1.3;
    mesh.position.set(enemy.pos.x + nx * 0.6, h, enemy.pos.z + nz * 0.6);
    this.game.scene.add(mesh);
    const speed = enemy.def.projectileSpeed || 11;
    this.spits.push({
      mesh,
      vel: new THREE.Vector3(nx * speed, 0, nz * speed),
      life: 3.5,
      dmg: enemy.dmg,
    });
  }

  _updateSpits(dt) {
    const g = this.game;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      // scia
      if (Math.random() < 0.6) {
        g.effects.additive.emit({
          pos: s.mesh.position, vel: _v1.set(0, 0.4, 0),
          color: 0x70ff30, life: 0.3, size: 0.16, sizeEnd: 0.02, gravity: 0, drag: 1,
        });
      }
      const pp = g.playerPos();
      const dist = Math.hypot(s.mesh.position.x - pp.x, s.mesh.position.z - pp.z);
      let kill = false;
      if (dist < 0.62) {
        g.damagePlayer(s.dmg, s.mesh.position);
        Audio.play('splat', { vol: 0.8 });
        kill = true;
      } else if (s.life <= 0 || Math.hypot(s.mesh.position.x, s.mesh.position.z) > ARENA_R + 2) {
        kill = true;
      }
      if (kill) {
        for (let k = 0; k < 6; k++) {
          g.effects.additive.emit({
            pos: s.mesh.position,
            vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4),
            color: 0x86ff3a, life: 0.35, size: 0.18, sizeEnd: 0.02, gravity: -8, drag: 1,
          });
        }
        g.scene.remove(s.mesh);
        this.spits.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    for (const s of this.spits) this.game.scene.remove(s.mesh);
    this.spits = [];
    this.queue = [];
    this.active = false;
    this.bossDef = null;
    this.wave = 0;
  }
}
