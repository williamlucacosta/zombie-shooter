// Oggetti raccoglibili: medikit, munizioni, armi. Fluttuano, brillano,
// vengono attirati dal giocatore e lampeggiano prima di sparire.
//
// NOTA prestazioni: niente PointLight per pickup (aggiungere/togliere luci a
// runtime forza Three.js a ricompilare TUTTI i materiali → scatto). Usiamo
// geometrie/materiali condivisi (clonati per riferimento) e un alone additivo
// (sprite) che non tocca il conteggio luci.

import * as THREE from 'three';
import { Assets } from './assets.js';
import { Audio } from './audio.js';

const _v = new THREE.Vector3();
const PICKUP_COLORS = { medkit: 0xff4040, ammo: 0xffb84d, weapon: 0x5ad0ff };

function glowTexture() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  // alone compatto: nucleo piccolo e bordi che svaniscono in fretta (niente blob)
  const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}

export class Pickups {
  constructor(game) {
    this.game = game;
    this.items = [];
    this._glowTex = glowTexture();

    // --- template condivisi (geometrie + materiali creati UNA volta) ---
    const medBox = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
    const medCross = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0x600000, emissiveIntensity: 1.6 });
    const med = new THREE.Group();
    const mb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), medBox);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.1), medCross); c1.position.y = 0.18;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.3), medCross); c2.position.y = 0.18;
    med.add(mb, c1, c2);

    const ammoBox = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.7 });
    const ammoStripe = new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0x6a3500, emissiveIntensity: 1.4 });
    const ammo = new THREE.Group();
    const ab = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.35), ammoBox);
    const as = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.37), ammoStripe);
    ammo.add(ab, as);

    [med, ammo].forEach((tpl) => tpl.traverse((o) => { if (o.isMesh) o.castShadow = true; }));
    this._templates = { medkit: med, ammo };
    // materiali sprite condivisi per colore (additivi, nessuna ricompilazione)
    this._glowMats = {};
    for (const [k, col] of Object.entries(PICKUP_COLORS)) {
      this._glowMats[k] = new THREE.SpriteMaterial({
        map: this._glowTex, color: col, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
    }
  }

  spawn(pos, type, data = null) {
    const g = this.game;
    const colorKey = type === 'weapon' ? 'weapon' : type;
    let mesh;
    if (type === 'weapon') {
      const entry = Assets.guns.get(data);
      if (entry) {
        const gun = entry.scene.clone();
        const size = new THREE.Box3().setFromObject(gun).getSize(_v);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        gun.scale.setScalar(0.9 / maxDim);
        gun.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        mesh = new THREE.Group();
        mesh.add(gun);
      } else {
        mesh = this._templates.ammo.clone();
      }
    } else {
      mesh = this._templates[type].clone(); // condivide geometria e materiali
    }

    // alone additivo discreto invece di una luce dinamica
    const glow = new THREE.Sprite(this._glowMats[colorKey]);
    glow.scale.setScalar(type === 'weapon' ? 1.15 : 0.95);
    glow.position.y = 0.18;
    glow.renderOrder = 8;
    mesh.add(glow);

    mesh.position.set(pos.x, 0.55, pos.z);
    g.scene.add(mesh);
    g.effects.spawnPillar(pos, PICKUP_COLORS[colorKey], 0.8);
    this.items.push({ mesh, glow, type, data, life: 30, seed: Math.random() * 10 });
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
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.mesh.position.y = 0.55 + Math.sin(t * 2.2 + it.seed) * 0.12;
      it.mesh.rotation.y += dt * 1.6;
      it.glow.material.opacity = 0.4 + Math.sin(t * 3 + it.seed) * 0.12;
      if (it.life < 5) it.mesh.visible = Math.sin(t * 10) > -0.4;

      if (!player.dead) {
        const dx = player.pos.x - it.mesh.position.x;
        const dz = player.pos.z - it.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.4 && dist > 0.01) {
          // attrazione magnetica
          it.mesh.position.x += (dx / dist) * 6 * dt;
          it.mesh.position.z += (dz / dist) * 6 * dt;
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
    this.game.scene.remove(this.items[i].mesh);
    this.items.splice(i, 1);
  }

  clear() {
    for (const it of this.items) this.game.scene.remove(it.mesh);
    this.items = [];
  }
}
