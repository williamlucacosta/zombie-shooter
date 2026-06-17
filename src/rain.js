// Pioggia realistica: scrosci (LineSegments inclinati dal vento) che seguono il
// giocatore, schizzi a terra, fulmini con lampo e tuono ritardato dalla distanza.

import * as THREE from 'three';
import { Audio } from './audio.js';

export class Rain {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.target = 0;     // intensità desiderata 0..1
    this.intensity = 0;  // intensità attuale (transizione morbida)
    this.count = 2200;
    this.area = 34;      // raggio della zona di pioggia attorno al giocatore
    this.top = 16;       // altezza di generazione
    this.len = 0.9;      // lunghezza dello scroscio
    this.wind = new THREE.Vector3(2.4, 0, 1.2); // vento (inclinazione)
    this.center = new THREE.Vector3();

    // posizione "alta" di ogni goccia + velocità di caduta
    this.tops = new Float32Array(this.count * 3);
    this.speed = new Float32Array(this.count);
    const verts = new Float32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) {
      this._respawn(i, true);
      this.speed[i] = 26 + Math.random() * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    this.verts = verts;
    this.geo = geo;
    const mat = new THREE.LineBasicMaterial({
      color: 0xaec6ff, transparent: true, opacity: 0.0,
      depthWrite: false, fog: true,
    });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);

    // luce del fulmine: lampo blu-bianco che illumina tutta l'arena
    this.flashLight = new THREE.DirectionalLight(0xcfe0ff, 0);
    this.flashLight.position.set(10, 40, -20);
    scene.add(this.flashLight);
    this.flashAmbient = new THREE.AmbientLight(0xbfd4ff, 0);
    scene.add(this.flashAmbient);
    this.flashT = 0;
    this.flashSeq = [];
    this.nextStrike = 6 + Math.random() * 10;

    this._splashAccum = 0;
  }

  _respawn(i, anywhere) {
    const cx = this.center.x, cz = this.center.z;
    this.tops[i * 3] = cx + (Math.random() - 0.5) * 2 * this.area;
    this.tops[i * 3 + 1] = anywhere ? Math.random() * this.top : this.top + Math.random() * 4;
    this.tops[i * 3 + 2] = cz + (Math.random() - 0.5) * 2 * this.area;
  }

  start(intensity = 1) { this.active = true; this.target = intensity; this.mesh.visible = true; }
  stop() { this.active = false; this.target = 0; }

  /** Scatena un fulmine: lampo a scatti + tuono subito dopo (in sync col lampo). */
  strike() {
    // sequenza di flicker realistica
    this.flashSeq = [
      { t: 0.0, v: 1.0 }, { t: 0.05, v: 0.2 }, { t: 0.09, v: 0.9 },
      { t: 0.16, v: 0.35 }, { t: 0.22, v: 0.6 }, { t: 0.4, v: 0 },
    ];
    this.flashT = 0;
    // tuono legato al lampo: vicino = quasi immediato e forte, lontano = breve ritardo
    const distant = Math.random() < 0.45;
    const delay = distant ? 0.5 + Math.random() * 0.7 : 0.06 + Math.random() * 0.18;
    setTimeout(() => Audio.play('thunder', { vol: distant ? 0.85 : 1.1, rate: distant ? 0.88 : 1 }), delay * 1000);
  }

  update(dt, center, effects) {
    // transizione morbida dell'intensità (indipendente dal framerate)
    this.intensity += (this.target - this.intensity) * (1 - Math.exp(-2.5 * dt));
    if (this.intensity < 0.01 && !this.active) {
      this.mesh.visible = false;
      this.flashLight.intensity = 0;
      this.flashAmbient.intensity = 0;
      return;
    }
    this.mesh.visible = true;
    if (center) this.center.copy(center);

    const visible = Math.floor(this.count * this.intensity);
    this.geo.setDrawRange(0, visible * 2);
    this.mesh.material.opacity = 0.34 * this.intensity;

    const wx = this.wind.x, wz = this.wind.z;
    const slantX = wx * (this.len / 28), slantZ = wz * (this.len / 28);
    const halfArea = this.area;
    for (let i = 0; i < visible; i++) {
      const o = i * 3;
      this.tops[o + 1] -= this.speed[i] * dt;
      this.tops[o] += wx * dt;
      this.tops[o + 2] += wz * dt;
      // ricicla quando tocca terra o esce dalla zona
      if (this.tops[o + 1] < 0 ||
          Math.abs(this.tops[o] - this.center.x) > halfArea ||
          Math.abs(this.tops[o + 2] - this.center.z) > halfArea) {
        if (this.tops[o + 1] < 0 && effects && this._splashAccum > 0) {
          // schizzo a terra ogni tanto
          this._splashAccum--;
          effects.rainSplash(this.tops[o], this.tops[o + 2]);
        }
        this._respawn(i, false);
      }
      const v = i * 6;
      const x = this.tops[o], y = this.tops[o + 1], z = this.tops[o + 2];
      this.verts[v] = x; this.verts[v + 1] = y; this.verts[v + 2] = z;
      this.verts[v + 3] = x - slantX * this.len; this.verts[v + 4] = y - this.len; this.verts[v + 5] = z - slantZ * this.len;
    }
    this.geo.attributes.position.needsUpdate = true;

    // budget di schizzi per frame, proporzionale all'intensità
    this._splashAccum = Math.min(this._splashAccum + this.intensity * 60 * dt, 12);

    // fulmini
    if (this.active && this.intensity > 0.4) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 7 + Math.random() * 13;
        this.strike();
      }
    }

    // animazione del lampo
    if (this.flashSeq.length) {
      this.flashT += dt;
      let val = 0;
      for (let i = this.flashSeq.length - 1; i >= 0; i--) {
        if (this.flashT >= this.flashSeq[i].t) { val = this.flashSeq[i].v; break; }
      }
      this.flashLight.intensity = val * 6;
      this.flashAmbient.intensity = val * 1.4;
      if (this.flashT > this.flashSeq[this.flashSeq.length - 1].t) {
        this.flashSeq = [];
        this.flashLight.intensity = 0;
        this.flashAmbient.intensity = 0;
      }
    }
  }
}
