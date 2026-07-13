// Costruzione dell'ambientazione: FORESTA DI PINI notturna. Hub = radura del ranger (capanna,
// falò, sentieri di pietra), 3 zone dietro cancelli di legno: CIMITERO nel bosco, CAMPO BASE
// militare abbandonato, PALUDE. La foresta è fatta di pini fotorealistici INSTANZIATI
// (Scots Pine Set, Sketchfab CC-BY): centinaia di alberi in poche draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Assets } from './assets.js';
import { CONFIG, ZONES } from './config.js';

const R = CONFIG.arenaRadius;       // limite del bosco fitto attorno all'hub
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

// ANTI-TILING: la ripetizione visibile della texture è il primo "tradimento" del realismo su
// un terreno grande. Il shader fonde la stessa mappa campionata a DUE scale con una maschera a
// bassissima frequenza (ricavata dalla mappa stessa) e aggiunge una variazione MACRO di
// luminosità → il pattern non si riconosce più, a costo di 3 fetch extra sulla sola albedo.
function antiTile(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', [
      '#ifdef USE_MAP',
      '  vec4 texA = texture2D( map, vMapUv );',
      '  vec4 texB = texture2D( map, vMapUv * 0.31 + vec2(0.5, 0.27) );',
      '  float tileMask = texture2D( map, vMapUv * 0.017 ).g;',
      '  vec4 sampledDiffuseColor = mix( texA, texB, smoothstep( 0.3, 0.7, tileMask ) );',
      '  sampledDiffuseColor.rgb *= 0.82 + 0.36 * texture2D( map, vMapUv * 0.0093 + vec2(0.37, 0.11) ).g;',
      '  diffuseColor *= sampledDiffuseColor;',
      '#endif',
    ].join('\n'));
  };
  return mat;
}

// VENTO: oscillazione sinusoidale nel vertex shader, pesata sull'altezza LOCALE del vertice e
// sfasata per-istanza (dalla colonna di traslazione della instanceMatrix) → ogni albero/ciuffo
// ondeggia per conto suo. L'offset è in spazio locale pre-istanza: l'ampiezza scala col modello.
// ⚠️ customProgramCacheKey OBBLIGATORIA: onBeforeCompile con parametri diversi ha lo stesso
// toString() → senza chiave three riuserebbe lo stesso programma per ampiezze diverse.
const _windT = { value: 0 };
const _waterT = { value: 0 }; // tempo condiviso per l'acqua animata (normali a doppio scorrimento)
function addWind(mat, amp, lo, hi) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = _windT;
    sh.vertexShader = ('uniform float uWindT;\n' + sh.vertexShader).replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec2 wPh = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);',
        '#else',
        '  vec2 wPh = vec2(0.0);',
        '#endif',
        `float windW = smoothstep(${lo.toFixed(3)}, ${hi.toFixed(3)}, transformed.y);`,
        'float windS = sin(uWindT * 1.5 + wPh.x * 0.35 + wPh.y * 0.27) + 0.5 * sin(uWindT * 3.7 + wPh.y * 0.53 + wPh.x * 0.11);',
        `transformed.x += windS * windW * ${amp.toFixed(4)};`,
        `transformed.z += windS * windW * ${(amp * 0.6).toFixed(4)};`,
      ].join('\n'),
    );
  };
  mat.customProgramCacheKey = () => `wind_${amp}_${lo}_${hi}`;
  return mat;
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

// Maschera alpha a BORDO IRREGOLARE (chiazza organica da rumore): per stagni e pozze.
// Un'ellisse perfetta sembra vernice versata; il bordo frastagliato la fa sembrare acqua vera.
function makeBlobAlphaTexture(seed = 0) {
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const h2 = (x, y) => {
    let n = 0, f = 5 / S, amp = 1;
    for (let o = 0; o < 3; o++) {
      const xi = Math.floor(x * f), yi = Math.floor(y * f), xf = x * f - xi, yf = y * f - yi;
      const rnd = (a, b) => { const s2 = Math.sin(a * 127.1 + b * 311.7 + o * 71 + seed * 13.3) * 43758.5453; return s2 - Math.floor(s2); };
      const sm = (t) => t * t * (3 - 2 * t);
      const u = sm(xf), v = sm(yf);
      n += amp * ((rnd(xi, yi) * (1 - u) + rnd(xi + 1, yi) * u) * (1 - v) + (rnd(xi, yi + 1) * (1 - u) + rnd(xi + 1, yi + 1) * u) * v);
      f *= 2.1; amp *= 0.5;
    }
    return n / 1.75;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      const v = (1 - r) + (h2(x, y) - 0.5) * 0.55;
      const t = Math.min(1, Math.max(0, (v - 0.28) / 0.14));
      const a = (t * t * (3 - 2 * t)) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}

// Fallback procedurali per oggetti di scena mancanti.
function fallbackProp(name) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6e7178, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.95 });
  if (name.includes('lantern')) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xff9540, emissiveIntensity: 1.4 }));
    lamp.position.y = 0.3;
    g.add(lamp);
  } else if (name === 'cabin' || name === 'shed') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.8), wood); body.position.y = 1.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), wood); roof.position.y = 3.0; roof.rotation.y = Math.PI / 4;
    g.add(body, roof);
  } else {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5), stone); rock.position.y = 0.3;
    g.add(rock);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildWorld(scene) {
  const _sceneStart = scene.children.length; // per world.dispose (co-op: il client ricostruisce il mondo)
  const world = {
    colliders: [],
    graves: [],       // punti di risalita zombi dell'hub
    lanterns: [],     // luci da far tremolare ({light, base, seed, mode?})
    rooms: [{ cx: 0, cz: 0, r: HUB_R, active: true, id: 'hub' }],
    gates: [],
    spawnPoints: [],
    maxExtent: HUB_R,
    atmoFog: new THREE.Color(0x0c1620),
    atmoDensity: 0.027,
    _mist: [],
    _fireflies: null,
    _flames: [],      // falò: { mats: [ShaderMaterial…], light }
    _embers: [],      // braci che salgono dai falò
    _wisps: [],       // fuochi fatui della palude (Points additivi, NESSUNA luce dinamica)
    fires: [],        // zone di FIAMMA che bruciano il giocatore ({ x, z, r })
  };

  const ZGEOM = ZONES.map((z) => {
    const dir = new THREE.Vector3(Math.cos(z.angle), 0, Math.sin(z.angle));
    const centerDist = HUB_R + z.radius - OVERLAP;
    const center = dir.clone().multiplyScalar(centerDist);
    const gatePos = dir.clone().multiplyScalar(HUB_R + 1.5);
    world.maxExtent = Math.max(world.maxExtent, centerDist + z.radius);
    return { zone: z, dir, center, gatePos, gateAngle: z.angle };
  });
  const laneDirs = ZGEOM.map((g) => g.gateAngle);

  // --- atmosfera: notte fonda nel bosco, nebbia più fitta che in città ---
  if (!scene.background) scene.background = new THREE.Color(0x04070a);
  scene.fog = new THREE.FogExp2(0x0c1620, 0.027); // notte atmosferica: gli alberi lontani sfumano nella foschia

  // CHIAROSCURO: emisferica bassissima (il buio del sottobosco), luna fredda decisa che
  // filtra tra le chiome, pozze di luce calda solo attorno a lanterne e falò.
  // ILLUMINAZIONE AMBIENTALE DELLA LUNA: emisferica blu-luna decisa dall'alto → riempie di una
  // luce fredda e morbida ANCHE le zone lontane da lanterne/fuoco (vedi al buio, ma resta notte).
  // È la fonte di "fill" della luna: il direzionale illumina solo il lato esposto, questa il resto.
  const hemi = new THREE.HemisphereLight(0x3b5a80, 0x1a2013, 0.5);
  scene.add(hemi);

  // luna: luce fredda-blu (chiaro di luna reale), decisa, con ombre dalla penombra MORBIDA
  // (radius alto + più campioni) → bordi d'ombra realistici, non netti.
  const moon = new THREE.DirectionalLight(0xaec8ff, 2.95);
  moon.position.set(24, 38, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.radius = 4.5;
  moon.shadow.blurSamples = 12;
  const shadowExt = world.maxExtent + 12;
  moon.shadow.camera.left = -shadowExt;
  moon.shadow.camera.right = shadowExt;
  moon.shadow.camera.top = shadowExt;
  moon.shadow.camera.bottom = -shadowExt;
  moon.shadow.camera.far = 180; // arena allargata (zone più grandi): il bordo lontano resta in ombra
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  // --- terreno: sottobosco PBR su tutta la mappa ---
  const groundMat = Assets.tex.forestHub
    ? antiTile(pbrMat(Assets.tex.forestHub, { color: 0x767a63, roughness: 1.0, normalScale: 1.5 }))
    : new THREE.MeshStandardMaterial({ map: Assets.groundTexture, color: 0x4e5348, roughness: 1.0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(world.maxExtent + 20, 72), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ============== RADURA + SENTIERI IN CIOTTOLATO (PBR flat, PolyHaven) ==============
  // La radura NON è un cerchio e i sentieri NON sono rettangoli stretchati: una superficie di VERO
  // ciottolato PBR (cobblestone_floor_08: diffuse+normale+rugosità) su una mesh dal bordo IRREGOLARE
  // (blob di rumore FUSI, UV PLANARI in coord mondo → il ciottolato tila corretto, ~1.3 m, MAI
  // stirato, e i blob sovrapposti restano cuciti). I sentieri SERPEGGIANO verso i cancelli.
  if (Assets.tex.cobble) {
    const clearingR = 8.5;
    const gateDist = HUB_R + 1;
    const uvScale = 0.11;                 // ciottolato ~1.3 m in mondo (variant cobble repeat 7)
    const dStart = clearingR - 1.5;
    // centro del sentiero che SERPEGGIA: offset perpendicolare con inviluppo che va a zero ai due
    // capi (radura e cancello), così il tracciato ci si aggancia senza scarti laterali.
    const laneCenter = (a, d) => {
      const tt = Math.max(0, Math.min(1, (d - dStart) / (gateDist - dStart)));
      const env = Math.sin(tt * Math.PI);
      const off = (Math.sin(d * 0.16 + a * 3) * 2.0 + Math.sin(d * 0.075 + a) * 1.2) * env;
      return { x: Math.cos(a) * d - Math.sin(a) * off, z: Math.sin(a) * d + Math.cos(a) * off };
    };
    const blobs = [];
    const pushBlob = (cx, cz, r, amp) => {
      const segs = 40, vc = segs + 2;
      const p = new Float32Array(vc * 3), u = new Float32Array(vc * 2), nrm = new Float32Array(vc * 3);
      const idx = [];
      p[0] = cx; p[2] = cz; nrm[1] = 1; u[0] = cx * uvScale; u[1] = cz * uvScale;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const rr = r * (1 + amp * (Math.sin(a * 3 + cx) * 0.5 + Math.sin(a * 6 + cz) * 0.3 + Math.sin(a * 11 + cx * 0.3) * 0.2));
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, vi = i + 1;
        p[vi * 3] = x; p[vi * 3 + 2] = z; nrm[vi * 3 + 1] = 1;
        u[vi * 2] = x * uvScale; u[vi * 2 + 1] = z * uvScale;
        if (i < segs) idx.push(0, vi, vi + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
      g.setIndex(idx);
      blobs.push(g);
    };
    pushBlob(0, 0, clearingR, 0.17);      // radura irregolare
    for (const a of laneDirs) {           // sentieri: catena di blob lungo la centerline serpeggiante
      for (let d = dStart; d <= gateDist; d += 1.7) {
        const c = laneCenter(a, d);
        pushBlob(c.x, c.z, 1.9, 0.24);
      }
    }
    // il ciottolato è schiarito (di notte la sola albedo grezza sparisce nel buio) e il normal è
    // spinto → i giunti tra i sassi prendono luce da lanterne/luna e il selciato "si legge".
    const baseMesh = new THREE.Mesh(mergeGeometries(blobs, false),
      pbrMat(Assets.tex.cobble, { color: 0x8c877b, roughness: 0.92, normalScale: 1.5 }));
    blobs.forEach((b) => b.dispose());
    baseMesh.position.y = 0.013;
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);
  }

  // --- utilità di piazzamento ---
  const placed = [];
  function freeSpot(x, z, r) {
    if (Math.hypot(x, z) < 5 + r) return false;
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
      // piedi a terra: footOffset (=-min.y*scale, da prepModel) corregge i GLB con
      // l'origine al centro invece che alla base (sennò affondano per metà)
      obj.position.y = (def.footOffset || 0) * (opts.scaleMult ?? 1);
    } else {
      obj = fallbackProp(name);
      if (opts.scaleMult) obj.scale.setScalar(opts.scaleMult);
    }
    obj.position.x = x;
    obj.position.z = z;
    obj.rotation.y = rotY;
    obj.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    if (opts.tint) {
      const tc = new THREE.Color(opts.tint);
      obj.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiply(tc); }
      });
    }
    scene.add(obj);
    const r = opts.collider ?? 0;
    if (r > 0) world.colliders.push({ x, z, r });
    placed.push({ x, z, r: Math.max(r, 0.5) });
    return obj;
  }

  // materiali condivisi
  const stoneMat = pbrMat(Assets.tex.graveStone || Assets.tex.rock, { color: 0xa7a092, roughness: 0.95, normalScale: 0.85 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x434b2c, roughness: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 1 });
  const plankMat = pbrMat(Assets.tex.planks, { color: 0x6f5a3a, roughness: 0.9 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.65, roughness: 0.45 });

  // ====================== PINI INSTANZIATI (il bosco vero) ======================
  // Il set Sketchfab contiene ~9 pini in UNA scena, raggruppati per prefisso "N_". Ogni
  // variante viene fusa PER MATERIALE e normalizzata (piedi a 0, altezza 1); i piazzamenti
  // si accumulano e alla fine diventano InstancedMesh → centinaia di alberi, poche draw call.
  function buildPineKit() {
    const def = Assets.props.get('pines');
    if (!def) return null;
    const src = def.scene;
    src.updateMatrixWorld(true);
    let root = src;
    while (root.children.length === 1) root = root.children[0];
    const groups = new Map();
    for (const ch of root.children) {
      const m = ch.name.match(/^(\d+)_/);
      if (!m) continue;
      if (!groups.has(m[1])) groups.set(m[1], []);
      ch.traverse((o) => { if (o.isMesh) groups.get(m[1]).push(o); });
    }
    // materiali: fogliame in alpha-test (niente trasparenza sortata: robusto e veloce), tutto opaco
    const seen = new Set();
    src.traverse((o) => {
      if (!o.isMesh || !o.material || seen.has(o.material)) return;
      seen.add(o.material);
      const m = o.material;
      // fogliame: "Mat_Foliage_1" e "Material #28"/"Material_28" (il nome cambia dopo la
      // compressione gltf-transform: lo spazio+# diventa _) → riconosci entrambe le forme
      if (/foliage|[#_]\s?28/i.test(m.name)) {
        m.alphaTest = 0.36; m.transparent = false; m.side = THREE.DoubleSide; // 0.45 sfoltiva troppo gli aghi
        m.color.multiplyScalar(0.88);
        // VENTO sulle chiome: Y locale normalizzata 0..1 → ondeggia solo la parte alta.
        // Ampiezza locale 0.012 × scala istanza (~15) ≈ 18 cm di oscillazione in mondo.
        addWind(m, 0.012, 0.25, 1.0);
      }
      m.roughness = 1; m.metalness = 0; m.envMapIntensity = 0.25;
      if (m.map) { m.map.anisotropy = 8; m.map.needsUpdate = true; } // corteccia/aghi nitidi di sguincio
    });
    const variants = [];
    for (const meshes of groups.values()) {
      const box = new THREE.Box3();
      for (const o of meshes) box.union(new THREE.Box3().setFromObject(o));
      const size = box.getSize(new THREE.Vector3());
      if (size.y < 0.01) continue;
      const ctr = box.getCenter(new THREE.Vector3());
      const norm = new THREE.Matrix4()
        .makeScale(1 / size.y, 1 / size.y, 1 / size.y)
        .multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z));
      const byMat = new Map();
      for (const o of meshes) {
        // ⚠️ DE-QUANTIZZA prima di trasformare: i GLB compressi hanno position/normal in
        // Int16/Int8 NORMALIZZATI — applyMatrix4 scriverebbe float fuori range nell'array
        // intero e i vertici WRAPPANO (alberi collassati/invisibili; stessa trappola degli
        // zombi in assets._dequantAttr). Qui: copia in Float32 leggendo i valori denormalizzati.
        const g = o.geometry.clone();
        for (const nm of ['position', 'normal']) {
          const a = g.attributes[nm];
          if (!a || (a.array instanceof Float32Array && !a.normalized)) continue;
          const f = new THREE.BufferAttribute(new Float32Array(a.count * a.itemSize), a.itemSize);
          for (let i = 0; i < a.count; i++) f.setXYZ(i, a.getX(i), a.getY(i), a.getZ(i) || 0);
          g.setAttribute(nm, f);
        }
        g.applyMatrix4(o.matrixWorld).applyMatrix4(norm);
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(g);
      }
      const parts = [];
      for (const [mat, geos] of byMat) {
        const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
        parts.push({ geo: merged, mat });
      }
      variants.push(parts);
    }
    return variants.length ? variants : null;
  }
  const pineKit = buildPineKit();
  // DUE POOL di piazzamenti: "gameplay" (dentro/vicino all'arena: proiettano ombre) e
  // "scenery" (la foresta profonda là fuori: NIENTE castShadow → non entrano nel pass della
  // shadow map, che con frustumCulled=false disegnerebbe SEMPRE tutto). È l'ottimizzazione
  // che permette di raddoppiare gli alberi senza raddoppiare il costo.
  const pinePlace = pineKit ? pineKit.map(() => []) : [];
  const pinePlaceFar = pineKit ? pineKit.map(() => []) : [];
  const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pv = new THREE.Vector3(), _ps = new THREE.Vector3();
  const _tiltAxis = new THREE.Vector3();
  function plantPine(x, z, h, collider = 0, scenery = false) {
    if (!pineKit) { placeDeadTree(x, z, h / 4, collider); return; } // ripiego: alberi procedurali
    const vi = (Math.random() * pineKit.length) | 0;
    _pq.setFromAxisAngle(_tiltAxis.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), Math.random() * 0.05);
    _pq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2));
    const w = 0.88 + Math.random() * 0.3;
    _pm.compose(_pv.set(x, 0, z), _pq, _ps.set(h * w, h * (0.92 + Math.random() * 0.16), h * w));
    (scenery ? pinePlaceFar : pinePlace)[vi].push(_pm.clone());
    if (collider > 0) { world.colliders.push({ x, z, r: collider }); placed.push({ x, z, r: collider }); }
    else if (!scenery) placed.push({ x, z, r: 0.6 });
  }
  function finalizePines() {
    if (!pineKit) return;
    const _ic = new THREE.Color();
    for (const [pool, shadows] of [[pinePlace, true], [pinePlaceFar, false]]) {
      for (let vi = 0; vi < pineKit.length; vi++) {
        const mats = pool[vi];
        if (!mats.length) continue;
        // variazione PER-ISTANZA (rompe l'uniformità della foresta): stessa "ombra" per tronco e
        // chioma dello stesso albero, con lieve deriva di tinta sul fogliame (verde↔ingiallito)
        const shades = mats.map(() => 0.72 + Math.random() * 0.4);
        for (const part of pineKit[vi]) {
          const im = new THREE.InstancedMesh(part.geo, part.mat, mats.length);
          const foliage = part.mat.alphaTest > 0;
          for (let k = 0; k < mats.length; k++) {
            im.setMatrixAt(k, mats[k]);
            const s = shades[k];
            if (foliage) _ic.setRGB(s * (0.94 + (1 - s) * 0.24), s, s * 0.9);
            else _ic.setScalar(0.82 + s * 0.2);
            im.setColorAt(k, _ic);
          }
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.castShadow = shadows;
          im.receiveShadow = true;
          im.frustumCulled = false; // le istanze coprono tutta la mappa: mai cullare in blocco
          scene.add(im);
        }
      }
    }
  }

  // ---- CORTECCIA PBR (PolyHaven bark_brown_02): tronchi morti, cipressi, pali dei cancelli e
  // del pontile. Fallback alla corteccia del prop log_fallen o a un colore piatto se manca. ----
  let barkMat;
  if (Assets.tex.bark) {
    barkMat = pbrMat(Assets.tex.bark, { color: 0x74604a, roughness: 0.93, normalScale: 1.15 });
  } else {
    const barkSrc = Assets.props.get('log_fallen_big') || Assets.props.get('log_fallen');
    let src = null;
    if (barkSrc) barkSrc.scene.traverse((o) => { if (o.isMesh && o.material && !src) src = o.material; });
    if (!src) barkMat = new THREE.MeshStandardMaterial({ color: 0x3a2f25, roughness: 1 });
    else {
      barkMat = src.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (!barkMat[k]) continue;
        barkMat[k] = barkMat[k].clone();
        barkMat[k].wrapS = barkMat[k].wrapT = THREE.RepeatWrapping;
        barkMat[k].repeat.set(2, 3);
        barkMat[k].needsUpdate = true;
      }
      if (barkMat.color) barkMat.color.multiplyScalar(0.8);
    }
  }
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

  // ---- recinzione in ferro battuto del cimitero ----
  function ironPanelGeometry(width) {
    const parts = [];
    const box = (w, h, d, y, x = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, 0); parts.push(g); };
    box(width, 0.05, 0.05, 0.4); box(width, 0.05, 0.05, 1.05);
    const bars = 7;
    for (let i = 0; i < bars; i++) {
      const x = -width / 2 + 0.13 + (i / (bars - 1)) * (width - 0.26);
      box(0.045, 1.25, 0.045, 0.62, x);
      const tip = new THREE.ConeGeometry(0.05, 0.16, 4); tip.translate(x, 1.32, 0); parts.push(tip);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
  }
  const IRON_PANEL = ironPanelGeometry(2.05);

  // ---- lapidi/mausoleo/statua in pietra PBR (il vecchio cimitero, tornato a casa) ----
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
      slab.position.set(0, 0.4, 0); slab.rotation.z = 0.22 + Math.random() * 0.22;
      g.add(slab);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.0, 0.16), stoneMat); body.position.y = 0.5;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.24), stoneMat); cap.position.y = 1.04;
      g.add(body, cap);
    }
    const moss = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.42), mossMat); moss.position.y = 0.05;
    g.add(moss);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; } });
    return g;
  }
  function placeGrave(x, z, rotY) {
    const gs = makeGravestone(GRAVE_KINDS[(Math.random() * GRAVE_KINDS.length) | 0]);
    gs.position.set(x, 0, z);
    gs.rotation.y = rotY;
    gs.rotation.x = (Math.random() - 0.5) * 0.1;
    scene.add(gs);
    world.colliders.push({ x, z, r: 0.45 });
    placed.push({ x, z, r: 0.6 });
  }
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

  // ---- cappio appeso (palude) ----
  function noose(x, z) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }));
    rope.position.set(x, 3.2, z); scene.add(rope);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }));
    loop.position.set(x, 2.2, z); loop.rotation.x = Math.PI / 2; scene.add(loop);
  }

  // ====================== LUCE VOLUMETRICA (fasci) ======================
  // ShaderMaterial con dissolvenza FRESNEL: si legge come fascio di pulviscolo da ogni
  // angolo, non come una mesh solida. Due versioni: calda (lanterne/fari) e lunare (fredda).
  function makeBeamMaterial(color, intensity) {
    return new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } },
      vertexShader: [
        'varying float vH; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  vH = uv.y;',
        '  vN = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vV = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uIntensity;',
        'varying float vH; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  float fr = abs(dot(normalize(vN), normalize(vV)));',
        '  float a = uIntensity * pow(fr, 1.7) * (0.06 + 0.94 * vH * vH);',
        '  gl_FragColor = vec4(uColor * a, a);',
        '}',
      ].join('\n'),
    });
  }
  const warmBeamMat = makeBeamMaterial(0xffa050, 0.3);
  const moonBeamMat = makeBeamMaterial(0x9db8e8, 0.11);
  const beamGeo = new THREE.CylinderGeometry(0.14, 1.35, 1, 16, 1, true);
  function addBeam(x, z, topY, mat = warmBeamMat, rBottom = 1) {
    const cone = new THREE.Mesh(beamGeo, mat);
    cone.scale.set(rBottom, topY, rBottom);
    cone.position.set(x, topY / 2, z);
    cone.renderOrder = 4;
    scene.add(cone);
    return cone;
  }
  // RAGGI DI LUNA tra le chiome: fasci freddi che SCENDONO quasi verticali dal fogliame. La
  // vecchia inclinazione piena verso la luna (~38° dalla verticale) li faceva leggere come
  // strisciate DIAGONALI all'altezza degli occhi in prima persona; ora l'assetto è solo PARZIALE
  // (~13°, un accenno di direzione della luna) → sembrano fasci di pulviscolo che filtrano fra i
  // pini, non lame di luce di traverso. Più alti, più radi e più tenui.
  const moonDir = moon.position.clone().normalize();
  const moonTiltFull = new THREE.Quaternion().setFromUnitVectors(_up, moonDir);
  const moonTiltQ = new THREE.Quaternion().slerp(moonTiltFull, 0.34);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.4;
    const d = 15 + (i * 37) % (R - 22);
    const beam = addBeam(Math.cos(a) * d, Math.sin(a) * d, 17 + (i % 3) * 3, moonBeamMat, 1.35);
    beam.quaternion.copy(moonTiltQ);
  }

  // ====================== LANTERNE SU PALO (i sentieri) ======================
  const postGeoL = new THREE.CylinderGeometry(0.05, 0.07, 1.15, 6);
  function addLanternPost(x, z, base = 2.1, color = 0xffa050) {
    const post = new THREE.Mesh(postGeoL, plankMat);
    post.position.set(x, 0.58, z); post.castShadow = true;
    scene.add(post);
    const def = Assets.props.get('lantern_standing'); // lanterna vera in cima al palo
    if (def) {
      const l = def.scene.clone(); l.scale.setScalar(def.scale);
      l.position.set(x, 1.15, z); l.rotation.y = Math.random() * Math.PI * 2;
      scene.add(l);
    }
    const light = new THREE.PointLight(color, base, 13, 1.8);
    light.position.set(x, 1.7, z);
    scene.add(light);
    world.lanterns.push({ light, base, seed: Math.random() * 100 });
    world.colliders.push({ x, z, r: 0.22 });
    placed.push({ x, z, r: 0.35 });
  }

  // ====================== FALÒ (fuoco SHADER animato) ======================
  // Fiamma vera: rumore 3D che scorre verso l'alto su due coni concentrici, rampa di colore
  // brace→arancio→giallo. Niente quad statici incrociati (sembravano cartone).
  const FIRE_VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  ].join('\n');
  const FIRE_FRAG = [
    'uniform float uTime; uniform float uInner;',
    'varying vec2 vUv;',
    'float h3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n3(vec3 p){',
    '  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);',
    '}',
    'void main(){',
    '  float ang = vUv.x * 6.2831853;',
    '  vec3 sp = vec3(cos(ang) * 1.1, sin(ang) * 1.1, vUv.y * 2.4 - uTime * 2.6);',
    '  float n = n3(sp) * 0.62 + n3(sp * 2.4 + 7.31) * 0.38;',
    '  float body = 1.0 - vUv.y;',                       // 1 alla base, 0 in punta
    '  float f = n * (0.5 + body * 0.9) - vUv.y * 0.42;',
    '  f = smoothstep(0.16, 0.52, f);',
    '  vec3 col = mix(vec3(0.45, 0.05, 0.0), vec3(1.0, 0.42, 0.05), clamp(f * 1.7, 0.0, 1.0));',
    '  col = mix(col, vec3(1.0, 0.88, 0.5), clamp((f - 0.5) * (2.2 + uInner), 0.0, 1.0));',
    '  float a = f * (0.35 + 0.65 * body) * (0.75 + uInner * 0.5);',
    '  gl_FragColor = vec4(col * a * 1.7, a);',
    '}',
  ].join('\n'),
  fireGeoOuter = new THREE.CylinderGeometry(0.1, 0.36, 1, 14, 6, true),
  fireGeoInner = new THREE.CylinderGeometry(0.05, 0.22, 0.72, 12, 5, true);
  function makeCampfire(x, z, scale = 1) {
    // ANELLO DI PIETRE (roccia PBR con normal map) + LEGNA a corteccia (PBR) + BRACE incandescente
    const stoneParts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
      const s = new THREE.SphereGeometry((0.14 + Math.random() * 0.04) * scale, 6, 5);
      s.scale(1, 0.6, 1.05);
      s.translate(x + Math.cos(a) * 0.52 * scale, 0.08 * scale, z + Math.sin(a) * 0.52 * scale);
      stoneParts.push(s);
    }
    const ringMesh = new THREE.Mesh(mergeGeometries(stoneParts, false),
      Assets.tex.rock ? pbrMat(Assets.tex.rock, { color: 0x5c574d, roughness: 0.95, normalScale: 1.0 })
        : new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 }));
    stoneParts.forEach((p) => p.dispose());
    ringMesh.castShadow = true; ringMesh.receiveShadow = true; scene.add(ringMesh);
    const logParts = [];
    for (let i = 0; i < 4; i++) {
      const lg = new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 0.78 * scale, 6);
      lg.rotateZ(Math.PI / 2 - 0.32);
      lg.rotateY((i / 4) * Math.PI * 2 + 0.4);
      lg.translate(x, 0.15 * scale, z);
      logParts.push(lg);
    }
    const logMesh = new THREE.Mesh(mergeGeometries(logParts, false), barkMat);
    logParts.forEach((p) => p.dispose());
    logMesh.castShadow = true; logMesh.receiveShadow = true; scene.add(logMesh);
    // brace: disco emissivo additivo a pelo di terra (il cuore incandescente sotto la fiamma)
    const coal = new THREE.Mesh(new THREE.CircleGeometry(0.42 * scale, 16),
      new THREE.MeshBasicMaterial({ map: softDot, color: 0xff5a1e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    coal.rotation.x = -Math.PI / 2; coal.position.set(x, 0.05, z); coal.renderOrder = 5;
    scene.add(coal);
    // fiamme (shader, 2 gusci) — un materiale per falò (uTime aggiornato in world.update)
    // fiamma a 3 gusci: guscio esterno ampio, interno, e un CUORE bianco-caldo che pulsa più
    // in fretta (uTime scalato) → il fuoco ha un centro incandescente vivo, non una tinta piatta.
    const mats = [];
    for (const [geo, inner, h, tScale] of [[fireGeoOuter, 0, 1.25, 1], [fireGeoInner, 1, 0.95, 1.35], [fireGeoInner, 2, 0.55, 1.9]]) {
      const fm = new THREE.ShaderMaterial({
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: Math.random() * 10 }, uInner: { value: inner } },
        vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
      });
      const fmesh = new THREE.Mesh(geo, fm);
      fmesh.scale.set(scale * (inner === 2 ? 0.5 : 1), scale * h, scale * (inner === 2 ? 0.5 : 1));
      fmesh.position.set(x, 0.15 + (h / 2) * scale, z);
      fmesh.renderOrder = 6;
      scene.add(fmesh);
      mats.push({ m: fm, tScale });
    }
    // luce del fuoco (creata al build, pool con flicker da fuoco) — un filo più intensa e calda
    const light = new THREE.PointLight(0xff7420, 3.4 * scale, 15 * scale, 1.8);
    light.position.set(x, 1.15, z);
    scene.add(light);
    world.lanterns.push({ light, base: 3.4 * scale, seed: Math.random() * 100, mode: 'fire' });
    world._flames.push({ mats });
    // braci che salgono: più numerose, più grandi e con salita più marcata
    const n = 20;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffb050, size: 0.07, map: softDot, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    world._embers.push({ pts, pos, x, z, scale, seeds: Array.from({ length: n }, () => Math.random() * 10) });
    // NIENTE collider: ci si può camminare dentro. Ma è una ZONA DI FIAMMA che brucia (main.js).
    world.fires.push({ x, z, r: 1.15 * scale });
    placed.push({ x, z, r: 0.9 * scale });
  }
  const softDot = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  // ====================== LA RADURA (hub) ======================
  // capanna del ranger, falò con tronchi-panca, catasta e lanterne lungo i sentieri
  addProp('cabin', -5.6, -4.2, 0.8, { collider: 2.6 });
  addProp('crate', -3.9, -6.1, 0.4, { collider: 0.6 });
  addProp('barrel', -6.9, -1.9, 0, { collider: 0.5 });
  makeCampfire(1.5, 1.2, 1);
  // tronchi-panca attorno al fuoco
  for (const [lx, lz, ry] of [[3.4, 0.2, 1.2], [0.2, 3.3, -0.4], [-0.9, -1.3, 2.4]]) {
    addProp('log_fallen', lx, lz, ry, { collider: 0.45 });
  }
  // lanterne calde lungo i sentieri (una coppia per sentiero + una al cancello)
  for (const a of laneDirs) {
    const cs = Math.cos(a), sn = Math.sin(a);
    addLanternPost(cs * 12 - sn * 2.2, sn * 12 + cs * 2.2);
    addLanternPost(cs * 21 + sn * 2.2, sn * 21 - cs * 2.2);
    addLanternPost(cs * 30 - sn * 2.2, sn * 30 + cs * 2.2);
  }
  // sottobosco sparso nella corona dell'hub: ceppi, massi, tronchi, ossa
  const HUB_PROPS = ['tree_stump', 'boulder', 'rocks_moss', 'rock_small', 'log_fallen_big', 'log_fallen'];
  for (let tries = 0, n = 0; tries < 320 && n < 30; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 11.5 + Math.random() * (HUB_R - 14);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // non sui sentieri
    let onPath = false;
    for (const la of laneDirs) {
      const lon = x * Math.cos(la) + z * Math.sin(la);
      const per = Math.abs(-Math.sin(la) * x + Math.cos(la) * z);
      if (lon > 5 && per < 3.2) { onPath = true; break; }
    }
    if (onPath || !freeSpot(x, z, 0.8)) continue;
    const name = HUB_PROPS[n % HUB_PROPS.length];
    addProp(name, x, z, Math.random() * Math.PI * 2, { collider: name === 'log_fallen' ? 0 : 0.55 });
    n++;
  }
  for (let tries = 0, n = 0; tries < 120 && n < 11; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 9 + Math.random() * (HUB_R - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 0.5)) continue;
    addProp(['skull', 'ribcage', 'bone_A'][n % 3], x, z, Math.random() * Math.PI * 2, {});
    n++;
  }

  // ====================== IL BOSCO (pini instanziati) ======================
  // corona interna dell'hub: pini giocabili (con collider), mai sui sentieri
  for (let tries = 0, n = 0; tries < 700 && n < 66; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 13 + Math.random() * (HUB_R - 15);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let onPath = false;
    for (const la of laneDirs) {
      const lon = x * Math.cos(la) + z * Math.sin(la);
      const per = Math.abs(-Math.sin(la) * x + Math.cos(la) * z);
      if (lon > 5 && per < 3.8) { onPath = true; break; }
    }
    if (onPath || !freeSpot(x, z, 1.1)) continue;
    plantPine(x, z, 12 + Math.random() * 5, 0.5);
    n++;
  }
  // FORESTA PROFONDA SPARPAGLIATA: niente file concentriche — scatter naturale su tutta la
  // fascia da R-3 al bordo mappa, con RADURE casuali e ciuffi di densità (come un bosco vero).
  // Vicino all'arena gli alberi proiettano ombre; oltre R+7 sono "scenery" (fuori dal pass
  // shadow). I corridoi dei cancelli restano liberi. I piedi degli alberi esterni stanno
  // NELL'ACQUA della palude: pini che affiorano dal pantano.
  {
    const F_IN = R - 3, F_OUT = R + 24;
    const clump = (a, d) => Math.sin(a * 4.7 + d * 0.13) + Math.sin(a * 9.3 - d * 0.07 + 2.1); // -2..2
    for (let i = 0, planted = 0; i < 2400 && planted < 620; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = F_IN + Math.pow(Math.random(), 0.85) * (F_OUT - F_IN);
      // radure: dove il rumore di ciuffo è basso il bosco si apre
      if (clump(a, d) < -0.9 + Math.random() * 0.5) continue;
      const gap = 5.4 / d;
      let atGate = false;
      for (const gg of ZGEOM) {
        const da = Math.abs(((a - gg.gateAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < gap) { atGate = true; break; }
      }
      if (atGate) continue;
      const x = Math.cos(a) * d + (Math.random() - 0.5) * 2.2;
      const z = Math.sin(a) * d + (Math.random() - 0.5) * 2.2;
      plantPine(x, z, 12 + Math.random() * 7, 0, d > R + 7);
      planted++;
    }
  }

  // ====================== SOTTOBOSCO: 3 SPECIE instanziate ======================
  // Erba, felci e canne di palude (texture disegnate su canvas, alpha-test) su quad incrociati,
  // INSTANZIATE con vento e variazione di colore: UNA draw call per specie, qualunque quantità.
  // Niente ombre proiettate (costo alto, guadagno nullo di notte).
  function bladesCanvas() { // ciuffo d'erba
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const bx = 8 + Math.random() * 112;
      const h = 22 + Math.random() * 38;
      const lean = (Math.random() - 0.5) * 26;
      const w = 2.2 + Math.random() * 2.6;
      const grad = g.createLinearGradient(bx, 64, bx + lean, 64 - h);
      grad.addColorStop(0, '#243020');
      grad.addColorStop(1, ['#5a7038', '#68713f', '#48602e'][i % 3]);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(bx - w, 64);
      g.quadraticCurveTo(bx + lean * 0.4, 64 - h * 0.6, bx + lean, 64 - h);
      g.quadraticCurveTo(bx + lean * 0.5 + w, 64 - h * 0.55, bx + w, 64);
      g.closePath(); g.fill();
    }
    return cv;
  }
  function fernCanvas() { // felce: fronde archeggiate con pinnule
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const bx = 24 + Math.random() * 80;
      const len = 30 + Math.random() * 26;
      const dir = (Math.random() - 0.5) * 1.6;
      g.strokeStyle = ['#41582c', '#4d6534', '#37502a'][i % 3];
      g.lineWidth = 2.4;
      let px = bx, py = 64;
      g.beginPath(); g.moveTo(px, py);
      for (let s = 1; s <= 8; s++) {
        const t = s / 8;
        const nx = bx + dir * len * t * t * 0.9;
        const ny = 64 - len * t * (1 - t * 0.28);
        g.lineTo(nx, ny);
        // pinnule ai lati, più corte verso la punta
        const pl = (1 - t) * 7 + 1.5;
        g.moveTo(nx - pl, ny - pl * 0.4); g.lineTo(nx, ny); g.lineTo(nx + pl, ny - pl * 0.4);
        g.moveTo(nx, ny);
        px = nx; py = ny;
      }
      g.stroke();
    }
    return cv;
  }
  function reedCanvas() { // canne di palude: steli alti + pannocchie brune
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const g = cv.getContext('2d');
    for (let i = 0; i < 11; i++) {
      const bx = 6 + Math.random() * 52;
      const h = 78 + Math.random() * 46;
      const lean = (Math.random() - 0.5) * 14;
      g.strokeStyle = ['#5a6234', '#6c7040', '#4a5630'][i % 3];
      g.lineWidth = 2.2 + Math.random() * 1.2;
      g.beginPath();
      g.moveTo(bx, 128);
      g.quadraticCurveTo(bx + lean * 0.4, 128 - h * 0.6, bx + lean, 128 - h);
      g.stroke();
      if (i % 3 === 0) { // pannocchia (tifa)
        g.fillStyle = '#6a5230';
        g.beginPath();
        g.ellipse(bx + lean, 128 - h - 4, 2.2, 7, lean * 0.02, 0, Math.PI * 2);
        g.fill();
      }
    }
    return cv;
  }
  function tuftKind(canvas, w, h, amp) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = addWind(new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.32, side: THREE.DoubleSide,
      roughness: 1, metalness: 0, envMapIntensity: 0.45,
    }), amp, 0.05, h * 0.9);
    const qa = new THREE.PlaneGeometry(w, h); qa.translate(0, h / 2 - 0.01, 0);
    const qb = qa.clone(); qb.rotateY(Math.PI / 2);
    return { geo: mergeGeometries([qa, qb], false), mat, place: [] };
  }
  const TUFTS = {
    grass: tuftKind(bladesCanvas(), 0.85, 0.5, 0.05),
    fern: tuftKind(fernCanvas(), 1.15, 0.62, 0.03),
    reed: tuftKind(reedCanvas(), 0.62, 1.5, 0.07),
  };
  function plantTuft(kind, x, z) {
    const K = TUFTS[kind];
    if (!K) return;
    _pq.setFromAxisAngle(_up, Math.random() * Math.PI * 2);
    const s = 0.6 + Math.random() * 0.8;
    _pm.compose(_pv.set(x, 0, z), _pq, _ps.set(s, s * (0.75 + Math.random() * 0.5), s));
    K.place.push(_pm.clone());
  }
  function finalizeTufts() {
    const _gc = new THREE.Color();
    for (const K of Object.values(TUFTS)) {
      if (!K.place.length) continue;
      const im = new THREE.InstancedMesh(K.geo, K.mat, K.place.length);
      for (let k = 0; k < K.place.length; k++) {
        im.setMatrixAt(k, K.place[k]);
        const s = 0.78 + Math.random() * 0.5;
        _gc.setRGB(s * (0.9 + Math.random() * 0.25), s, s * 0.82);
        im.setColorAt(k, _gc);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false;
      im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
    }
  }
  // sottobosco dell'hub (mai sui sentieri né nella radura): erba dominante, felci all'ombra
  for (let n = 0; n < 1150; n++) {
    const a = Math.random() * Math.PI * 2;
    const d = 9.5 + Math.random() * (R - 10.5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let onPath = false;
    for (const la of laneDirs) {
      const lon = x * Math.cos(la) + z * Math.sin(la);
      const per = Math.abs(-Math.sin(la) * x + Math.cos(la) * z);
      if (lon > 5 && per < 2.4) { onPath = true; break; }
    }
    if (onPath) continue;
    plantTuft(Math.random() < 0.72 ? 'grass' : 'fern', x, z);
  }

  // ====================== ARREDI DELLA PALUDE (riusabili hub + zona) ======================
  // ACQUA REALISTICA: MeshStandard PBR con la normal map d'increspatura campionata DUE VOLTE, a
  // scale e direzioni di scorrimento diverse (uWaterT), fuse in una sola normale → la superficie
  // "vive" e turbina invece di scivolare come una texture. Rugosità bassa + metalness moderata:
  // luna e lanterne ci lasciano riflessi/scintillii che si muovono con le onde. Tecnica standard
  // (dual-scroll normal) senza il costo di un vero riflettore planare.
  function makeWaterMaterial({ map = null, alphaMap = null, color = 0xffffff, roughness = 0.11, metalness = 0.4, env = 0.7, normalScale = 0.6 }) {
    const m = new THREE.MeshStandardMaterial({
      map, color, roughness, metalness, envMapIntensity: env,
      normalMap: world._water, normalScale: new THREE.Vector2(normalScale, normalScale),
      transparent: true, alphaMap, depthWrite: false,
    });
    // ACQUA senza tiling visibile: DOMAIN WARPING + 3 strati a scale/direzioni/ROTAZIONI diverse.
    // 1) un campione a bassissima frequenza deforma le UV (warp) così il reticolo non si allinea
    //    mai in griglia; 2) tre strati di normali (fine, medio-ruotato, macro) scorrono a velocità
    //    diverse e si fondono in fBm → superficie organica che turbina, non una texture che scivola.
    //    (tecnica standard dell'acqua realtime: flow di normali + warp del dominio).
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWaterT = _waterT;
      sh.fragmentShader = ('uniform float uWaterT;\n' + sh.fragmentShader).replace(
        '#include <normal_fragment_maps>',
        [
          '#ifdef USE_NORMALMAP_TANGENTSPACE',
          '  vec2 wuv = vNormalMapUv;',
          '  vec2 warp = ( texture2D( normalMap, wuv * 0.14 + vec2( uWaterT * 0.006, -uWaterT * 0.0045 ) ).xy - 0.5 ) * 0.55;',
          '  const mat2 wR = mat2( 0.5403, -0.8415, 0.8415, 0.5403 );', // ~1 rad: disallinea la griglia
          '  vec2 uvA = wuv + warp + vec2( uWaterT * 0.020, uWaterT * 0.014 );',
          '  vec2 uvB = wR * wuv * 2.3 + warp * 1.6 + vec2( -uWaterT * 0.016, uWaterT * 0.019 );',
          '  vec2 uvC = wuv * 0.55 - warp * 0.7 + vec2( uWaterT * 0.008, uWaterT * 0.010 );',
          '  vec3 nA = texture2D( normalMap, uvA ).xyz * 2.0 - 1.0;',
          '  vec3 nB = texture2D( normalMap, uvB ).xyz * 2.0 - 1.0;',
          '  vec3 nC = texture2D( normalMap, uvC ).xyz * 2.0 - 1.0;',
          '  vec3 mapN = normalize( nA * 0.5 + nB * 0.34 + nC * 0.3 );',
          '  mapN.xy *= normalScale;',
          '  normal = normalize( tbn * mapN );',
          '#endif',
        ].join('\n'),
      );
    };
    m.customProgramCacheKey = () => 'swampwater2';
    return m;
  }

  // FUOCHI FATUI: sfere di luce spettrale che fluttuano sull'acqua. Sono Points ADDITIVI, non
  // PointLight → nessuna ricompilazione dei materiali (vedi trappole in CLAUDE.md). Si accendono
  // e svaniscono con un respiro sfasato per punto (baked nell'attributo di scala/opacità via update).
  function makeWisps(cx, cz, rad, count, color = 0x86e6a4, yBase = 0.45) {
    const pos = new Float32Array(count * 3);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rad;
      seeds.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, y: yBase + Math.random() * 1.2, p: Math.random() * 100 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.5, map: softDot, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 4;
    scene.add(pts);
    world._wisps.push({ pts, seeds, pos, mat, phase: Math.random() * 100 });
  }
  // NINFEE / TAPPETI DI ALGHE: dischi piatti scuri a pelo d'acqua, UNA InstancedMesh per chiamata.
  function makeLilyPads(cx, cz, innerR, outerR, count, mask) {
    const geo = new THREE.CircleGeometry(0.5, 9);
    // MATTE e NON riflettente: senza questo l'HDRI notturno blu ci si specchiava sopra e le ninfee
    // sembravano dischi ciano luminosi. roughness 1 + envMapIntensity bassa → fogliame scuro e opaco.
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.12, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, count);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const col = new THREE.Color(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    let k = 0;
    for (let tries = 0; tries < count * 8 && k < count; tries++) {
      const a = Math.random() * Math.PI * 2, d = innerR + Math.random() * (outerR - innerR);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (mask && mask(x, z) < 0.55) continue;
      const s = 0.55 + Math.random() * 1.2;
      _m.compose(pv.set(x, 0.03, z), q, sv.set(s, s, s));
      im.setMatrixAt(k, _m);
      col.setHSL(0.26 + Math.random() * 0.07, 0.5, 0.07 + Math.random() * 0.06); // verde scuro palustre
      im.setColorAt(k, col);
      k++;
    }
    im.count = k;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im);
  }
  // PONTILE MARCIO: assi di legno su pali che si protende sull'acqua, con qualche asse mancante.
  function makePier(x, z, ang, len) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = ang;
    const n = Math.max(4, Math.round(len / 0.55));
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.13) continue; // asse crollata
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.5), plankMat);
      plank.position.set((Math.random() - 0.5) * 0.1, 0.33 + (Math.random() - 0.5) * 0.05, i * 0.55);
      plank.rotation.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04);
      plank.castShadow = true; plank.receiveShadow = true;
      grp.add(plank);
    }
    for (let i = 0; i <= n; i += 3) {
      for (const sx of [-0.75, 0.75]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.0, 6), barkMat);
        post.position.set(sx, -0.05, i * 0.55);
        post.castShadow = true;
        grp.add(post);
      }
    }
    scene.add(grp);
  }
  // BARCA A REMI semi-affondata: scafo di assi che sprofonda di prua nell'acqua nera.
  function makeRowboat(x, z, rot) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x463a28, roughness: 0.95, metalness: 0 });
    const L = 3.0, W = 1.1;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, L), mat); floor.position.y = 0.18; grp.add(floor);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, L), mat);
      side.position.set(sx * W / 2, 0.36, 0); side.rotation.z = sx * 0.28; grp.add(side);
    }
    for (const sz of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(W, 0.42, 0.5), mat);
      cap.position.set(0, 0.36, sz * L / 2); cap.scale.x = sz > 0 ? 0.42 : 0.72; grp.add(cap);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.06, 0.3), mat); bench.position.set(0, 0.46, -0.3); grp.add(bench);
    grp.position.set(x, 0, z); grp.rotation.y = rot; grp.rotation.x = -0.14;
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(grp);
    world.colliders.push({ x, z, r: 1.0 });
    placed.push({ x, z, r: 1.4 });
  }

  // ====================== LA PALUDE PERIMETRALE (acqua verde) ======================
  // UN SOLO anello d'acqua stagnante che CIRCONDA tutta l'arena. La riva non è un cerchio:
  // la disegna una MASCHERA PROCEDURALE (rumore multi-frequenza sull'angolo) e attorno a ogni
  // zona l'acqua si ritira in una BAIA dal bordo curvo e irregolare (niente tagli dritti).
  // La stessa funzione waterMask decide: alpha dell'acqua, chiazze di alghe, dove piantare le
  // canne e DA DOVE risalgono gli zombi.
  const WOUT = R + 18;
  {
    // normal map di increspature: rumore di altezza fBm a 5 ottave -> gradiente -> RGB (tileabile).
    // Più ottave + risoluzione doppia = increspature ricche; la RIPETIZIONE visibile la spezza poi
    // lo shader (domain-warp + strati ruotati, vedi makeWaterMaterial).
    const S = 256;
    const hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let n = 0, f = 3 / S, amp = 1, norm = 0;
        for (let o = 0; o < 5; o++) {
          const xi = Math.floor(x * f), yi = Math.floor(y * f), xf = x * f - xi, yf = y * f - yi;
          // reticolo campionato MODULO il periodo -> la texture wrappa senza cuciture
          const per = Math.max(1, Math.round(S * f));
          const rr = (a, b) => { const s2 = Math.sin(((a % per + per) % per) * 127.1 + ((b % per + per) % per) * 311.7 + o * 53) * 43758.5453; return s2 - Math.floor(s2); };
          const sm = (t) => t * t * (3 - 2 * t);
          const u = sm(xf), v = sm(yf);
          n += amp * ((rr(xi, yi) * (1 - u) + rr(xi + 1, yi) * u) * (1 - v) + (rr(xi, yi + 1) * (1 - u) + rr(xi + 1, yi + 1) * u) * v);
          norm += amp; f *= 2; amp *= 0.55;
        }
        hgt[y * S + x] = n / norm;
      }
    }
    const ncv = document.createElement('canvas'); ncv.width = ncv.height = S;
    const ng = ncv.getContext('2d');
    const nimg = ng.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const xm = (x - 1 + S) % S, xp = (x + 1) % S, ym = (y - 1 + S) % S, yp = (y + 1) % S;
        const dx = (hgt[y * S + xm] - hgt[y * S + xp]) * 2.2;
        const dy = (hgt[ym * S + x] - hgt[yp * S + x]) * 2.2;
        const inv = 1 / Math.hypot(dx, dy, 1);
        const i = (y * S + x) * 4;
        nimg.data[i] = (dx * inv * 0.5 + 0.5) * 255;
        nimg.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
        nimg.data[i + 2] = (inv * 0.5 + 0.5) * 255;
        nimg.data[i + 3] = 255;
      }
    }
    ng.putImageData(nimg, 0, 0);
    const waterNormal = new THREE.CanvasTexture(ncv);
    waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
    waterNormal.repeat.set(9, 9); // tile più grande e morbido; il grid lo spezza il domain-warp
    waterNormal.anisotropy = 8;
    world._water = waterNormal; // scroll delle increspature in world.update

    // ---- riva procedurale condivisa ----
    const sm01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    const fbm2 = (x, y) => Math.sin(x * 1.7 + y * 2.3) * 0.5 + Math.sin(x * 3.9 - y * 1.1 + 1.7) * 0.3 + Math.sin(x * 8.3 + y * 5.7 + 4.2) * 0.2;
    const zoneBays = ZGEOM.map((g) => ({ x: g.center.x, z: g.center.z, r: g.zone.radius + 2.5 }));
    // raggio della riva per angolo: base ~27 + rumore multi-frequenza (±2.8 m, MAI liscio)
    const SHORE0 = HUB_R - 3.6; // la riva segue la dimensione dell'arena
    const shoreR = (ang) => SHORE0 + Math.sin(ang * 3 + 1.7) * 1.7 + Math.sin(ang * 7 + 0.6) * 1.0 + Math.sin(ang * 13 + 3.1) * 0.5;
    // 0 = asciutto, 1 = acqua piena
    function waterMask(wx, wz) {
      const r = Math.hypot(wx, wz);
      const ang = Math.atan2(wz, wx);
      let a = sm01((r - shoreR(ang)) / 2.6);
      for (const zc of zoneBays) {
        const d = Math.hypot(wx - zc.x, wz - zc.z);
        const la = Math.atan2(wz - zc.z, wx - zc.x);
        const edge = zc.r + 1.5 + Math.sin(la * 5 + zc.x * 0.7) * 1.7 + Math.sin(la * 11 + zc.z * 0.9) * 0.9;
        a *= sm01((d - edge) / 3.2); // baia asciutta attorno alla zona, bordo curvo irregolare
      }
      return a * (1 - sm01((r - (WOUT - 3.5)) / 2.5));
    }
    world._waterMask = waterMask;

    // ---- canvas planari sull'intero disco (mappatura: wx=(2cx/A-1)*WOUT, wz=(2cy/A-1)*WOUT,
    //      derivata da UV del ring + rotation.x=-PI/2 + flipY del canvas) ----
    const A = 512;
    const acv = document.createElement('canvas'); acv.width = acv.height = A;
    const mcv = document.createElement('canvas'); mcv.width = mcv.height = A;
    const ag = acv.getContext('2d'), mg = mcv.getContext('2d');
    const aimg = ag.createImageData(A, A), mimg = mg.createImageData(A, A);
    for (let y = 0; y < A; y++) {
      for (let x = 0; x < A; x++) {
        const wx = (2 * x / A - 1) * WOUT, wz = (2 * y / A - 1) * WOUT;
        const m = waterMask(wx, wz);
        const i = (y * A + x) * 4;
        aimg.data[i] = aimg.data[i + 1] = aimg.data[i + 2] = m * 255; aimg.data[i + 3] = 255;
        // COLORE dell'acqua: verde palustre cupo con variazione + CHIAZZE DI ALGHE (lenticchia
        // d'acqua) dove il rumore è alto, e bordo più fangoso dove l'acqua è bassa (m piccolo)
        const n1 = fbm2(wx * 0.11, wz * 0.11) * 0.5 + 0.5;
        const n2 = fbm2(wx * 0.31 + 9, wz * 0.31 - 4) * 0.5 + 0.5;
        let cr = 10 + n1 * 8, cg = 24 + n1 * 12, cb = 14 + n1 * 6;
        const algae = sm01((n2 - 0.58) / 0.3) * 0.85; // chiazze nette ma coi bordi morbidi
        cr = cr + (44 - cr) * algae; cg = cg + (74 - cg) * algae; cb = cb + (30 - cb) * algae;
        const muddy = 1 - sm01((m - 0.25) / 0.5);
        cr = cr + (36 - cr) * muddy * 0.5; cg = cg + (38 - cg) * muddy * 0.5; cb = cb + (26 - cb) * muddy * 0.5;
        mimg.data[i] = cr; mimg.data[i + 1] = cg; mimg.data[i + 2] = cb; mimg.data[i + 3] = 255;
      }
    }
    ag.putImageData(aimg, 0, 0);
    mg.putImageData(mimg, 0, 0);
    const shoreAlpha = new THREE.CanvasTexture(acv);
    const swampMap = new THREE.CanvasTexture(mcv);
    swampMap.colorSpace = THREE.SRGBColorSpace;
    world._swampMap = swampMap; // riusato dai bacini della zona PALUDE

    // acqua: normali a DOPPIO SCORRIMENTO (superficie che turbina) + riflessi contenuti; il verde
    // viene dalla MAPPA, lo speculare mobile dalle increspature. Rugosità bassa → luna/lanterne
    // ci lasciano scintillii che si muovono con le onde.
    const waterMat = makeWaterMaterial({ map: swampMap, alphaMap: shoreAlpha, roughness: 0.1, metalness: 0.34, env: 0.7, normalScale: 0.65 });
    const water = new THREE.Mesh(new THREE.RingGeometry(HUB_R - 10, WOUT, 96, 1), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.024;
    water.renderOrder = 2;
    water.receiveShadow = true;
    scene.add(water);

    // CANNE E CIUFFI lungo la riva vera (waterMask decide dove: mai nelle baie asciutte)
    for (let n = 0, tries = 0; n < 200 && tries < 700; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const sr = shoreR(ang);
      const d = sr - 1.3 + Math.random() * 3.6;
      const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if (waterMask(Math.cos(ang) * (sr + 1.6), Math.sin(ang) * (sr + 1.6)) < 0.45) continue;
      plantTuft(d > sr + 0.2 || Math.random() < 0.6 ? 'reed' : 'grass', x, z);
      n++;
    }
    // NINFEE galleggianti sparse sull'anello d'acqua + FUOCHI FATUI che vagano sulla riva
    makeLilyPads(0, 0, SHORE0 - 1, WOUT - 4, 110, waterMask);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.7;
      makeWisps(Math.cos(a) * (SHORE0 + 3.5), Math.sin(a) * (SHORE0 + 3.5), 6.5, 4, 0x8fe6a6, 0.5);
    }

      // ---- STAGNI D'ACQUITRINO dentro il bosco: pozze verdi ferme tra gli alberi, con
    // canne attorno — la palude non è solo al bordo, ci cammini in mezzo. Alcuni sono
    // anche punti di risalita. ----
    const bogAlpha = makeBlobAlphaTexture(11);
    const bogMat = makeWaterMaterial({ map: swampMap, alphaMap: bogAlpha, roughness: 0.12, metalness: 0.3, env: 0.6, normalScale: 0.55 });
    const bogGeo = new THREE.PlaneGeometry(2, 2);
    for (let n = 0, tries = 0; n < 7 && tries < 120; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 13 + Math.random() * (HUB_R - 18);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      let onPath = false;
      for (const la of laneDirs) {
        const lon = x * Math.cos(la) + z * Math.sin(la);
        const per = Math.abs(-Math.sin(la) * x + Math.cos(la) * z);
        if (lon > 5 && per < 4.2) { onPath = true; break; }
      }
      if (onPath || !freeSpot(x, z, 2.6)) continue;
      const bog = new THREE.Mesh(bogGeo, bogMat);
      bog.scale.set(2.2 + Math.random() * 1.8, 1.7 + Math.random() * 1.4, 1);
      bog.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      bog.position.set(x, 0.02, z);
      bog.renderOrder = 2;
      scene.add(bog);
      for (let k = 0; k < 7; k++) {
        const ka = Math.random() * Math.PI * 2, kd = 2.2 + Math.random() * 1.6;
        plantTuft(Math.random() < 0.7 ? 'reed' : 'grass', x + Math.cos(ka) * kd, z + Math.sin(ka) * kd);
      }
      if (n % 2 === 0) world.graves.push(new THREE.Vector3(x, 0, z)); // risalita dallo stagno
      placed.push({ x, z, r: 2.2 });
      n++;
    }

  // ====================== punti di risalita zombi ======================
    // Gli zombi EMERGONO DALLA PALUDE: punti nell'acqua bassa appena oltre la riva (dentro il
    // confine giocabile), distribuiti su TUTTO l'anello — arrivano da ogni direzione.
    for (let tries = 0, n = 0; tries < 500 && n < 22; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const sr = shoreR(ang);
      const d = Math.min(sr + 0.6 + Math.random() * 1.6, HUB_R - 1.2);
      const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if (waterMask(x, z) < 0.35) continue; // baia asciutta: lì non c'è acqua da cui uscire
      world.graves.push(new THREE.Vector3(x, 0, z));
      n++;
    }
  }
  // ... più qualche risalita classica tra gli alberi dell'hub
  for (let tries = 0, n = 0; tries < 200 && n < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 12 + Math.random() * (R - 18);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 0.8)) continue;
    world.graves.push(new THREE.Vector3(x, 0, z));
    n++;
  }

  // ====================== CIELO: cupola, stelle, luna ======================
  {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x02040a) },
        mid: { value: new THREE.Color(0x081018) },
        hor: { value: new THREE.Color(0x14201c) },
        bot: { value: new THREE.Color(0x040605) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top,mid,hor,bot; varying vec3 vP;',
        'void main(){',
        '  float h = normalize(vP).y;',
        '  vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.72, h)) : mix(mid, bot, smoothstep(0.0, -0.35, h));',
        '  c = mix(c, hor, exp(-abs(h) * 12.0) * 0.5);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}',
      ].join('\n'),
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);
  }
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
    stars.renderOrder = -9.5;
    scene.add(stars);
  }
  {
    const dv = document.createElement('canvas'); dv.width = dv.height = 256;
    const dg = dv.getContext('2d');
    const cx = 128, cy = 128, rad = 112;
    const disc = dg.createRadialGradient(cx - 26, cy - 26, 8, cx, cy, rad);
    disc.addColorStop(0, 'rgba(255,253,246,1)');
    disc.addColorStop(0.68, 'rgba(240,242,247,1)');
    disc.addColorStop(0.9, 'rgba(206,213,228,1)');
    disc.addColorStop(1, 'rgba(150,160,186,0)');
    dg.fillStyle = disc; dg.beginPath(); dg.arc(cx, cy, rad, 0, Math.PI * 2); dg.fill();
    dg.save(); dg.beginPath(); dg.arc(cx, cy, rad * 0.98, 0, Math.PI * 2); dg.clip();
    dg.globalAlpha = 0.09; dg.fillStyle = '#7f869c';
    for (const [sx, sy, sr] of [[92, 104, 34], [150, 118, 26], [118, 158, 40], [172, 92, 18], [82, 158, 22], [150, 168, 16]]) {
      dg.beginPath(); dg.arc(sx, sy, sr, 0, Math.PI * 2); dg.fill();
    }
    dg.restore();
    const moonTex = new THREE.CanvasTexture(dv); moonTex.colorSpace = THREE.SRGBColorSpace;
    const moonPos = new THREE.Vector3(66, 116, -150);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTexture('rgba(190,205,238,0.32)', 'rgba(150,170,220,0)'),
      fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.position.copy(moonPos); halo.scale.setScalar(46); halo.renderOrder = -9.3; scene.add(halo);
    const disk = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex, fog: false, transparent: true, depthWrite: false,
    }));
    disk.position.copy(moonPos); disk.scale.setScalar(19); disk.renderOrder = -9.2; scene.add(disk);
  }

  // --- NEBBIA VERA: sfogli volumetrici ANIMATI --- Non dischi statici che scivolano ma
  // banchi il cui PROFILO evolve nel tempo (rumore 3D nel fragment shader, terza coordinata =
  // tempo) con dissolvenza radiale e respiro di opacita'. Piu' fitti sull'acqua della palude.
  const FOG_FRAG = [
    'uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uSeed;',
    'varying vec2 vUv;',
    'float h3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n3(vec3 p){',
    '  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);',
    '}',
    'void main(){',
    '  vec2 q = vUv * 2.6 + uSeed;',
    '  float n = n3(vec3(q + vec2(uTime * 0.025, uTime * 0.014), uTime * 0.05 + uSeed)) * 0.62',
    '          + n3(vec3(q * 2.3 + 5.0, uTime * 0.08 + uSeed * 1.7)) * 0.38;',
    '  float d = length(vUv - 0.5) * 2.0;',
    '  float fall = smoothstep(1.0, 0.3, d);',
    '  float a = smoothstep(0.34, 0.75, n) * fall * uOpacity;',
    '  gl_FragColor = vec4(uColor, a);',
    '}',
  ].join('\n');
  function makeFogSheet(x, z, y, size, opacity, hue = 0x9aa89c, tilt = 0) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: _windT, uOpacity: { value: opacity },
        uColor: { value: new THREE.Color(hue) }, uSeed: { value: Math.random() * 37 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FOG_FRAG,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2 + tilt;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, y + Math.min(1.1, Math.abs(tilt) * size * 0.12), z);
    m.renderOrder = 3;
    scene.add(m);
    world._mist.push({ mesh: m, mat, seed: Math.random() * 100, speed: 0.15 + Math.random() * 0.25, base: opacity });
  }
  // banchi nel bosco dell'hub
  for (let i = 0; i < 13; i++) {
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (R - 12);
    makeFogSheet(Math.cos(a) * d, Math.sin(a) * d, 0.4 + Math.random() * 0.5, 15 + Math.random() * 11, 0.15);
  }
  // banchi FITTI sopra l'acqua della palude perimetrale (vapore verde-grigio); un terzo
  // sono INCLINATI: i piani orizzontali visti di taglio in prima persona sparirebbero
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const d = HUB_R - 2 + Math.random() * 11;
    makeFogSheet(Math.cos(a) * d, Math.sin(a) * d, 0.5 + Math.random() * 0.5, 18 + Math.random() * 13, 0.19, 0x93a692, i % 3 === 0 ? 0.22 : 0);
  }

  // --- lucciole (texture morbida: senza map i Points sono quadrati) ---
  {
    const n = 84;
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
      color: 0xd8dd7a, size: 0.11, map: softDot, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    world._fireflies = { pts, seeds, pos };
  }

  // --- pulviscolo/spore sospese ---
  {
    const n = 130;
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
      color: 0xa9b08a, size: 0.06, map: softDot, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    world._motes = { pts, seeds, pos };
  }

  // --- AGHI E FOGLIE MORTE a terra (una sola mesh fusa) ---
  {
    const parts = [];
    const _c = new THREE.Color();
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 4 + Math.random() * (R - 6);
      const w = 0.14 + Math.random() * 0.2;
      const g = new THREE.PlaneGeometry(w, w * (0.7 + Math.random() * 0.6));
      const roll = Math.random();
      if (roll < 0.5) _c.setHSL(0.07, 0.42, 0.13 + Math.random() * 0.08);       // foglia morta
      else if (roll < 0.8) _c.setHSL(0.09, 0.3, 0.2 + Math.random() * 0.1);      // aghi secchi
      else _c.setHSL(0.24, 0.25, 0.16 + Math.random() * 0.08);                   // muschio
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) { col[k] = _c.r; col[k + 1] = _c.g; col[k + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.rotateX(-Math.PI / 2 + (Math.random() - 0.5) * 0.14);
      g.rotateY(Math.random() * Math.PI * 2);
      g.translate(Math.cos(a) * d, 0.02 + Math.random() * 0.008, Math.sin(a) * d);
      parts.push(g);
    }
    const litter = new THREE.Mesh(mergeGeometries(parts, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    parts.forEach((p) => p.dispose());
    litter.receiveShadow = true;
    scene.add(litter);
  }

  // ======================= ZONE SBLOCCABILI + CANCELLI =======================

  // cartello di quarantena metallico col nome della zona e il costo in Anime
  function makeSign(name, cost) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(24,26,30,0.94)'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#8a8f96'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 244);
    g.save(); g.beginPath(); g.rect(10, 10, 492, 34); g.clip();
    for (let x = -40; x < 540; x += 40) {
      g.fillStyle = '#d8b02a'; g.beginPath();
      g.moveTo(x, 44); g.lineTo(x + 20, 10); g.lineTo(x + 40, 10); g.lineTo(x + 20, 44); g.fill();
    }
    g.restore();
    g.textAlign = 'center'; g.fillStyle = '#e8e6e0';
    g.font = 'bold 44px Arial, sans-serif';
    const words = name.split(' ');
    let line = '', y = 105; const lines = [];
    for (const w of words) { if ((line + w).length > 16) { lines.push(line.trim()); line = ''; } line += w + ' '; }
    lines.push(line.trim());
    for (const l of lines) { g.fillText(l, 256, y); y += 48; }
    g.fillStyle = '#ffcf6a'; g.font = 'bold 50px Arial, sans-serif';
    g.fillText(`${cost} ✦ ANIME`, 256, 218);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    return mesh;
  }

  // Contenuti delle zone (le chiavi sono gli id storici: crypt=CIMITERO, church=CAMPO BASE,
  // wood=PALUDE — vedi ZONES in config.js).
  const ZONE_CONTENT = {
    // IL CIMITERO nel bosco: recinzione in ferro, file di lapidi consumate, due mausolei,
    // il busto di marmo, bare riesumate e alberi morti. La nebbia qui è più blu e fredda.
    crypt(cx, cz, ZR) {
      // recinzione in ferro battuto attorno al campo santo interno
      const fr = ZR * 0.62;
      const n = Math.round((Math.PI * 2 * fr) / 2.1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const da = Math.abs(((a - (ZONES[0].angle + Math.PI) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < 0.45) continue; // varco verso l'hub
        const panel = new THREE.Mesh(IRON_PANEL, ironMat);
        panel.position.set(cx + Math.cos(a) * fr, 0, cz + Math.sin(a) * fr);
        panel.rotation.y = -a + Math.PI / 2;
        panel.castShadow = true; panel.receiveShadow = true; panel.frustumCulled = true;
        scene.add(panel);
      }
      // file di lapidi dentro il recinto
      for (let row = -2; row <= 2; row++) {
        for (let col = -2; col <= 2; col++) {
          if (Math.random() < 0.2) continue;
          const x = cx + col * 2.4 + (Math.random() - 0.5) * 0.5;
          const z = cz + row * 2.6 + (Math.random() - 0.5) * 0.5;
          if (Math.hypot(x - cx, z - cz) > fr - 1.2) continue;
          placeGrave(x, z, (Math.random() - 0.5) * 0.5);
        }
      }
      placeMausoleum(cx - ZR * 0.55, cz - ZR * 0.35, 0.6);
      placeMausoleum(cx + ZR * 0.5, cz + ZR * 0.42, -2.2);
      placeStatue(cx + ZR * 0.35, cz - ZR * 0.45, 0.8);
      // bare riesumate e ossa fuori dal recinto
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.28, d = fr + 1.5 + Math.random() * 3;
        addProp('coffin', cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, { collider: 0.7 });
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.8;
        addProp(['skull', 'ribcage', 'bone_A'][i % 3], cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, {});
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5, d = ZR * (0.75 + Math.random() * 0.12);
        placeDeadTree(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 1.5 + Math.random() * 0.6, 0.55);
      }
      // lanterne FREDDE ai quattro canti del recinto
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        addLanternPost(cx + Math.cos(a) * (fr - 1.2), cz + Math.sin(a) * (fr - 1.2), 1.9, 0x9db8e8);
      }
    },
    // IL CAMPO BASE: l'ultimo presidio militare — capanno marcio, torretta, ambulanza M725,
    // sacchi di sabbia, casse e fari da lavoro. Poi sono arrivati in troppi.
    church(cx, cz, ZR) {
      addProp('shed', cx - ZR * 0.4, cz - ZR * 0.3, 0.9, { collider: 2.3 });
      addProp('watchtower', cx + ZR * 0.45, cz - ZR * 0.4, -0.6, { collider: 1.1 });
      addProp('truck_m725', cx + ZR * 0.15, cz + ZR * 0.45, 2.2, { collider: 2.2 });
      // sacchi di sabbia a ferro di cavallo davanti al capanno
      for (const [dx, dz, ry] of [[-2.5, 3.2, 0.3], [0, 4.1, 0], [2.5, 3.4, -0.3], [-4.1, 1.4, 1.1], [4.2, 1.6, -1.1]]) {
        addProp('sandbags', cx + dx, cz + dz, ry, { collider: 0.9 });
      }
      addProp('jersey', cx - ZR * 0.6, cz + ZR * 0.35, 0.7, { collider: 0.8, tint: 0x8f8f8f });
      addProp('jersey', cx - ZR * 0.52, cz + ZR * 0.48, 1.1, { collider: 0.8, tint: 0x8f8f8f });
      // cataste di casse e barili (coperture)
      for (let i = 0; i < 6; i++) {
        const bx = cx + (i % 2 ? 1 : -1) * (2.2 + (i * 1.3) % 3), bz = cz - ZR * 0.1 + i * 1.5;
        addProp('crate', bx, bz, (Math.random() - 0.5) * 0.6, { collider: 0.7, scaleMult: 1 + (i % 3) * 0.25 });
        if (i % 3 === 0) addProp('barrel', bx + 0.7, bz + 0.4, 0, { collider: 0.5 });
      }
      addProp('debris', cx + ZR * 0.55, cz + ZR * 0.1, 1.3, { collider: 0.9, scaleMult: 0.9 });
      // FARI DA LAVORO (lampioni arrugginiti) coi fasci caldi: gli unici ancora accesi
      for (const [fx, fz] of [[cx - ZR * 0.15, cz - ZR * 0.5], [cx + ZR * 0.5, cz + ZR * 0.32]]) {
        const facing = Math.atan2(cx - fx, cz - fz);
        addProp('streetlight', fx, fz, facing, { collider: 0.28 });
        // la LAMPADA sta in punta al braccio (~1.3 m verso la strada), non sul palo:
        // luce E fascio partono da lì, sennò il cono esce di fianco alla lampada
        const hx = fx + Math.sin(facing) * 1.3, hz = fz + Math.cos(facing) * 1.3;
        const light = new THREE.PointLight(0xffc27a, 3.2, 18, 1.8);
        light.position.set(hx, 4.1, hz);
        scene.add(light);
        world.lanterns.push({ light, base: 3.2, seed: Math.random() * 100 });
        addBeam(hx, hz, 4.05);
      }
      // bidone che brucia vicino ai sacchi (falò militare)
      makeCampfire(cx + 1.2, cz + 1.8, 0.7);
    },
    // LA PALUDE: stagni d'acqua nera immobile, tronchi marci, i cappi dei disperati e la
    // nebbia più fitta del bosco. Gli striscianti qui sono a casa.
    wood(cx, cz, ZR) {
      // --- LAGUNA CENTRALE: acqua nera-verde riflettente a bordo irregolare (unione di pozze).
      // Riusa la normal map d'increspatura della palude perimetrale (world._water) → le ripples
      // scorrono "gratis" con l'offset globale aggiornato in world.update. ---
      const lagoon = [
        { x: cx - ZR * 0.10, z: cz + ZR * 0.06, r: ZR * 0.44 },
        { x: cx + ZR * 0.36, z: cz - ZR * 0.24, r: ZR * 0.26 },
        { x: cx - ZR * 0.38, z: cz - ZR * 0.30, r: ZR * 0.22 },
        { x: cx + ZR * 0.16, z: cz + ZR * 0.50, r: ZR * 0.20 },
      ];
      const inLagoon = (x, z) => {
        let m = 0;
        for (const p of lagoon) {
          const d = Math.hypot(x - p.x, z - p.z);
          m = Math.max(m, 1 - THREE.MathUtils.smoothstep(d, p.r * 0.5, p.r));
        }
        return m;
      };
      // laguna: acqua nera profonda, più riflettente (specchio) e con le stesse onde animate
      const lagoonMat = makeWaterMaterial({ color: 0x05110c, alphaMap: makeBlobAlphaTexture(21), roughness: 0.09, metalness: 0.5, env: 0.8, normalScale: 0.5 });
      const lagoonGeo = new THREE.PlaneGeometry(2, 2);
      for (const p of lagoon) {
        const w = new THREE.Mesh(lagoonGeo, lagoonMat);
        w.scale.set(p.r * 1.15, p.r * 1.15, 1);
        w.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
        w.position.set(p.x, 0.02, p.z);
        w.renderOrder = 2; w.receiveShadow = true;
        scene.add(w);
      }
      makeLilyPads(cx, cz, 0, ZR * 0.9, 80, inLagoon);

      // --- PONTILE marcio proteso sulla laguna principale (dalla riva verso l'hub) ---
      const L0 = lagoon[0];
      {
        const hl = Math.hypot(L0.x, L0.z) || 1;
        const px0 = L0.x + (-L0.x / hl) * (L0.r + 0.6);
        const pz0 = L0.z + (-L0.z / hl) * (L0.r + 0.6);
        makePier(px0, pz0, Math.atan2(L0.x - px0, L0.z - pz0), L0.r * 1.25);
      }
      // --- BARCA A REMI semi-affondata nella laguna ---
      makeRowboat(L0.x + ZR * 0.08, L0.z - ZR * 0.05, Math.random() * Math.PI * 2);

      // --- CIPRESSI MORTI che emergono dall'acqua nera (alti, spogli), con liane/muschio e cappi ---
      const vineMat = new THREE.MeshStandardMaterial({ color: 0x3a4a28, roughness: 1 });
      for (let i = 0, n = 0; i < 120 && n < 16; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.85;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (inLagoon(x, z) < 0.45 || !freeSpot(x, z, 0.9)) continue; // solo dentro l'acqua
        placeDeadTree(x, z, 1.9 + Math.random() * 1.0, 0.5);
        if (Math.random() < 0.55) {
          const strands = 2 + (Math.random() * 2 | 0);
          for (let k = 0; k < strands; k++) {
            const len = 0.9 + Math.random() * 1.4;
            const v = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, len, 4), vineMat);
            const va = Math.random() * 6.28, vr = 0.3 + Math.random() * 0.5;
            v.position.set(x + Math.cos(va) * vr, 2.6 - len / 2 + Math.random() * 0.6, z + Math.sin(va) * vr);
            scene.add(v);
          }
        }
        if (Math.random() < 0.3) noose(x + 0.4, z);
        n++;
      }

      // --- CANNE FITTE lungo la fascia di riva della laguna ---
      for (let i = 0, n = 0; i < 260 && n < 70; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.92;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        const m = inLagoon(x, z);
        if (m < 0.25 || m > 0.75) continue;
        plantTuft(Math.random() < 0.82 ? 'reed' : 'grass', x, z);
        n++;
      }

      // --- PINI VIVI solo sull'asciutto ai margini (il bosco si chiude ai bordi) ---
      for (let tries = 0, n = 0; tries < 160 && n < 12; tries++) {
        const a = Math.random() * 6.28, d = ZR * 0.5 + Math.random() * ZR * 0.42;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (inLagoon(x, z) > 0.2 || !freeSpot(x, z, 1.0)) continue;
        plantPine(x, z, 11 + Math.random() * 5, 0.5);
        n++;
      }

      // --- alberi morti sull'asciutto, tronchi caduti, ossa ---
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.85;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (inLagoon(x, z) > 0.3) continue;
        placeDeadTree(x, z, 1.5 + Math.random() * 0.7, 0.55);
      }
      const woodNature = ['log_fallen', 'log_fallen_big', 'tree_stump', 'rocks_moss', 'boulder'];
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.85;
        const name = woodNature[i % woodNature.length];
        addProp(name, cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, { collider: name === 'log_fallen' ? 0 : 0.55 });
      }
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * 6.28, d = Math.random() * ZR * 0.85;
        addProp(['skull', 'ribcage', 'bone_A'][i % 3], cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.random() * 6.28, {});
      }

      // --- FUOCHI FATUI sopra la laguna + NEBBIA bassa e densa (più fitta sull'acqua) ---
      for (const p of lagoon) makeWisps(p.x, p.z, p.r * 0.8, 4 + (Math.random() * 3 | 0), 0x8ce89e, 0.4);
      for (let i = 0; i < 9; i++) {
        const p = lagoon[i % lagoon.length];
        const x = i < 5 ? p.x + (Math.random() - 0.5) * p.r : cx + (Math.random() - 0.5) * ZR * 1.3;
        const z = i < 5 ? p.z + (Math.random() - 0.5) * p.r : cz + (Math.random() - 0.5) * ZR * 1.3;
        makeFogSheet(x, z, 0.3 + Math.random() * 0.4, 15 + Math.random() * 11, i < 5 ? 0.3 : 0.24, 0x8ba388);
      }
    },
  };

  function buildZone(geo) {
    const z = geo.zone, cx = geo.center.x, cz = geo.center.z, ZR = z.radius;
    // terreno per zona: stesso sottobosco con tinte diverse (cimitero freddo, campo terroso, palude verdastra)
    const tint = { cemetery: 0x585c60, camp: 0x6b6353, swamp: 0x49523f }[z.ground] || 0x66695c;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ZR + 2.5, 56),
      antiTile(pbrMat(Assets.tex.forest, { color: tint, normalScale: 1.0 })));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(cx, 0.012, cz);
    disc.receiveShadow = true;
    scene.add(disc);
    // bosco SPARPAGLIATO attorno alla zona (varco verso l'hub); oltre ZR+4 è scenografia
    for (let i = 0, planted = 0; i < 700 && planted < 110; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = ZR + 1 + Math.pow(Math.random(), 0.9) * 9;
      const da = Math.abs(((a - (z.angle + Math.PI) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 0.42) continue;
      plantPine(cx + Math.cos(a) * rr + (Math.random() - 0.5) * 1.6,
        cz + Math.sin(a) * rr + (Math.random() - 0.5) * 1.6, 12.5 + Math.random() * 5.5, 0, rr > ZR + 4);
      planted++;
    }
    ZONE_CONTENT[z.id]?.(cx, cz, ZR);
    // sottobosco per zona: la palude è invasa da canne e felci, il campo è battuto,
    // il cimitero è incolto (erba alta tra le lapidi)
    const mix = {
      swamp: { n: 190, kinds: ['reed', 'reed', 'grass', 'fern'] },
      cemetery: { n: 95, kinds: ['grass', 'grass', 'fern'] },
      camp: { n: 36, kinds: ['grass'] },
    }[z.ground] || { n: 60, kinds: ['grass'] };
    for (let i = 0; i < mix.n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * ZR * 0.92;
      plantTuft(mix.kinds[i % mix.kinds.length], cx + Math.cos(a) * d, cz + Math.sin(a) * d);
    }
    // luce d'ambiente della zona (due punti, tinta della zona) — creata al build, sempre presente
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI * 2 + 0.5;
      const lx = cx + Math.cos(a) * ZR * 0.5, lz = cz + Math.sin(a) * ZR * 0.5;
      const light = new THREE.PointLight(z.lightColor, 1.8, 16, 1.9);
      light.position.set(lx, 3.4, lz);
      scene.add(light);
      world.lanterns.push({ light, base: 1.8, seed: Math.random() * 100 });
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28, d = ZR * (0.3 + Math.random() * 0.6);
      world.spawnPoints.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, zone: z.id });
    }
    world.rooms.push({ cx, cz, r: ZR, active: false, id: z.id });
  }

  // CANCELLO monumentale: portale più alto e largo, pali-tronco solidi con collider, trave
  // decorata e TEMATIZZAZIONE per destinazione (cimitero in ferro/teschi, checkpoint militare con
  // filo spinato/sacchi, palude coi cappi e le liane). Le ante restano due ante d'assi che si
  // spalancano all'apertura (l'animazione ruota lf.pivot, vedi world.update).
  function buildGate(geo) {
    const z = geo.zone;
    const grp = new THREE.Group();
    grp.position.set(geo.gatePos.x, 0, geo.gatePos.z);
    grp.rotation.y = Math.atan2(geo.dir.x, geo.dir.z);
    const POST_X = 3.0, POST_H = 6.0, LINTEL_Y = 5.9;
    const faceY = grp.rotation.y;
    const perpX = geo.dir.z, perpZ = -geo.dir.x; // perpendicolare al varco (lato dei pali)
    const worldFlank = (s, dist) => ({ x: geo.gatePos.x + s * dist * perpX, z: geo.gatePos.z + s * dist * perpZ });
    // prop decorativo agganciato al gruppo del cancello (coord LOCALI, quota inclusa)
    const gateProp = (name, lx, ly, lz, ry = 0, s = 1) => {
      const def = Assets.props.get(name);
      if (!def) return null;
      const o = def.scene.clone();
      o.scale.setScalar(def.scale * s);
      o.position.set(lx, ly, lz);
      o.rotation.y = ry;
      o.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      grp.add(o);
      return o;
    };

    // pali-tronco robusti (con collider fisico ai due lati del varco)
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, POST_H, 8), barkMat);
      post.position.set(sx * POST_X, POST_H / 2, 0); post.castShadow = true; post.receiveShadow = true; grp.add(post);
      const wf = worldFlank(sx, POST_X);
      world.colliders.push({ x: wf.x, z: wf.z, r: 0.44 });
    }
    // trave superiore + mensola bassa d'aggancio
    const lintel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, POST_X * 2 + 1.4, 8), barkMat);
    lintel.rotation.z = Math.PI / 2; lintel.position.set(0, LINTEL_Y, 0); lintel.castShadow = true; grp.add(lintel);

    // due ANTE d'assi verticali con traverse (più grandi del vecchio cancello)
    const leaves = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (POST_X - 0.2), 0, 0);
      for (let i = 0; i < 7; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4 + (i % 2) * 0.3, 0.1), plankMat);
        plank.position.set(-sx * (0.3 + i * 0.4), 2.3, 0);
        plank.rotation.z = (Math.random() - 0.5) * 0.04;
        plank.castShadow = true;
        pivot.add(plank);
      }
      for (const hy of [1.0, 3.4]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.2, 0.07), plankMat);
        rib.position.set(-sx * 1.4, hy, 0.09);
        pivot.add(rib);
      }
      grp.add(pivot);
      leaves.push({ pivot, sx });
    }

    // ---- TEMATIZZAZIONE per destinazione ----
    if (z.id === 'crypt') {
      // CIMITERO: finali a punta in ferro sui pali, teschi sulla trave, lanterne fredde pendule, lapidi
      for (const sx of [-1, 1]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 6), ironMat);
        spike.position.set(sx * POST_X, POST_H + 0.48, 0); spike.castShadow = true; grp.add(spike);
      }
      gateProp('skull', -0.9, LINTEL_Y + 0.3, 0.1, 0.5, 1.1);
      gateProp('skull', 0.9, LINTEL_Y + 0.3, -0.1, -0.7, 1.1);
      for (const sx of [-1, 1]) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), ironMat);
        chain.position.set(sx * 1.8, LINTEL_Y - 0.35, 0.15); grp.add(chain);
        gateProp('lantern_standing', sx * 1.8, LINTEL_Y - 1.0, 0.15, 0, 0.7);
      }
      for (const sx of [-1, 1]) { const g = worldFlank(sx, POST_X + 1.4); placeGrave(g.x, g.z, faceY); }
    } else if (z.id === 'church') {
      // CAMPO BASE: checkpoint militare — filo spinato sulla trave, barriera a strisce, sacchi, jersey
      const wireMat = new THREE.MeshStandardMaterial({ color: 0x20242a, metalness: 0.7, roughness: 0.5 });
      const wireGeo = new THREE.TorusGeometry(0.46, 0.03, 5, 10);
      for (let i = -3; i <= 3; i++) {
        const loop = new THREE.Mesh(wireGeo, wireMat);
        loop.position.set(i * 0.62, POST_H + 0.12, 0);
        loop.rotation.set((Math.random() - 0.5) * 0.5, Math.PI / 2, 0);
        grp.add(loop);
      }
      // barriera a strisce di pericolo, mezza alzata (canvas diagonale gialla/nera)
      const scv = document.createElement('canvas'); scv.width = 128; scv.height = 16;
      const sg = scv.getContext('2d');
      sg.fillStyle = '#17171a'; sg.fillRect(0, 0, 128, 16);
      sg.fillStyle = '#d8b02a';
      for (let x = -16; x < 140; x += 24) { sg.beginPath(); sg.moveTo(x, 0); sg.lineTo(x + 12, 0); sg.lineTo(x + 12 - 16, 16); sg.lineTo(x - 16, 16); sg.fill(); }
      const stripeTex = new THREE.CanvasTexture(scv); stripeTex.colorSpace = THREE.SRGBColorSpace;
      stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(4, 1);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(POST_X * 2, 0.24, 0.14),
        new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.2 }));
      bar.position.set(0, 3.0, 0.28); bar.rotation.z = 0.12; bar.castShadow = true; grp.add(bar);
      for (const sx of [-1, 1]) { const s2 = worldFlank(sx, POST_X + 0.7); addProp('sandbags', s2.x, s2.z, faceY, { collider: 0.9 }); }
      const j = worldFlank(1, POST_X + 2.1); addProp('jersey', j.x, j.z, faceY + Math.PI / 2, { collider: 0.8, tint: 0x8f8f8f });
    } else {
      // PALUDE: liane e muschio penduli dalla trave, un cappio, teschio e costato, canne ai piedi
      const vineMat = new THREE.MeshStandardMaterial({ color: 0x3a4a28, roughness: 1 });
      for (let i = 0; i < 9; i++) {
        const len = 0.8 + Math.random() * 1.6;
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, len, 4), vineMat);
        v.position.set(-2.4 + i * 0.6, LINTEL_Y - len / 2, (Math.random() - 0.5) * 0.2); grp.add(v);
      }
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), vineMat);
      rope.position.set(0.6, LINTEL_Y - 0.7, 0.2); grp.add(rope);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12), vineMat);
      loop.position.set(0.6, LINTEL_Y - 1.5, 0.2); loop.rotation.x = Math.PI / 2; grp.add(loop);
      gateProp('skull', -0.8, LINTEL_Y + 0.28, 0, 0.4, 1.0);
      gateProp('ribcage', 1.1, LINTEL_Y + 0.22, 0, -0.5, 0.9);
      for (const sx of [-1, 1]) { const r = worldFlank(sx, POST_X + 0.8); plantTuft('reed', r.x, r.z); }
    }

    // cartello di quarantena: più grande, leggibile dall'approccio (fronte-hub, doppia faccia)
    const sign = makeSign(z.name, z.cost);
    sign.scale.setScalar(1.2);
    sign.rotation.y = Math.PI;
    sign.position.set(0, LINTEL_Y + 0.95, -0.15);
    sign.material.side = THREE.DoubleSide;
    grp.add(sign);
    // un solo lume statico, tinta della zona (creato al build, modulato d'intensità)
    const gl = new THREE.PointLight(z.lightColor || 0xffc090, 1.9, 12, 2);
    gl.position.set(0, 4.4, -1.2);
    grp.add(gl);
    world.lanterns.push({ light: gl, base: 1.9, seed: Math.random() * 100 });
    scene.add(grp);
    world.gates.push({ id: z.id, zone: z, leaves, sign, pos: geo.gatePos.clone(), cost: z.cost, name: z.name, sub: z.sub, unlocked: false, opening: false, openT: 0 });
  }

  for (const geo of ZGEOM) { buildZone(geo); buildGate(geo); }
  finalizePines(); // TUTTI i pini (hub + zone) in poche InstancedMesh
  finalizeTufts(); // tutto il sottobosco: UNA InstancedMesh per specie

  // ----- API stanze / porte / atmosfera -----

  world.confine = (pos, radius) => {
    let best = null, bestPush = Infinity;
    for (const room of world.rooms) {
      if (!room.active) continue;
      const dx = pos.x - room.cx, dz = pos.z - room.cz;
      const d = Math.hypot(dx, dz);
      const lim = room.r - radius;
      if (d <= lim) return;
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

  world.resetZones = () => {
    for (const room of world.rooms) if (room.id !== 'hub') room.active = false;
    for (const g of world.gates) {
      g.unlocked = false; g.opening = false; g.openT = 0;
      for (const lf of g.leaves) lf.pivot.rotation.y = 0;
    }
  };

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
  const HUB_FOG = new THREE.Color(0x0c1620), HUB_DENS = 0.027;
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
    _windT.value = t; // vento su chiome e sottobosco (uniform condivisa dai materiali)
    // animazione apertura cancelli
    for (const g of world.gates) {
      if (!g.opening) continue;
      g.openT = Math.min(1, g.openT + dt * 0.8);
      const e = 1 - Math.pow(1 - g.openT, 3);
      for (const lf of g.leaves) lf.pivot.rotation.y = lf.sx * 2.0 * e;
      if (g.openT >= 1) g.opening = false;
    }
    // lanterne (tremolio) e fuochi (fiamma che danza, più viva)
    for (const l of world.lanterns) {
      const s = l.seed;
      if (l.mode === 'fire') {
        const fk = 0.72 + 0.28 * Math.sin(t * 11 + s) * Math.sin(t * 23.7 + s * 2) + 0.1 * Math.sin(t * 47 + s);
        l.light.intensity = l.base * (0.62 + 0.5 * fk);
      } else {
        l.light.intensity = l.base * (0.78 + 0.22 * Math.sin(t * 9 + s) * Math.sin(t * 23.7 + s * 2) + 0.08 * Math.sin(t * 47 + s));
      }
    }
    // fiamme shader
    for (const f of world._flames) for (const s of f.mats) s.m.uniforms.uTime.value = t * s.tScale;
    // braci: salgono, derivano e svaniscono in loop
    for (const em of world._embers) {
      for (let i = 0; i < em.seeds.length; i++) {
        const cyc = ((t * 0.5 + em.seeds[i]) % 1.6) / 1.6;
        em.pos[i * 3] = em.x + Math.sin(t * 1.4 + em.seeds[i] * 7) * 0.16 * cyc;
        em.pos[i * 3 + 1] = 0.35 + cyc * 1.7 * em.scale;
        em.pos[i * 3 + 2] = em.z + Math.cos(t * 1.1 + em.seeds[i] * 5) * 0.16 * cyc;
      }
      em.pts.geometry.attributes.position.needsUpdate = true;
    }
    for (const m of world._mist) {
      m.mesh.position.x += Math.sin(t * 0.07 + m.seed) * m.speed * dt;
      m.mesh.position.z += Math.cos(t * 0.05 + m.seed * 1.3) * m.speed * dt;
      m.mat.uniforms.uOpacity.value = m.base * (0.72 + 0.28 * Math.sin(t * 0.3 + m.seed));
    }
    // acqua animata: le normali a doppio scorrimento sono guidate da uWaterT (shader), niente offset
    _waterT.value = t;
    // fuochi fatui: vagano lenti sull'acqua e "respirano" (si accendono e svaniscono)
    for (const w of world._wisps) {
      for (let i = 0; i < w.seeds.length; i++) {
        const s = w.seeds[i];
        w.pos[i * 3] = s.x + Math.sin(t * 0.22 + s.p) * 1.4;
        w.pos[i * 3 + 1] = s.y + Math.sin(t * 0.5 + s.p * 1.7) * 0.4 + 0.12 * Math.sin(t * 1.6 + s.p);
        w.pos[i * 3 + 2] = s.z + Math.cos(t * 0.19 + s.p * 1.2) * 1.4;
      }
      w.pts.geometry.attributes.position.needsUpdate = true;
      w.mat.opacity = 0.16 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.55 + w.phase));
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
      ff.pts.material.opacity = 0.45 + 0.3 * Math.sin(t * 2.2);
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

  // CO-OP: rimuove dalla scena tutto ciò che buildWorld ha aggiunto (per ricostruire il mondo del
  // client col seed dell'host). Cattura i riferimenti agli oggetti aggiunti (indipendente dagli
  // indici) → player/torcia/bossLight (aggiunti prima/dopo) sopravvivono.
  world._added = scene.children.slice(_sceneStart);
  world.dispose = () => { for (const o of world._added) scene.remove(o); };

  return world;
}
