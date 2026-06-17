// Oggetti raccoglibili: medikit, munizioni, armi. Fluttuano, brillano,
// vengono attirati dal giocatore e lampeggiano prima di sparire.

import * as THREE from 'three';
import { Assets } from './assets.js';
import { WEAPONS } from './config.js';
import { Audio } from './audio.js';

const _v = new THREE.Vector3();

function makeMedkitMesh() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }),
  );
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0x500000, emissiveIntensity: 1.5 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), crossMat);
  c1.position.y = 0.18;
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.3), crossMat);
  c2.position.y = 0.18;
  g.add(box, c1, c2);
  return g;
}

function makeAmmoMesh() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.7 }),
  );
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.47, 0.08, 0.37),
    new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0x663300, emissiveIntensity: 1.2 }),
  );
  g.add(box, stripe);
  return g;
}

const PICKUP_COLORS = { medkit: 0xff4040, ammo: 0xffb84d, weapon: 0x5ad0ff };

export class Pickups {
  constructor(game) {
    this.game = game;
    this.items = [];
  }

  spawn(pos, type, data = null) {
    const g = this.game;
    let mesh;
    if (type === 'medkit') mesh = makeMedkitMesh();
    else if (type === 'ammo') mesh = makeAmmoMesh();
    else if (type === 'weapon') {
      const entry = Assets.guns.get(data);
      if (entry) {
        mesh = entry.scene.clone();
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(_v);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        mesh.scale.setScalar(0.9 / maxDim);
        const wrap = new THREE.Group();
        wrap.add(mesh);
        mesh = wrap;
      } else {
        mesh = makeAmmoMesh();
      }
    }
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    mesh.position.set(pos.x, 0.55, pos.z);
    const colorKey = type === 'weapon' ? 'weapon' : type;
    const light = new THREE.PointLight(PICKUP_COLORS[colorKey], 1.6, 5, 2);
    light.position.set(pos.x, 1.0, pos.z);
    g.scene.add(mesh, light);
    g.effects.spawnPillar(pos, PICKUP_COLORS[colorKey], 0.8);
    this.items.push({ mesh, light, type, data, life: 30, seed: Math.random() * 10 });
  }

  spawnWeapon(pos, weaponId) {
    this.spawn(pos, 'weapon', weaponId);
  }

  /** Lancio di rifornimenti tra le ondate, vicino al centro. */
  supplyDrop() {
    const a = Math.random() * Math.PI * 2;
    const d = 4 + Math.random() * 6;
    this.spawn(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), 'medkit');
    const a2 = a + 2;
    this.spawn(new THREE.Vector3(Math.cos(a2) * d, 0, Math.sin(a2) * d), 'ammo');
  }

  update(dt, player, t) {
    const g = this.game;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.mesh.position.y = 0.55 + Math.sin(t * 2.2 + it.seed) * 0.12;
      it.mesh.rotation.y += dt * 1.6;
      it.light.intensity = 1.4 + Math.sin(t * 3 + it.seed) * 0.4;
      if (it.life < 5) it.mesh.visible = Math.sin(t * 10) > -0.4;

      if (!player.dead) {
        const dx = player.pos.x - it.mesh.position.x;
        const dz = player.pos.z - it.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.4 && dist > 0.01) {
          // attrazione magnetica
          it.mesh.position.x += (dx / dist) * 6 * dt;
          it.mesh.position.z += (dz / dist) * 6 * dt;
          it.light.position.x = it.mesh.position.x;
          it.light.position.z = it.mesh.position.z;
        }
        if (dist < 0.85) {
          this._collect(it, player);
          this._remove(i);
          continue;
        }
      }
      if (it.life <= 0) this._remove(i);
    }
  }

  _collect(it, player) {
    const g = this.game;
    if (it.type === 'medkit') {
      player.heal(35);
      g.effects.heal(player.pos);
      g.ui.toast('+35 VITA');
      Audio.play('pickup', { vol: 0.9 });
    } else if (it.type === 'ammo') {
      player.addAmmo();
      g.ui.toast('MUNIZIONI RIFORNITE');
      Audio.play('pickup', { vol: 0.9 });
    } else if (it.type === 'weapon') {
      player.giveWeapon(it.data);
    }
  }

  _remove(i) {
    const it = this.items[i];
    this.game.scene.remove(it.mesh, it.light);
    this.items.splice(i, 1);
  }

  clear() {
    for (const it of this.items) this.game.scene.remove(it.mesh, it.light);
    this.items = [];
  }
}
