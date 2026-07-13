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
    const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

    // --- MEDIKIT: valigetta di pronto soccorso (guscio bianco, croce EMISSIVA, maniglia, fibbie) ---
    const medShell = new THREE.MeshStandardMaterial({ color: 0xe2e6e4, roughness: 0.5, metalness: 0.05 });
    const medLid = new THREE.MeshStandardMaterial({ color: 0xd0d4d2, roughness: 0.55, metalness: 0.05 });
    const medCross = new THREE.MeshStandardMaterial({ color: 0xe6302a, emissive: 0xe01818, emissiveIntensity: 2.4, roughness: 0.4 });
    const medMetal = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.3, metalness: 0.9 });
    const med = new THREE.Group();
    med.add(
      mesh(new THREE.BoxGeometry(0.52, 0.3, 0.4), medShell, 0, -0.02, 0),   // corpo
      mesh(new THREE.BoxGeometry(0.54, 0.1, 0.42), medLid, 0, 0.16, 0),     // coperchio
      mesh(new THREE.BoxGeometry(0.24, 0.03, 0.05), medMetal, 0, 0.3, 0),   // maniglia (barra)
      mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), medMetal, -0.11, 0.25, 0),
      mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), medMetal, 0.11, 0.25, 0),
      mesh(new THREE.BoxGeometry(0.26, 0.045, 0.08), medCross, 0, 0.215, 0),  // croce sul coperchio
      mesh(new THREE.BoxGeometry(0.08, 0.045, 0.26), medCross, 0, 0.215, 0),
      mesh(new THREE.BoxGeometry(0.2, 0.055, 0.02), medCross, 0, -0.02, 0.205), // croce sul davanti
      mesh(new THREE.BoxGeometry(0.055, 0.2, 0.02), medCross, 0, -0.02, 0.205),
      mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), medMetal, -0.15, 0.05, 0.205), // fibbie
      mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), medMetal, 0.15, 0.05, 0.205),
    );

    // --- MUNIZIONI: cassa metallica militare (verde oliva) con proiettili in OTTONE sul coperchio ---
    const ammoBody = new THREE.MeshStandardMaterial({ color: 0x47502f, roughness: 0.62, metalness: 0.35 });
    const ammoLidMat = new THREE.MeshStandardMaterial({ color: 0x3d4529, roughness: 0.6, metalness: 0.4 });
    const ammoMetal = new THREE.MeshStandardMaterial({ color: 0x2b3120, roughness: 0.5, metalness: 0.6 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8a63a, roughness: 0.28, metalness: 0.95, emissive: 0x281c00, emissiveIntensity: 0.7 });
    const copperTip = new THREE.MeshStandardMaterial({ color: 0xb5723a, roughness: 0.35, metalness: 0.9 });
    const ammoStripe = new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0x7a3d00, emissiveIntensity: 1.7, roughness: 0.5 });
    const ammo = new THREE.Group();
    ammo.add(
      mesh(new THREE.BoxGeometry(0.5, 0.28, 0.32), ammoBody, 0, -0.03, 0),
      mesh(new THREE.BoxGeometry(0.52, 0.06, 0.34), ammoLidMat, 0, 0.13, 0),
      mesh(new THREE.BoxGeometry(0.4, 0.03, 0.24), ammoMetal, 0, 0.17, 0),    // rinforzo coperchio
      mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), ammoMetal, 0, 0.08, 0.17), // chiusura a leva
      mesh(new THREE.BoxGeometry(0.51, 0.05, 0.01), ammoStripe, 0, -0.05, 0.165), // stencil emissivo
    );
    const caseGeo = new THREE.CylinderGeometry(0.032, 0.036, 0.14, 8);
    const tipGeo = new THREE.ConeGeometry(0.032, 0.07, 8);
    for (const [bx, bz, tilt] of [[-0.11, 0.05, 0.35], [0.03, -0.03, -0.5], [0.14, 0.05, 1.15]]) {
      const b = new THREE.Group();
      b.add(mesh(caseGeo, brass, 0, 0, 0), mesh(tipGeo, copperTip, 0, 0.105, 0)); // bossolo + punta
      b.rotation.set(tilt, 0, Math.PI / 2); // sdraiato sul coperchio
      b.position.set(bx, 0.2, bz);
      ammo.add(b);
    }

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
