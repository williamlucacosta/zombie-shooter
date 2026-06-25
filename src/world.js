// Costruzione dell'ambientazione: cimitero notturno recintato, luce lunare con
// ombre, lanterne tremolanti, nebbia volumetrica bassa, stelle, luna e lucciole.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Assets } from './assets.js';
import { CONFIG, ZONES } from './config.js';

const R = CONFIG.arenaRadius;       // recinto perimetrale dell'hub
const HUB_R = CONFIG.hubRadius;     // raggio dell'area giocabile dell'hub
const OVERLAP = 9;                  // sovrapposizione hub<->zona al varco

// Materiale PBR realistico da un set Assets.tex (PolyHaven CC0): diffuse + normale + rugosità.
function pbrMat(set, { color = 0xffffff, roughness = 1, normalScale = 0.8 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  if (set) {
    if (set.map) m.map = set.map;
    if (set.normalMap) { m.normalMap = set.normalMap; m.normalScale = new THREE.Vector2(normalScale, normalScale); }
    if (set.roughnessMap) m.roughnessMap = set.roughnessMap;
  }
  return m;
}

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
    graves: [],       // punti di spawn dell'hub
    lanterns: [],     // luci da far tremolare
    rooms: [{ cx: 0, cz: 0, r: HUB_R, active: true, id: 'hub' }], // hub sempre attivo
    gates: [],        // porte verso le zone
    spawnPoints: [],  // { x, z, zone } per le zone (gli hub usano world.graves)
    maxExtent: HUB_R, // distanza massima raggiungibile (per despawn proiettili)
    atmoFog: new THREE.Color(0x0a0d1a),
    atmoDensity: 0.018,
    _mist: [],
    _fireflies: null,
  };

  // geometria delle zone: ognuna è un cerchio fuori dall'hub, sovrapposto al varco
  const ZGEOM = ZONES.map((z) => {
    const dir = new THREE.Vector3(Math.cos(z.angle), 0, Math.sin(z.angle));
    const centerDist = HUB_R + z.radius - OVERLAP;
    const center = dir.clone().multiplyScalar(centerDist);
    const gatePos = dir.clone().multiplyScalar(HUB_R + 1.5);
    world.maxExtent = Math.max(world.maxExtent, centerDist + z.radius);
    return { zone: z, dir, center, gatePos, gateAngle: z.angle };
  });

  // --- atmosfera ---
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x0a0d1a, 0.018);

  const hemi = new THREE.HemisphereLight(0x4a5d85, 0x2a2018, 1.05);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xa8bae5, 2.0);
  moon.position.set(24, 38, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.radius = 3; // bordi d'ombra più morbidi (PCFSoftShadowMap)
  const shadowExt = world.maxExtent + 12;
  moon.shadow.camera.left = -shadowExt;
  moon.shadow.camera.right = shadowExt;
  moon.shadow.camera.top = shadowExt;
  moon.shadow.camera.bottom = -shadowExt;
  moon.shadow.camera.far = 140;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  // --- terreno (PBR realistico: diffuse + normale + rugosità) ---
  const groundMat = Assets.tex.hubGround
    ? pbrMat(Assets.tex.hubGround, { color: 0x9a9282, roughness: 1.0, normalScale: 0.9 })
    : new THREE.MeshStandardMaterial({ map: Assets.groundTexture, color: 0xb0aa9c, roughness: 1.0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(world.maxExtent + 20, 72), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // piazzale di pietra centrale (sagrato consumato): superficie PBR realistica e senso del luogo.
  // Lascia libero il centro dove parte il giocatore; le tombe più interne ci poggiano sopra.
  if (Assets.tex.cobble) {
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 56),
      pbrMat(Assets.tex.cobble, { color: 0x6e6862, roughness: 0.98, normalScale: 0.9 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.012;
    plaza.receiveShadow = true;
    scene.add(plaza);
  }

  // vialetto centrale consumato (grime scuro che sporca il sagrato e la terra al centro)
  const innerTex = makeRadialTexture('rgba(10,8,6,0.5)', 'rgba(10,8,6,0)');
  const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 32),
    new THREE.MeshBasicMaterial({ map: innerTex, transparent: true, depthWrite: false }));
  innerDisc.rotation.x = -Math.PI / 2;
  innerDisc.position.y = 0.022;
  innerDisc.renderOrder = 2;
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

  // ---- pietra PBR realistica: lapidi, mausoleo e statue procedurali (sostituiscono i low-poly) ----
  // Materiale roccia PolyHaven condiviso da tutte le lapidi -> una sola geometria-material, leggero.
  const stoneMat = pbrMat(Assets.tex.graveStone || Assets.tex.rock, { color: 0xa7a092, roughness: 0.95, normalScale: 0.85 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x434b2c, roughness: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 1 });
  const GRAVE_KINDS = ['slab', 'slab', 'cross', 'obelisk', 'broken'];

  function makeGravestone(kind) {
    const g = new THREE.Group();
    if (kind === 'cross') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.17), stoneMat); post.position.y = 0.75;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, 0.17), stoneMat); arm.position.y = 1.12;
      g.add(post, arm);
    } else if (kind === 'obelisk') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), stoneMat); base.position.y = 0.14;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1.6, 4), stoneMat); col.position.y = 1.05; col.rotation.y = Math.PI / 4;
      g.add(base, col);
    } else if (kind === 'broken') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.85, 0.15), stoneMat);
      slab.position.set(0, 0.4, 0); slab.rotation.z = 0.22 + Math.random() * 0.22; // spezzata/inclinata
      g.add(slab);
    } else { // lastra rettangolare con cornice in cima (default)
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.0, 0.16), stoneMat); body.position.y = 0.5;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.24), stoneMat); cap.position.y = 1.04;
      g.add(body, cap);
    }
    const moss = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.42), mossMat); moss.position.y = 0.05; // terra/muschio alla base
    g.add(moss);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    return g;
  }

  function placeGrave(x, z, rotY) {
    const gs = makeGravestone(GRAVE_KINDS[(Math.random() * GRAVE_KINDS.length) | 0]);
    gs.position.set(x, 0, z);
    gs.rotation.y = rotY;
    gs.rotation.x = (Math.random() - 0.5) * 0.1; // affondamento/inclinazione da abbandono
    scene.add(gs);
    world.colliders.push({ x, z, r: 0.45 });
    placed.push({ x, z, r: 0.6 });
  }

  // mausoleo di pietra (sostituisce la cripta low-poly): corpo + cornicione + tetto a 4 falde +
  // porta scura + architrave + croce sulla cima.
  function placeMausoleum(x, z, rotY, collider = 2.2) {
    const g = new THREE.Group();
    const w = 2.8, d = 3.2, h = 2.3;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat); body.position.y = h / 2;
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.24, d + 0.3), stoneMat); cornice.position.y = h + 0.1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.1, 4), stoneMat);
    roof.rotation.y = Math.PI / 4; roof.position.y = h + 0.75; roof.scale.z = d / w;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.7, 0.25), darkMat); door.position.set(0, 0.85, d / 2 - 0.06);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.3), stoneMat); lintel.position.set(0, 1.78, d / 2 - 0.02);
    const cp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.66, 0.12), stoneMat); cp.position.y = h + 1.55;
    const ca = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.12), stoneMat); ca.position.y = h + 1.62;
    g.add(body, cornice, roof, door, lintel, cp, ca);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    scene.add(g);
    if (collider > 0) world.colliders.push({ x, z, r: collider });
    placed.push({ x, z, r: Math.max(collider, 1.6) });
  }

  // monumento: plinto di pietra PBR + busto realistico (statue_bust) in cima
  function placeStatue(x, z, rotY) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), stoneMat); plinth.position.set(x, 0.55, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.14, 0.74), stoneMat); cap.position.set(x, 1.14, z);
    plinth.castShadow = cap.castShadow = true; plinth.receiveShadow = cap.receiveShadow = true;
    scene.add(plinth, cap);
    const bust = Assets.props.get('statue_bust');
    if (bust) {
      const b = bust.scene.clone();
      b.scale.setScalar(bust.scale);
      b.position.set(x, 1.21, z);
      b.rotation.y = rotY + Math.PI;
      b.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      scene.add(b);
    }
    world.colliders.push({ x, z, r: 0.5 });
    placed.push({ x, z, r: 0.7 });
  }

  // ---- alberi morti PROCEDURALI con corteccia realistica (sostituiscono i low-poly KayKit) ----
  // Corteccia presa dai tronchi PolyHaven (riusata) -> aspetto realistico; geometria ramificata
  // FUSA in un'unica mesh per albero (1 draw-call), poche centinaia di triangoli.
  let barkMat = null;
  const barkSrc = Assets.props.get('log_fallen_big') || Assets.props.get('log_fallen');
  if (barkSrc) barkSrc.scene.traverse((o) => { if (o.isMesh && o.material && !barkMat) barkMat = o.material; });
  if (!barkMat) barkMat = new THREE.MeshStandardMaterial({ color: 0x3a2f25, roughness: 1 });

  const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
  function deadTreeGeometry(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const parts = [];
    const limb = (base, dir, len, r0, r1, depth) => {
      const geo = new THREE.CylinderGeometry(r1, r0, len, depth > 1 ? 6 : 5, 1, true);
      const d = dir.clone().normalize();
      _q.setFromUnitVectors(_up, d);
      _m.compose(base.clone().addScaledVector(d, len / 2), _q, _one);
      geo.applyMatrix4(_m);
      parts.push(geo);
      const tip = base.clone().addScaledVector(d, len);
      if (depth > 0) {
        const nb = depth >= 2 ? 2 + (rnd() * 2 | 0) : 1 + (rnd() * 2 | 0);
        for (let i = 0; i < nb; i++) {
          const ang = rnd() * Math.PI * 2, tilt = 0.5 + rnd() * 0.7;
          const nd = new THREE.Vector3(Math.cos(ang) * Math.sin(tilt), Math.cos(tilt) + 0.25, Math.sin(ang) * Math.sin(tilt));
          limb(tip, nd, len * (0.58 + rnd() * 0.22), r1, r1 * 0.55, depth - 1);
        }
      }
    };
    limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3((rnd() - 0.5) * 0.25, 1, (rnd() - 0.5) * 0.25), 2.3, 0.24, 0.17, 3);
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
  }
  const TREE_GEOS = [deadTreeGeometry(2), deadTreeGeometry(7), deadTreeGeometry(13), deadTreeGeometry(23)];
  function placeDeadTree(x, z, scale = 1.4, collider = 0.5) {
    const geo = TREE_GEOS[(Math.random() * TREE_GEOS.length) | 0];
    const m = new THREE.Mesh(geo, barkMat);
    const sc = scale * (0.85 + Math.random() * 0.4);
    m.scale.set(sc, sc * (0.95 + Math.random() * 0.3), sc);
    m.position.set(x, 0, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = true;
    scene.add(m);
    if (collider > 0) world.colliders.push({ x, z, r: collider });
    placed.push({ x, z, r: 0.8 });
  }

  // ---- staccionata in FERRO BATTUTO (sostituisce la palizzata bianca low-poly) ----
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.65, roughness: 0.45 });
  function ironPanelGeometry(width) {
    const parts = [];
    const box = (w, h, d, y, x = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, 0); parts.push(g); };
    box(width, 0.05, 0.05, 0.4); box(width, 0.05, 0.05, 1.05); // due correnti orizzontali
    const bars = 7;
    for (let i = 0; i < bars; i++) {
      const x = -width / 2 + 0.13 + (i / (bars - 1)) * (width - 0.26);
      box(0.045, 1.25, 0.045, 0.62, x);                    // sbarra
      const tip = new THREE.ConeGeometry(0.05, 0.16, 4); tip.translate(x, 1.32, 0); parts.push(tip); // punta a lancia
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
  }
  const IRON_PANEL = ironPanelGeometry(2.05);

  // --- recinzione perimetrale (con varchi in corrispondenza delle porte) ---
  const fenceR = R + 1.2;
  const segs = Math.floor((2 * Math.PI * fenceR) / 2.0);
  const gateHalf = 0.16; // ampiezza angolare del varco (rad)
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    // salta i segmenti dove c'è una porta verso una zona
    let atGate = false;
    for (const g of ZGEOM) {
      let da = Math.abs(((a - g.gateAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < gateHalf) { atGate = true; break; }
    }
    if (atGate) continue;
    const x = Math.cos(a) * fenceR, z = Math.sin(a) * fenceR;
    const panel = new THREE.Mesh(IRON_PANEL, ironMat);
    panel.position.set(x, 0, z);
    panel.rotation.y = -a + Math.PI / 2;
    panel.castShadow = true; panel.receiveShadow = true; panel.frustumCulled = true;
    scene.add(panel);
    if (i % 5 === 0) { // pilastro di pietra ogni 5 campate
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.7, 0.42), stoneMat);
      post.position.set(x, 0.85, z); post.rotation.y = -a; post.castShadow = true; post.receiveShadow = true;
      scene.add(post);
    }
  }

  // --- mausoleo di pietra a nord (cripta) ---
  placeMausoleum(0, -R + 5.5, 0, 2.6);

  // --- lapidi PBR procedurali (lastra / croce / obelisco / spezzata) ---
  let graveCount = 0;
  for (let tries = 0; tries < 460 && graveCount < 32; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 9 + Math.random() * (R - 13);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 0.8)) continue;
    placeGrave(x, z, Math.random() * 0.6 - 0.3 + (Math.random() < 0.5 ? Math.PI : 0));
    world.graves.push(new THREE.Vector3(x, 0, z));
    graveCount++;
  }

  // --- statue/monumenti (busto realistico su plinto di pietra) ---
  for (let tries = 0, n = 0; tries < 60 && n < 3; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 11 + Math.random() * (R - 16);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 1.0)) continue;
    placeStatue(x, z, Math.random() * Math.PI * 2);
    n++;
  }

  // --- alberi morti procedurali con corteccia reale (silhouette verticali) ---
  for (let tries = 0, n = 0; tries < 200 && n < 11; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 14 + Math.random() * (R - 16);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 1.4)) continue;
    placeDeadTree(x, z, 1.5 + Math.random() * 0.5, 0.5);
    n++;
  }

  // --- scatter naturale realistico (PolyHaven): massi, rocce muschiose, ceppi, tronchi caduti ---
  const natureNames = ['boulder', 'rocks_moss', 'rock_small', 'rock_small', 'tree_stump', 'log_fallen', 'log_fallen_big'];
  const natureHeavy = new Set(['boulder', 'rocks_moss', 'tree_stump', 'log_fallen_big']);
  for (let tries = 0, n = 0; tries < 300 && n < 22; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 9 + Math.random() * (R - 11);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 1.0)) continue;
    const name = natureNames[(Math.random() * natureNames.length) | 0];
    addProp(name, x, z, Math.random() * Math.PI * 2, { collider: natureHeavy.has(name) ? 0.6 : 0 });
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

  // --- decorazioni sparse realistiche (ossa, teschi, lanterne, sassi, ceppi) ---
  const deco = ['skull', 'ribcage', 'bone_A', 'lantern_standing', 'coffin', 'shrine', 'rock_small', 'tree_stump'];
  const decoHeavy = new Set(['coffin', 'shrine', 'tree_stump']);
  for (let tries = 0, n = 0; tries < 300 && n < 28; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * (R - 10);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 0.6)) continue;
    const name = deco[(Math.random() * deco.length) | 0];
    addProp(name, x, z, Math.random() * Math.PI * 2, { collider: decoHeavy.has(name) ? 0.6 : 0 });
    if (name === 'lantern_standing') {
      const gl = new THREE.PointLight(0xffb060, 1.0, 5, 2);
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

  // --- pulviscolo/cenere sospesa: deriva lenta in tutta l'aria, dà profondità atmosferica ---
  {
    const n = 90;
    const pos = new Float32Array(n * 3);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * R;
      seeds.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.6 + Math.random() * 5.5, p: Math.random() * 100 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xb9a98a, size: 0.075, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    world._motes = { pts, seeds, pos };
  }

  // ======================= ZONE SBLOCCABILI + PORTE =======================

  const wallMat = pbrMat(Assets.tex.rock, { color: 0x8a8580, roughness: 0.95, normalScale: 1.0 });
  const plankMat = pbrMat(Assets.tex.planks, { color: 0x6f5a3a, roughness: 0.9 });

  // cartello inciso col nome della zona e il costo in Anime
  function makeSign(name, cost) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(18,14,10,0.92)'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#5a4632'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 240);
    g.textAlign = 'center'; g.fillStyle = '#e8dcc0';
    g.font = 'bold 40px Georgia, serif';
    const words = name.split(' ');
    let line = '', y = 78; const lines = [];
    for (const w of words) { if ((line + w).length > 16) { lines.push(line.trim()); line = ''; } line += w + ' '; }
    lines.push(line.trim());
    for (const l of lines) { g.fillText(l, 256, y); y += 46; }
    g.fillStyle = '#ffcf6a'; g.font = 'bold 52px Georgia, serif';
    g.fillText(`${cost} ✦ ANIME`, 256, 215);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    return mesh;
  }

  // colonna spezzata (chiesa)
  function brokenColumn(x, z, h) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, h, 10), wallMat);
    c.position.set(x, h / 2, z); c.castShadow = true; c.receiveShadow = true;
    scene.add(c);
    world.colliders.push({ x, z, r: 0.6 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), wallMat);
    cap.position.set(x, h + 0.15, z); cap.castShadow = true; scene.add(cap);
  }

  // cappio appeso a un ramo (bosco)
  function noose(x, z) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }));
    rope.position.set(x, 3.2, z); scene.add(rope);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }));
    loop.position.set(x, 2.2, z); loop.rotation.x = Math.PI / 2; scene.add(loop);
  }

  // anello perimetrale (muro di pietra o alberi fitti) con un varco verso l'hub
  function buildPerimeter(cx, cz, ZR, openAngle, kind) {
    const ringR = ZR + 1.4;
    const n = Math.max(14, Math.round(ringR * 0.95));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const da = Math.abs(((a - openAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 0.5) continue; // varco verso l'hub
      const x = cx + Math.cos(a) * ringR, z = cz + Math.sin(a) * ringR;
      if (kind === 'trees') {
        placeDeadTree(x, z, 1.5 + Math.random() * 0.6, 0.6);
      } else {
        const h = 2.6 + Math.random() * 1.4;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 0.85), wallMat);
        seg.position.set(x, h / 2, z);
        seg.rotation.y = -a + Math.PI / 2 + (Math.random() - 0.5) * 0.12;
        seg.castShadow = true; seg.receiveShadow = true;
        scene.add(seg);
      }
    }
  }

  const ZONE_CONTENT = {
    crypt(cx, cz, ZR) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4, d = ZR * 0.6;
        placeMausoleum(cx + Math.cos(a) * d, cz + Math.sin(a) * d, a + Math.PI, 2.2);
      }
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.78;
        placeGrave(cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28);
      }
      addProp('coffin', cx, cz, 0, { collider: 0.6 });
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.7;
        addProp(['boulder', 'rocks_moss', 'rock_small'][i % 3], cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, { collider: i % 3 === 2 ? 0 : 0.5 });
      }
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.6;
        addProp(Math.random() < 0.5 ? 'skull' : 'ribcage', cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, {});
      }
    },
    church(cx, cz, ZR) {
      // navata: due file di colonne spezzate
      for (let i = 0; i < 5; i++) {
        const off = -ZR * 0.55 + i * (ZR * 1.1 / 4);
        brokenColumn(cx - ZR * 0.35, cz + off, 3.2 + Math.random() * 2.2);
        brokenColumn(cx + ZR * 0.35, cz + off, 3.2 + Math.random() * 2.2);
      }
      // altare/santuario in fondo, con due busti di pietra a fianco
      addProp('shrine', cx, cz - ZR * 0.55, 0, { collider: 1.0, scaleMult: 1.5 });
      placeStatue(cx - 1.8, cz - ZR * 0.55, 0.3);
      placeStatue(cx + 1.8, cz - ZR * 0.55, -0.3);
      addProp('coffin', cx, cz - ZR * 0.2, 0, { collider: 0.6 });
      // panche (assi) sparse
      for (let i = 0; i < 6; i++) {
        const bx = cx + (i % 2 ? 1 : -1) * (1.4 + Math.random()), bz = cz - ZR * 0.3 + i * 1.4;
        const pew = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), plankMat);
        pew.position.set(bx, 0.25, bz); pew.rotation.y = (Math.random() - 0.5) * 0.3;
        pew.castShadow = true; scene.add(pew);
      }
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.6;
        addProp('lantern_standing', cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0, {});
      }
    },
    wood(cx, cz, ZR) {
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.85;
        placeDeadTree(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 1.5 + Math.random() * 0.7, 0.6);
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.7;
        noose(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
      }
      // sottobosco realistico: tronchi caduti, ceppi, massi muschiosi
      const woodNature = ['log_fallen', 'log_fallen_big', 'tree_stump', 'rocks_moss', 'boulder'];
      for (let i = 0; i < 11; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.82;
        const name = woodNature[i % woodNature.length];
        addProp(name, cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, { collider: name === 'log_fallen' ? 0 : 0.55 });
      }
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.8;
        addProp(['skull', 'ribcage', 'bone_A'][i % 3], cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, {});
      }
    },
  };

  function buildZone(geo) {
    const z = geo.zone, cx = geo.center.x, cz = geo.center.z, ZR = z.radius;
    const set = z.ground === 'forest' ? Assets.tex.forest : Assets.tex.cobble;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ZR + 2.5, 56), pbrMat(set, { color: 0x9a948c }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(cx, 0.012, cz);
    disc.receiveShadow = true;
    scene.add(disc);
    buildPerimeter(cx, cz, ZR, z.angle + Math.PI, z.id === 'wood' ? 'trees' : 'wall');
    ZONE_CONTENT[z.id]?.(cx, cz, ZR);
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI * 2 + 0.5;
      const lx = cx + Math.cos(a) * ZR * 0.5, lz = cz + Math.sin(a) * ZR * 0.5;
      const light = new THREE.PointLight(z.lightColor, 2.2, 17, 1.8);
      light.position.set(lx, 3.2, lz);
      scene.add(light);
      world.lanterns.push({ light, base: 2.2, seed: Math.random() * 100 });
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28, d = ZR * (0.3 + Math.random() * 0.6);
      world.spawnPoints.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, zone: z.id });
    }
    world.rooms.push({ cx, cz, r: ZR, active: false, id: z.id });
  }

  function buildGate(geo) {
    const z = geo.zone;
    const grp = new THREE.Group();
    grp.position.set(geo.gatePos.x, 0, geo.gatePos.z);
    grp.rotation.y = Math.atan2(geo.dir.x, geo.dir.z);
    const postGeo = new THREE.BoxGeometry(0.8, 4.6, 1.0);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wallMat);
      post.position.set(sx * 2.3, 2.3, 0); post.castShadow = true; grp.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 1.1), wallMat);
    lintel.position.set(0, 5.0, 0); lintel.castShadow = true; grp.add(lintel);
    // due ante di legno chiuse, su cardini ai pilastri
    const leafGeo = new THREE.BoxGeometry(2.0, 4.0, 0.2);
    const leaves = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 2.0, 2.1, 0);
      const leaf = new THREE.Mesh(leafGeo, plankMat);
      leaf.position.set(-sx * 1.0, 0, 0);
      leaf.castShadow = true;
      pivot.add(leaf);
      grp.add(pivot);
      leaves.push({ pivot, sx });
    }
    const sign = makeSign(z.name, z.cost);
    sign.position.set(0, 6.0, 0.1);
    grp.add(sign);
    const gl = new THREE.PointLight(0xffc090, 1.8, 10, 2);
    gl.position.set(0, 4.2, 1.4);
    grp.add(gl);
    world.lanterns.push({ light: gl, base: 1.8, seed: Math.random() * 100 });
    scene.add(grp);
    world.gates.push({ id: z.id, zone: z, leaves, sign, pos: geo.gatePos.clone(), cost: z.cost, name: z.name, sub: z.sub, unlocked: false, opening: false, openT: 0 });
  }

  for (const geo of ZGEOM) { buildZone(geo); buildGate(geo); }

  // ----- API stanze / porte / atmosfera -----

  world.confine = (pos, radius) => {
    let best = null, bestPush = Infinity;
    for (const room of world.rooms) {
      if (!room.active) continue;
      const dx = pos.x - room.cx, dz = pos.z - room.cz;
      const d = Math.hypot(dx, dz);
      const lim = room.r - radius;
      if (d <= lim) return;            // dentro l'unione: libero
      const push = d - lim;
      if (push < bestPush) { bestPush = push; best = { room, d, dx, dz }; }
    }
    if (!best) return;
    const lim = best.room.r - radius;
    const s = lim / (best.d || 1);
    pos.x = best.room.cx + best.dx * s;
    pos.z = best.room.cz + best.dz * s;
  };

  world.unlockZone = (id) => {
    const room = world.rooms.find((r) => r.id === id);
    const gate = world.gates.find((g) => g.id === id);
    if (!room || !gate || gate.unlocked) return null;
    room.active = true;
    gate.unlocked = true;
    gate.opening = true;
    return gate.zone;
  };

  // richiude tutte le porte e ridisattiva le zone (nuova partita)
  world.resetZones = () => {
    for (const room of world.rooms) if (room.id !== 'hub') room.active = false;
    for (const g of world.gates) {
      g.unlocked = false; g.opening = false; g.openT = 0;
      for (const lf of g.leaves) lf.pivot.rotation.y = 0;
    }
  };

  // porta sbloccabile più vicina al giocatore entro il raggio d'interazione
  world.nearestGate = (pos, range = 5) => {
    let best = null, bestD = range;
    for (const g of world.gates) {
      if (g.unlocked) continue;
      const d = Math.hypot(pos.x - g.pos.x, pos.z - g.pos.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  };

  // atmosfera base (nebbia) che cambia in base alla zona in cui si trova il giocatore
  const HUB_FOG = new THREE.Color(0x0a0d1a), HUB_DENS = 0.018;
  const _tmpFog = new THREE.Color(), _zc = new THREE.Color();
  world.updateAtmosphere = (pos, dt) => {
    _tmpFog.copy(HUB_FOG);
    let tDens = HUB_DENS;
    if (pos) {
      let inZone = null, depth = 0;
      for (const room of world.rooms) {
        if (!room.active || room.id === 'hub') continue;
        const d = Math.hypot(pos.x - room.cx, pos.z - room.cz);
        const inside = (room.r - d) / room.r;
        if (inside > depth) { depth = inside; inZone = room; }
      }
      if (inZone && depth > 0) {
        const zdef = ZONES.find((z) => z.id === inZone.id);
        const k = Math.min(1, depth * 1.7);
        _tmpFog.lerp(_zc.set(zdef.fog), k);
        tDens = HUB_DENS + (zdef.fogDensity - HUB_DENS) * k;
      }
    }
    const a = 1 - Math.exp(-2.2 * (dt || 0.016));
    world.atmoFog.lerp(_tmpFog, a);
    world.atmoDensity += (tDens - world.atmoDensity) * a;
  };

  world.update = (dt, t, playerPos) => {
    world.updateAtmosphere(playerPos, dt);
    // animazione apertura porte
    for (const g of world.gates) {
      if (!g.opening) continue;
      g.openT = Math.min(1, g.openT + dt * 0.8);
      const e = 1 - Math.pow(1 - g.openT, 3); // ease-out
      for (const lf of g.leaves) lf.pivot.rotation.y = lf.sx * 2.0 * e;
      if (g.openT >= 1) g.opening = false;
    }
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
    const mo = world._motes;
    if (mo) {
      for (let i = 0; i < mo.seeds.length; i++) {
        const s = mo.seeds[i];
        mo.pos[i * 3] = s.x + Math.sin(t * 0.12 + s.p) * 2.4;
        mo.pos[i * 3 + 1] = s.y + Math.sin(t * 0.18 + s.p * 1.7) * 0.7;
        mo.pos[i * 3 + 2] = s.z + Math.cos(t * 0.1 + s.p * 1.3) * 2.4;
      }
      mo.pts.geometry.attributes.position.needsUpdate = true;
    }
  };

  return world;
}
