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

/** Texture additiva per il lampo di volata: nucleo rovente + raggi a stella. */
function makeFlashTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const cx = s / 2, cy = s / 2;
  // alone caldo
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  halo.addColorStop(0, 'rgba(255,255,235,1)');
  halo.addColorStop(0.18, 'rgba(255,224,150,0.95)');
  halo.addColorStop(0.45, 'rgba(255,150,60,0.45)');
  halo.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, s, s);
  // raggi a stella (4 lunghi + 4 corti)
  g.translate(cx, cy);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    const len = (long ? 0.46 : 0.26) * s;
    const w = (long ? 0.05 : 0.03) * s;
    g.rotate(Math.PI / 4);
    const ray = g.createLinearGradient(0, 0, len, 0);
    ray.addColorStop(0, 'rgba(255,245,210,0.9)');
    ray.addColorStop(1, 'rgba(255,160,70,0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Alone morbido rotondo: il bagliore caldo che avvolge il lampo di volata (strato esterno). */
function makeGlowTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,250,235,1)');
  grad.addColorStop(0.3, 'rgba(255,200,120,0.7)');
  grad.addColorStop(0.7, 'rgba(255,130,50,0.22)');
  grad.addColorStop(1, 'rgba(255,110,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
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
    this._tmp2 = new THREE.Vector3();

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

    // --- lampi di volata (sprite billboard additivi sopra la canna) ---
    // Ogni sparo accende DUE sprite sovrapposti: un nucleo bianco-caldo a stella (flashTex)
    // e un alone arancio morbido (glowTex). Collassano rapidamente -> lampo secco e brillante.
    this.flashTex = makeFlashTexture();
    this.glowTex = makeGlowTexture();
    this.muzzleFlashes = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.flashTex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, rotation: 0,
      }));
      sp.visible = false;
      sp.renderOrder = 18;
      scene.add(sp);
      this.muzzleFlashes.push({ sprite: sp, life: 0, maxLife: 0.055, baseScale: 1 });
    }
    this.muzzleCursor = 0;
  }

  // ------------------------------------------------------------- spawner --

  /** Accende uno sprite del pool come strato del lampo di volata. */
  _flash(tex, pos, dir, colorHex, baseScale, maxLife, spin) {
    const f = this.muzzleFlashes[this.muzzleCursor];
    this.muzzleCursor = (this.muzzleCursor + 1) % this.muzzleFlashes.length;
    f.sprite.material.map = tex;
    f.sprite.position.copy(pos).addScaledVector(dir, 0.14);
    f.sprite.position.y += 0.02;
    f.baseScale = baseScale;
    f.sprite.material.rotation = spin ? Math.random() * Math.PI * 2 : 0;
    f.sprite.material.color.set(colorHex);
    f.sprite.material.opacity = 1;
    f.sprite.material.needsUpdate = true;
    f.sprite.visible = true;
    f.life = maxLife; f.maxLife = maxLife;
  }

  muzzle(pos, dir, colorHex, scale = 1) {
    // luce a impulso: viva e secca (decadimento rapido nell'update)
    const l = this.flashLights[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length;
    l.color.set(colorHex);
    l.position.copy(pos).addScaledVector(dir, 0.3);
    l.position.y += 0.04;
    l.intensity = 34 * scale;

    // due strati: alone arancio morbido (dietro) + nucleo bianco-caldo a stella (davanti),
    // entrambi collassano in pochi centesimi -> lampo di volata netto e brillante.
    this._flash(this.glowTex, pos, dir, colorHex, (1.5 + Math.random() * 0.7) * scale, 0.07, false);
    this._flash(this.flashTex, pos, dir, 0xfff4e2, (0.8 + Math.random() * 0.45) * scale, 0.05, true);

    // scintille incandescenti proiettate in avanti in un cono stretto
    const sparks = Math.round(8 * scale);
    for (let i = 0; i < sparks; i++) {
      const spread = 0.24;
      this.additive.emit({
        pos,
        vel: this._tmp.set(
          dir.x * (11 + Math.random() * 14) + (Math.random() - 0.5) * spread * 11,
          (Math.random() - 0.1) * 2.4,
          dir.z * (11 + Math.random() * 14) + (Math.random() - 0.5) * spread * 11,
        ),
        color: Math.random() > 0.45 ? 0xfff0c0 : 0xff8a30,
        life: 0.06 + Math.random() * 0.1,
        size: 0.26 * scale, sizeEnd: 0.015, gravity: -3, drag: 5,
      });
    }
    // sbuffo di fumo che si gonfia e si allontana dalla canna (pool alpha)
    for (let i = 0; i < 3; i++) {
      this.alpha.emit({
        pos: this._tmp.set(pos.x + dir.x * 0.2, pos.y + 0.05, pos.z + dir.z * 0.2),
        vel: this._tmp2.set(
          dir.x * (1.2 + Math.random() * 1.8) + (Math.random() - 0.5) * 1.2,
          0.5 + Math.random() * 0.9,
          dir.z * (1.2 + Math.random() * 1.8) + (Math.random() - 0.5) * 1.2,
        ),
        color: 0x6b6660, life: 0.3 + Math.random() * 0.3,
        size: 0.14 * scale, sizeEnd: 0.5 * scale, gravity: 0.4, drag: 2.2,
      });
    }
  }

  /**
   * Lampo di volata per il VIEWMODEL in prima persona: piccolo, netto e ancorato alla bocca
   * della canna (pos = punta canna, dir = asse della canna). Dimensioni ridotte perché la
   * camera è a pochi decimetri: niente "flash a tutto schermo", solo un vampata sulla volata.
   */
  muzzleViewmodel(pos, dir, colorHex) {
    // luce d'impulso alla bocca: illumina mani, arma e ambiente vicino (non è uno sprite)
    const l = this.flashLights[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length;
    l.color.set(colorHex);
    l.position.copy(pos);
    l.intensity = 11;
    // due sprite PICCOLI alla bocca: alone caldo + nucleo bianco-caldo a stella, collassano subito
    this._flash(this.glowTex, pos, dir, colorHex, 0.27 + Math.random() * 0.08, 0.05, false);
    this._flash(this.flashTex, pos, dir, 0xfff4e2, 0.17 + Math.random() * 0.06, 0.045, true);
    // breve spruzzo di scintille lungo la canna (segue la direzione reale dell'arma)
    for (let i = 0; i < 6; i++) {
      this.additive.emit({
        pos,
        vel: this._tmp.set(
          dir.x * (5 + Math.random() * 6) + (Math.random() - 0.5) * 1.8,
          dir.y * (5 + Math.random() * 6) + (Math.random() - 0.4) * 1.4,
          dir.z * (5 + Math.random() * 6) + (Math.random() - 0.5) * 1.8,
        ),
        color: Math.random() > 0.5 ? 0xfff0c0 : 0xff8a30,
        life: 0.05 + Math.random() * 0.08, size: 0.06, sizeEnd: 0.008, gravity: -2, drag: 5,
      });
    }
    // piccolo sbuffo di fumo che esce dalla volata
    this.alpha.emit({
      pos: this._tmp.set(pos.x + dir.x * 0.1, pos.y + dir.y * 0.1 + 0.02, pos.z + dir.z * 0.1),
      vel: this._tmp2.set(dir.x * 0.9, 0.4, dir.z * 0.9),
      color: 0x6b6660, life: 0.32, size: 0.07, sizeEnd: 0.26, gravity: 0.3, drag: 2.2,
    });
  }

  /** Impatto del proiettile: scintille a stella + zaffata di fumo (sul bersaglio o sul terreno). */
  bulletImpact(pos, colorHex = 0xffd9a0) {
    for (let i = 0; i < 7; i++) {
      this.additive.emit({
        pos,
        vel: this._tmp.set((Math.random() - 0.5) * 7, Math.random() * 4.5, (Math.random() - 0.5) * 7),
        color: Math.random() > 0.5 ? colorHex : 0xff9a40, life: 0.08 + Math.random() * 0.13,
        size: 0.13, sizeEnd: 0.01, gravity: -12, drag: 1.6,
      });
    }
    // piccolo lampo additivo immediato nel punto d'impatto
    this.additive.emit({
      pos, vel: this._tmp.set(0, 0, 0),
      color: 0xfff0d0, life: 0.06, size: 0.34, sizeEnd: 0.02, gravity: 0, drag: 1,
    });
  }

  /**
   * Onda d'urto a terra: anello interno bianco rapido + anello esterno colorato + ghiera di
   * polvere sollevata. Primitiva per impatti pesanti (slam, schianti, fine carica).
   */
  shockwave(pos, colorHex, maxR = 7, life = 0.55) {
    this.ring(pos, 0xffffff, maxR * 0.55, life * 0.65); // fronte interno bianco, scatta veloce
    this.ring(pos, colorHex, maxR, life);               // fronte esterno colorato
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.25;
      const sp = 5 + Math.random() * 5;
      this.alpha.emit({
        pos: this._tmp.set(pos.x + Math.cos(a) * 0.6, 0.1, pos.z + Math.sin(a) * 0.6),
        vel: this._tmp2.set(Math.cos(a) * sp, 1.4 + Math.random() * 2, Math.sin(a) * sp),
        color: Math.random() > 0.5 ? 0x6a5a44 : 0x453829,
        life: 0.5 + Math.random() * 0.4, size: 0.28, sizeEnd: 0.95, gravity: -5, drag: 1.8,
      });
    }
  }

  /** Detriti scagliati: blocchi scuri che volano e ricadono pesantemente. */
  debris(pos, count = 14, colorHex = 0x3a3026) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      this.alpha.emit({
        pos: this._tmp.set(pos.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.6),
        vel: this._tmp2.set(Math.cos(a) * sp, 4 + Math.random() * 7, Math.sin(a) * sp),
        color: Math.random() > 0.3 ? colorHex : 0x4a3b28,
        life: 0.55 + Math.random() * 0.55, size: 0.16 + Math.random() * 0.24, sizeEnd: 0.05,
        gravity: -22, drag: 0.4,
      });
    }
  }

  /**
   * Telegrafo della carica del boss: corsia luminosa di braci lungo la traiettoria (avviso di
   * "dove sto per caricare") + anello di partenza. Si addensa verso il bersaglio.
   */
  chargeTelegraph(pos, dir, len, colorHex) {
    const steps = Math.max(3, Math.round(len));
    for (let i = 0; i < steps; i++) {
      const d = 1.4 + i * (len / steps);
      this.additive.emit({
        pos: this._tmp.set(pos.x + dir.x * d + (Math.random() - 0.5) * 0.5, 0.12, pos.z + dir.z * d + (Math.random() - 0.5) * 0.5),
        vel: this._tmp2.set(0, 0.6 + Math.random() * 0.7, 0),
        color: colorHex, life: 0.55, size: 0.34, sizeEnd: 0.04, gravity: 0, drag: 1,
      });
    }
    this.ring(pos, colorHex, 3, 0.85);
    this.ring(pos, 0xffd060, 1.6, 0.85);
  }

  /** Scia della carica del boss: fuoco/energia tinta boss che sfreccia all'indietro + polvere. */
  chargeTrail(pos, dir, colorHex) {
    for (let i = 0; i < 2; i++) {
      this.additive.emit({
        pos: this._tmp.set(pos.x - dir.x * 0.3 + (Math.random() - 0.5) * 1.1, 0.8 + Math.random() * 1.7, pos.z - dir.z * 0.3 + (Math.random() - 0.5) * 1.1),
        vel: this._tmp2.set(-dir.x * (3 + Math.random() * 4), 0.4 + Math.random() * 1.4, -dir.z * (3 + Math.random() * 4)),
        color: Math.random() > 0.5 ? colorHex : 0xff7a30,
        life: 0.3 + Math.random() * 0.18, size: 0.5, sizeEnd: 0.04, gravity: 1.2, drag: 2.2,
      });
    }
    this.dirt(pos, 3);
  }

  /** Raffica d'aria all'avvio dello scatto: flash, doppia onda a terra, cono di vento + polvere. */
  dashBurst(pos, dir) {
    // breve flash freddo per "stacco" istantaneo
    const l = this.flashLights[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length;
    l.color.set(0x8fe0ff);
    l.position.set(pos.x, 1.2, pos.z);
    l.intensity = 13;
    // doppia onda concentrica a terra
    this.ring(pos, 0xd6f6ff, 3.8, 0.3);
    this.ring(pos, 0x6fd0ff, 2.3, 0.42);
    // cono di scintille fredde proiettate all'indietro (più denso e veloce)
    for (let i = 0; i < 22; i++) {
      const side = (Math.random() - 0.5);
      const sp = 8 + Math.random() * 11;
      this.additive.emit({
        pos: this._tmp.set(pos.x - dir.x * 0.2, 0.5 + Math.random() * 1.3, pos.z - dir.z * 0.2),
        vel: this._tmp2.set(
          -dir.x * sp - dir.z * side * 8,
          (Math.random() - 0.3) * 1.8,
          -dir.z * sp + dir.x * side * 8,
        ),
        color: Math.random() > 0.5 ? 0xdef7ff : 0x6fccff,
        life: 0.16 + Math.random() * 0.18, size: 0.4, sizeEnd: 0.02, gravity: 0, drag: 3.6,
      });
    }
    this.dirt(pos, 10);
  }

  /** Scia d'aria continua durante lo scatto: nucleo luminoso, vento all'indietro, polvere. */
  dashTrail(pos, dir) {
    // nucleo luminoso che resta sulla traiettoria (la "scia" energetica)
    this.additive.emit({
      pos: this._tmp.set(pos.x, 1.0, pos.z),
      vel: this._tmp2.set(0, 0.1, 0),
      color: 0x9fe6ff, life: 0.22, size: 0.66, sizeEnd: 0.05, gravity: 0, drag: 1.5,
    });
    for (let i = 0; i < 2; i++) {
      const side = (i === 0 ? 1 : -1) * (0.6 + Math.random() * 0.9);
      this.additive.emit({
        pos: this._tmp.set(pos.x - dir.x * 0.3, 0.7 + Math.random() * 0.8, pos.z - dir.z * 0.3),
        vel: this._tmp2.set(
          -dir.x * (5 + Math.random() * 5) - dir.z * side * 3,
          0.2 + Math.random() * 0.4,
          -dir.z * (5 + Math.random() * 5) + dir.x * side * 3,
        ),
        color: 0x9fe0ff, life: 0.26, size: 0.5, sizeEnd: 0.03, gravity: 0, drag: 2.6,
      });
    }
    // velo spettrale del corpo
    this.additive.emit({
      pos: this._tmp.set(pos.x, 0.95, pos.z),
      vel: this._tmp2.set(0, 0.2, 0),
      color: 0x5ad0ff, life: 0.3, size: 0.55, sizeEnd: 0.04, gravity: 0, drag: 2,
    });
    // polvere sollevata che resta indietro
    if (Math.random() < 0.7) {
      this.alpha.emit({
        pos: this._tmp.set(pos.x - dir.x * 0.4, 0.06, pos.z - dir.z * 0.4),
        vel: this._tmp2.set(-dir.x * 1.5 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, -dir.z * 1.5 + (Math.random() - 0.5) * 1.5),
        color: 0x6a5a44, life: 0.4, size: 0.2, sizeEnd: 0.02, gravity: -8, drag: 1.2,
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

  /**
   * Schizzo di sangue PREMIUM all'impatto del proiettile: ventaglio direzionale di gocce
   * fini lungo la traiettoria, alcune gocce "grasse" pesanti che schizzano lontano (contrasto
   * di scala) e una nube di aerosol che si gonfia e svanisce. NIENTE pozze a terra: le gocce
   * ricadono e si dissolvono in fretta. Leggero e SENZA allocazioni (riusa i temp): adatto a
   * spararne molti al secondo.
   */
  blood(pos, dir, count = 10, colorHex = 0x8e1010) {
    // ventaglio di gocce fini eiettate lungo il proiettile (cono orizzontale + spinta in alto)
    for (let i = 0; i < count; i++) {
      const a = (Math.random() - 0.5) * 1.5;            // apertura del ventaglio
      const cs = Math.cos(a), sn = Math.sin(a);
      const dx = dir.x * cs - dir.z * sn, dz = dir.x * sn + dir.z * cs;
      const sp = 4 + Math.random() * 9;
      this.alpha.emit({
        pos: this._tmp.set(pos.x, pos.y + (Math.random() - 0.4) * 0.5, pos.z),
        vel: this._tmp2.set(dx * sp, 1.6 + Math.random() * 4.4, dz * sp),
        color: Math.random() > 0.5 ? colorHex : 0x5a0606,
        life: 0.26 + Math.random() * 0.32,
        size: 0.045 + Math.random() * 0.11, sizeEnd: 0.008,
        gravity: -20, drag: 1.1,
      });
    }
    // alcune gocce "grasse" pesanti che volano più lontano (il contrasto di scala = premium)
    const fat = 2 + (count >= 14 ? 2 : 0);
    for (let i = 0; i < fat; i++) {
      const a = (Math.random() - 0.5) * 1.0;
      const cs = Math.cos(a), sn = Math.sin(a);
      const dx = dir.x * cs - dir.z * sn, dz = dir.x * sn + dir.z * cs;
      const sp = 5 + Math.random() * 7;
      this.alpha.emit({
        pos: this._tmp.set(pos.x, pos.y + 0.1, pos.z),
        vel: this._tmp2.set(dx * sp, 2.2 + Math.random() * 3, dz * sp),
        color: 0x6e0a0a,
        life: 0.4 + Math.random() * 0.28,
        size: 0.16 + Math.random() * 0.12, sizeEnd: 0.02,
        gravity: -16, drag: 0.9,
      });
    }
    // nube di aerosol fine spinta in avanti: si gonfia e svanisce subito (vampata d'impatto)
    for (let i = 0; i < 4; i++) {
      this.alpha.emit({
        pos: this._tmp.set(pos.x, pos.y + 0.08, pos.z),
        vel: this._tmp2.set(
          dir.x * (2 + Math.random() * 2.4) + (Math.random() - 0.5) * 1.6,
          0.6 + Math.random() * 1.3,
          dir.z * (2 + Math.random() * 2.4) + (Math.random() - 0.5) * 1.6,
        ),
        color: Math.random() > 0.5 ? 0x720c0c : 0x4a0404,
        life: 0.2 + Math.random() * 0.14,
        size: 0.16, sizeEnd: 0.52, gravity: 0.5, drag: 3.4,
      });
    }
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

  rainSplash(x, z) {
    for (let i = 0; i < 2; i++) {
      this.alpha.emit({
        pos: this._tmp.set(x, 0.02, z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.3, 0.9 + Math.random() * 1.3, (Math.random() - 0.5) * 1.3),
        color: 0x9fb6e0, life: 0.22 + Math.random() * 0.12,
        size: 0.06, sizeEnd: 0.01, gravity: -12, drag: 1,
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
    for (const f of this.muzzleFlashes) {
      if (!f.life) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.maxLife);
      // grande e luminoso all'istante dello sparo, poi collassa rapidamente (lampo secco)
      const s = f.baseScale * (0.55 + 0.95 * k);
      f.sprite.scale.set(s, s, 1);
      f.sprite.material.opacity = Math.min(1, k * 1.5);
      if (f.life <= 0) { f.life = 0; f.sprite.visible = false; }
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
