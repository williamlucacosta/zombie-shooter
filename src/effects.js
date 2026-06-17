// Sistema effetti: particelle (due pool: additive e alpha), decal di sangue,
// numeri di danno, traccianti, anelli d'onda d'urto, luci di sparo, screen shake.

import * as THREE from 'three';

const POINT_VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 pcolor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = alpha;
    vColor = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (280.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINT_FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d) * vAlpha;
    if (a < 0.012) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

class ParticlePool {
  constructor(scene, capacity, additive) {
    this.cap = capacity;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.sizeEnd = new Float32Array(capacity);
    this.sizeStart = new Float32Array(capacity);
    this.alphaArr = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  emit({ pos, vel, color, life = 0.7, size = 0.3, sizeEnd = 0, gravity = -9, drag = 0.5 }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = pos.x; this.pos[i * 3 + 1] = pos.y; this.pos[i * 3 + 2] = pos.z;
    this.vel[i * 3] = vel.x; this.vel[i * 3 + 1] = vel.y; this.vel[i * 3 + 2] = vel.z;
    this._c.set(color);
    this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.sizeStart[i] = size; this.sizeEnd[i] = sizeEnd; this.size[i] = size;
    this.gravity[i] = gravity; this.drag[i] = drag;
    this.alphaArr[i] = 1;
  }

  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alphaArr[i] = 0; this.size[i] = 0; continue; }
      const k = 1 - Math.min(this.drag[i] * dt, 0.9);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // rimbalzo morbido sul terreno
      if (this.pos[i * 3 + 1] < 0.02 && this.gravity[i] !== 0) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] *= -0.25;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alphaArr[i] = Math.min(1, t * 2.2);
      this.size[i] = this.sizeEnd[i] + (this.sizeStart[i] - this.sizeEnd[i]) * t;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.pcolor.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }
}

function makeSplatTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.random() * s * 0.42;
    const x = s / 2 + Math.cos(a) * r;
    const y = s / 2 + Math.sin(a) * r;
    const rad = 4 + Math.random() * (s * 0.16) * (1 - r / (s * 0.45));
    g.fillStyle = `rgba(120, 8, 8, ${0.5 + Math.random() * 0.5})`;
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.additive = new ParticlePool(scene, 2400, true);
    this.alpha = new ParticlePool(scene, 1600, false);
    this.trauma = 0;
    this._tmp = new THREE.Vector3();

    // --- decal di sangue ---
    this.splatTex = makeSplatTexture();
    this.decals = [];
    this.decalCursor = 0;
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
        map: this.splatTex, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      this.decals.push({ mesh: m, life: 0 });
    }

    // --- traccianti ---
    this.tracers = [];
    const trGeo = new THREE.BoxGeometry(0.045, 0.045, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      m.renderOrder = 10;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, maxLife: 0.07 });
    }
    this.tracerCursor = 0;

    // --- anelli (onde d'urto / telegrafi) ---
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 9;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, maxLife: 1, maxR: 1 });
    }
    this.ringCursor = 0;

    // --- numeri di danno ---
    this.numbers = [];
    for (let i = 0; i < 36; i++) {
      const cv = document.createElement('canvas');
      cv.width = 140; cv.height = 70;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(1.6, 0.8, 1);
      sp.visible = false;
      sp.renderOrder = 20;
      this.scene.add(sp);
      this.numbers.push({ sprite: sp, canvas: cv, life: 0, vel: 0 });
    }
    this.numberCursor = 0;

    // --- luci di sparo / esplosione ---
    this.flashLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffe0a0, 0, 14, 2);
      scene.add(l);
      this.flashLights.push(l);
    }
    this.flashCursor = 0;
  }

  // ------------------------------------------------------------- spawner --

  muzzle(pos, dir, colorHex) {
    const l = this.flashLights[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length;
    l.color.set(colorHex);
    l.position.copy(pos).addScaledVector(dir, 0.4);
    l.position.y += 0.05;
    l.intensity = 26;
    for (let i = 0; i < 6; i++) {
      const spread = 0.35;
      this.additive.emit({
        pos,
        vel: this._tmp.set(
          dir.x * (5 + Math.random() * 7) + (Math.random() - 0.5) * spread * 8,
          (Math.random() - 0.2) * 2.2,
          dir.z * (5 + Math.random() * 7) + (Math.random() - 0.5) * spread * 8,
        ),
        color: Math.random() > 0.4 ? 0xffc868 : 0xff8030,
        life: 0.1 + Math.random() * 0.1,
        size: 0.34, sizeEnd: 0.04, gravity: 0, drag: 4,
      });
    }
  }

  tracer(from, to, colorHex) {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    t.mesh.position.lerpVectors(from, to, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, Math.max(len, 0.1));
    t.mesh.material.color.set(colorHex);
    t.mesh.material.opacity = 0.85;
    t.mesh.visible = true;
    t.life = t.maxLife;
  }

  blood(pos, dir, count = 10, colorHex = 0x9e1212) {
    for (let i = 0; i < count; i++) {
      this.alpha.emit({
        pos: this._tmp.set(pos.x, pos.y + (Math.random() - 0.3) * 0.5, pos.z),
        vel: new THREE.Vector3(
          dir.x * (1.5 + Math.random() * 4) + (Math.random() - 0.5) * 3.5,
          1.5 + Math.random() * 3.5,
          dir.z * (1.5 + Math.random() * 4) + (Math.random() - 0.5) * 3.5,
        ),
        color: Math.random() > 0.5 ? colorHex : 0x6e0c0c,
        life: 0.45 + Math.random() * 0.4,
        size: 0.16 + Math.random() * 0.16, sizeEnd: 0.03,
        gravity: -14, drag: 1.2,
      });
    }
  }

  bloodDecal(pos, scale = 1) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.mesh.position.set(pos.x, 0.02 + this.decalCursor * 0.0004, pos.z);
    d.mesh.rotation.z = Math.random() * Math.PI * 2;
    const s = (1.2 + Math.random() * 1.2) * scale;
    d.mesh.scale.set(s, s, 1);
    d.mesh.material.opacity = 0.85;
    d.mesh.visible = true;
    d.life = 20;
  }

  sparks(pos, count = 8) {
    for (let i = 0; i < count; i++) {
      this.additive.emit({
        pos,
        vel: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7),
        color: 0xffd080, life: 0.25 + Math.random() * 0.25,
        size: 0.12, sizeEnd: 0.01, gravity: -16, drag: 1,
      });
    }
  }

  dirt(pos, count = 14) {
    for (let i = 0; i < count; i++) {
      this.alpha.emit({
        pos: this._tmp.set(pos.x + (Math.random() - 0.5) * 0.8, 0.05, pos.z + (Math.random() - 0.5) * 0.8),
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 3),
        color: Math.random() > 0.5 ? 0x4a3b28 : 0x32281a,
        life: 0.5 + Math.random() * 0.5,
        size: 0.2 + Math.random() * 0.2, sizeEnd: 0.05,
        gravity: -13, drag: 0.8,
      });
    }
  }

  heal(pos) {
    for (let i = 0; i < 12; i++) {
      this.additive.emit({
        pos: this._tmp.set(pos.x + (Math.random() - 0.5) * 0.9, 0.2 + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.9),
        vel: new THREE.Vector3(0, 1.6 + Math.random() * 1.4, 0),
        color: 0x4aff7a, life: 0.7 + Math.random() * 0.4,
        size: 0.2, sizeEnd: 0.02, gravity: 0, drag: 0.4,
      });
    }
  }

  /** Colonna di luce + particelle: usata per spawn nemici e drop. */
  spawnPillar(pos, colorHex = 0x66ff88, scale = 1) {
    for (let i = 0; i < 18; i++) {
      this.additive.emit({
        pos: this._tmp.set(pos.x + (Math.random() - 0.5) * 1.1 * scale, 0.05, pos.z + (Math.random() - 0.5) * 1.1 * scale),
        vel: new THREE.Vector3(0, 2.5 + Math.random() * 4 * scale, 0),
        color: colorHex, life: 0.6 + Math.random() * 0.6,
        size: 0.22 * scale, sizeEnd: 0.02, gravity: 0, drag: 0.3,
      });
    }
    this.ring(pos, colorHex, 1.6 * scale, 0.55);
  }

  ring(pos, colorHex, maxR, life = 0.6) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.mesh.position.set(pos.x, 0.06, pos.z);
    r.mesh.material.color.set(colorHex);
    r.mesh.material.opacity = 0.9;
    r.mesh.visible = true;
    r.life = life; r.maxLife = life; r.maxR = maxR;
    r.mesh.scale.set(0.15, 0.15, 1);
  }

  damageNumber(pos, text, colorCss = '#ffd887', crit = false) {
    const n = this.numbers[this.numberCursor];
    this.numberCursor = (this.numberCursor + 1) % this.numbers.length;
    const g = n.canvas.getContext('2d');
    g.clearRect(0, 0, 140, 70);
    g.font = `bold ${crit ? 46 : 34}px Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(text, 70, 35);
    g.fillStyle = crit ? '#ff9030' : colorCss;
    g.fillText(text, 70, 35);
    n.sprite.material.map.needsUpdate = true;
    n.sprite.position.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 1.6, pos.z);
    n.sprite.material.opacity = 1;
    n.sprite.scale.set(crit ? 2.1 : 1.55, crit ? 1.05 : 0.78, 1);
    n.sprite.visible = true;
    n.life = 0.75;
    n.vel = 2.2;
  }

  bigExplosion(pos, colorHex = 0xff7030) {
    const l = this.flashLights[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length;
    l.color.set(colorHex);
    l.position.set(pos.x, 1.5, pos.z);
    l.intensity = 60;
    for (let i = 0; i < 40; i++) {
      this.additive.emit({
        pos: this._tmp.set(pos.x, 0.4, pos.z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 9, (Math.random() - 0.5) * 12),
        color: [0xffc868, 0xff8030, 0xff4010][i % 3],
        life: 0.4 + Math.random() * 0.5,
        size: 0.4, sizeEnd: 0.05, gravity: -6, drag: 1.5,
      });
    }
    this.dirt(pos, 22);
    this.ring(pos, colorHex, 6, 0.5);
  }

  addTrauma(x) { this.trauma = Math.min(1, this.trauma + x); }

  /** Offset di shake da applicare alla camera. */
  shakeOffset(out) {
    const t = this.trauma * this.trauma;
    out.set(
      (Math.random() * 2 - 1) * 0.45 * t,
      (Math.random() * 2 - 1) * 0.3 * t,
      (Math.random() * 2 - 1) * 0.45 * t,
    );
    return out;
  }

  update(dt) {
    this.additive.update(dt);
    this.alpha.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);

    for (const l of this.flashLights) {
      if (l.intensity > 0.01) l.intensity *= Math.pow(0.0001, dt * 16);
      else l.intensity = 0;
    }
    for (const t of this.tracers) {
      if (!t.life) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, (t.life / t.maxLife) * 0.85);
      if (t.life <= 0) { t.life = 0; t.mesh.visible = false; }
    }
    for (const r of this.rings) {
      if (!r.life) continue;
      r.life -= dt;
      const p = 1 - r.life / r.maxLife;
      const s = Math.max(0.15, r.maxR * p);
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = Math.max(0, 0.9 * (1 - p));
      if (r.life <= 0) { r.life = 0; r.mesh.visible = false; }
    }
    for (const d of this.decals) {
      if (!d.life) continue;
      d.life -= dt;
      if (d.life < 4) d.mesh.material.opacity = Math.max(0, d.life / 4 * 0.85);
      if (d.life <= 0) { d.life = 0; d.mesh.visible = false; }
    }
    for (const n of this.numbers) {
      if (!n.life) continue;
      n.life -= dt;
      n.sprite.position.y += n.vel * dt;
      n.vel *= 1 - 2.5 * dt;
      n.sprite.material.opacity = Math.max(0, Math.min(1, n.life / 0.35));
      if (n.life <= 0) { n.life = 0; n.sprite.visible = false; }
    }
  }
}
