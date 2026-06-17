// Costruzione dell'ambientazione: cimitero notturno recintato, luce lunare con
// ombre, lanterne tremolanti, nebbia volumetrica bassa, stelle, luna e lucciole.

import * as THREE from 'three';
import { Assets } from './assets.js';
import { CONFIG } from './config.js';

const R = CONFIG.arenaRadius;

function makeRadialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}

// Fallback procedurali per oggetti di scena mancanti.
function fallbackProp(name) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6e7178, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.95 });
  if (name.startsWith('tree')) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 3.6, 6), wood);
    trunk.position.y = 1.8;
    g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.6, 5), wood);
      br.position.set(Math.sin(i * 2.2) * 0.5, 2.4 + i * 0.35, Math.cos(i * 2.2) * 0.5);
      br.rotation.z = 0.7 + Math.sin(i) * 0.5;
      br.rotation.y = i * 1.7;
      g.add(br);
    }
  } else if (name.startsWith('fence')) {
    for (let i = -1; i <= 1; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), wood);
      post.position.set(i * 0.45, 0.55, 0);
      g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.06), wood);
    rail.position.y = 0.85;
    g.add(rail);
  } else if (name.includes('lantern') || name === 'post_lantern') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.8, 6), wood);
    post.position.y = 1.4;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xff9540, emissiveIntensity: 1.4 }));
    lamp.position.y = 2.7;
    g.add(post, lamp);
  } else if (name === 'crypt') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.6), stone);
    base.position.y = 1.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), stone);
    roof.position.y = 3.0;
    roof.rotation.y = Math.PI / 4;
    g.add(base, roof);
  } else {
    // lapide generica
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.16), stone);
    slab.position.y = 0.5;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 12, 1, false, 0, Math.PI), stone);
    top.rotation.z = Math.PI / 2;
    top.rotation.y = Math.PI / 2;
    top.position.y = 1.0;
    g.add(slab, top);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildWorld(scene) {
  const world = {
    colliders: [],
    graves: [],       // punti di spawn tematici
    lanterns: [],     // luci da far tremolare
    _mist: [],
    _fireflies: null,
  };

  // --- atmosfera ---
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x0a0d1a, 0.018);

  const hemi = new THREE.HemisphereLight(0x4a5d85, 0x2a2018, 0.95);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xa8bae5, 1.7);
  moon.position.set(24, 38, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -R - 8;
  moon.shadow.camera.right = R + 8;
  moon.shadow.camera.top = R + 8;
  moon.shadow.camera.bottom = -R - 8;
  moon.shadow.camera.far = 110;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  // --- terreno ---
  const groundMat = new THREE.MeshStandardMaterial({
    map: Assets.groundTexture, color: 0xb0aa9c, roughness: 1.0,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 26, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // vialetto centrale consumato (cerchio più scuro al centro arena)
  const innerTex = makeRadialTexture('rgba(10,8,6,0.5)', 'rgba(10,8,6,0)');
  const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 32),
    new THREE.MeshBasicMaterial({ map: innerTex, transparent: true, depthWrite: false }));
  innerDisc.rotation.x = -Math.PI / 2;
  innerDisc.position.y = 0.01;
  innerDisc.renderOrder = 1;
  scene.add(innerDisc);

  // --- utilità di piazzamento ---
  const placed = [];
  function freeSpot(x, z, r) {
    if (Math.hypot(x, z) < 6 + r) return false;
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < r + p.r + 0.4) return false;
    }
    return true;
  }
  function addProp(name, x, z, rotY, opts = {}) {
    const def = Assets.props.get(name);
    let obj;
    if (def) {
      obj = def.scene.clone();
      obj.scale.setScalar(def.scale * (opts.scaleMult ?? 1));
      obj.position.y = 0;
    } else {
      obj = fallbackProp(name);
      if (opts.scaleMult) obj.scale.setScalar(opts.scaleMult);
    }
    obj.position.x = x;
    obj.position.z = z;
    obj.rotation.y = rotY;
    obj.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(obj);
    const r = opts.collider ?? 0;
    if (r > 0) world.colliders.push({ x, z, r });
    placed.push({ x, z, r: Math.max(r, 0.5) });
    return obj;
  }

  // --- recinzione perimetrale ---
  const fenceR = R + 1.2;
  const segs = Math.floor((2 * Math.PI * fenceR) / 2.0);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * fenceR, z = Math.sin(a) * fenceR;
    const name = Math.random() < 0.18 ? 'fence_broken' : 'fence';
    addProp(name, x, z, -a + Math.PI / 2, { scaleMult: 1.9 });
  }

  // --- cripta a nord ---
  addProp('crypt', 0, -R + 5.5, 0, { collider: 3.2, scaleMult: 1.25 });

  // --- gruppi di lapidi ---
  const graveNames = ['gravestone', 'grave_A', 'gravemarker_A'];
  let graveCount = 0;
  for (let tries = 0; tries < 400 && graveCount < 26; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 9 + Math.random() * (R - 13);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 0.8)) continue;
    const name = graveNames[(Math.random() * graveNames.length) | 0];
    addProp(name, x, z, Math.random() * 0.6 - 0.3 + (Math.random() < 0.5 ? Math.PI : 0), { collider: 0.55 });
    world.graves.push(new THREE.Vector3(x, 0, z));
    graveCount++;
  }

  // --- alberi morti ---
  for (let tries = 0, n = 0; tries < 200 && n < 9; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 14 + Math.random() * (R - 16);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 1.4)) continue;
    addProp(Math.random() < 0.5 ? 'tree_dead_large' : 'tree_dead_medium', x, z, Math.random() * Math.PI * 2, { collider: 0.7 });
    n++;
  }

  // --- lanterne con luce tremolante ---
  const lanternAngles = [0.4, 1.7, 2.9, 4.2, 5.4];
  for (const a of lanternAngles) {
    const d = 12 + (a * 37) % 9;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    addProp('post_lantern', x, z, Math.random() * Math.PI * 2, { collider: 0.35 });
    const light = new THREE.PointLight(0xff9540, 2.4, 13, 1.8);
    light.position.set(x, 2.6, z);
    scene.add(light);
    world.lanterns.push({ light, base: 2.4, seed: Math.random() * 100 });
  }

  // --- decorazioni sparse (senza collisione: ossa, teschi, zucche) ---
  const deco = ['skull', 'ribcage', 'bone_A', 'pumpkin', 'lantern_standing', 'coffin', 'shrine', 'barrel', 'crate'];
  for (let tries = 0, n = 0; tries < 300 && n < 30; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * (R - 10);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 0.6)) continue;
    const name = deco[(Math.random() * deco.length) | 0];
    const heavy = ['coffin', 'shrine', 'barrel', 'crate'].includes(name);
    addProp(name, x, z, Math.random() * Math.PI * 2, { collider: heavy ? 0.6 : 0 });
    if (name === 'pumpkin' || name === 'lantern_standing') {
      const gl = new THREE.PointLight(name === 'pumpkin' ? 0xff7a20 : 0xffb060, 1.0, 5, 2);
      gl.position.set(x, 0.5, z);
      scene.add(gl);
      world.lanterns.push({ light: gl, base: 1.0, seed: Math.random() * 100 });
    }
    n++;
  }

  // --- cielo: stelle ---
  {
    const starCount = 700;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI * 0.45 + 0.06;
      const r2 = 180;
      pos[i * 3] = Math.cos(a) * Math.cos(elev) * r2;
      pos[i * 3 + 1] = Math.sin(elev) * r2;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(elev) * r2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcdd8ff, size: 0.65, sizeAttenuation: false, fog: false,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    scene.add(stars);
  }

  // --- luna piena con alone ---
  {
    const moonTex = makeRadialTexture('rgba(235,240,255,1)', 'rgba(160,180,255,0)');
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex, fog: false, transparent: true, depthWrite: false, opacity: 0.95,
    }));
    sp.position.set(85, 95, -120);
    sp.scale.setScalar(34);
    scene.add(sp);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTexture('rgba(245,248,255,1)', 'rgba(225,232,255,0.9)'), fog: false,
      transparent: true, depthWrite: false,
    }));
    core.position.copy(sp.position);
    core.scale.setScalar(13);
    scene.add(core);
  }

  // --- nebbia bassa che deriva ---
  {
    const mistTex = makeRadialTexture('rgba(168,182,214,0.45)', 'rgba(168,182,214,0)');
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(16 + Math.random() * 12, 16 + Math.random() * 12),
        new THREE.MeshBasicMaterial({
          map: mistTex, transparent: true, opacity: 0.1, depthWrite: false, fog: true,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set((Math.random() - 0.5) * 2 * R, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 2 * R);
      m.renderOrder = 3;
      scene.add(m);
      world._mist.push({ mesh: m, seed: Math.random() * 100, speed: 0.2 + Math.random() * 0.3 });
    }
  }

  // --- lucciole ---
  {
    const n = 70;
    const pos = new Float32Array(n * 3);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 8 + Math.random() * (R - 4);
      seeds.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.5 + Math.random() * 1.6, p: Math.random() * 100 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc8e87a, size: 0.14, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    world._fireflies = { pts, seeds, pos };
  }

  world.update = (dt, t) => {
    for (const l of world.lanterns) {
      const s = l.seed;
      l.light.intensity = l.base * (0.78 + 0.22 * Math.sin(t * 9 + s) * Math.sin(t * 23.7 + s * 2) + 0.08 * Math.sin(t * 47 + s));
    }
    for (const m of world._mist) {
      m.mesh.position.x += Math.sin(t * 0.07 + m.seed) * m.speed * dt;
      m.mesh.position.z += Math.cos(t * 0.05 + m.seed * 1.3) * m.speed * dt;
      m.mesh.rotation.z += dt * 0.02;
      m.mesh.material.opacity = 0.09 + 0.04 * Math.sin(t * 0.3 + m.seed);
    }
    const ff = world._fireflies;
    if (ff) {
      for (let i = 0; i < ff.seeds.length; i++) {
        const s = ff.seeds[i];
        ff.pos[i * 3] = s.x + Math.sin(t * 0.5 + s.p) * 1.5;
        ff.pos[i * 3 + 1] = s.y + Math.sin(t * 0.8 + s.p * 2) * 0.45;
        ff.pos[i * 3 + 2] = s.z + Math.cos(t * 0.4 + s.p) * 1.5;
      }
      ff.pts.geometry.attributes.position.needsUpdate = true;
      ff.pts.material.opacity = 0.55 + 0.4 * Math.sin(t * 2.2);
    }
  };

  return world;
}
