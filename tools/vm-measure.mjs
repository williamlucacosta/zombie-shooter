// Riproduce OFFLINE la misura di player._mountViewmodel (posa idle, unione mesh arma,
// classificazione gunRe sui materiali, scala, auto-flip, bocca) senza aprire il gioco:
// serve a calibrare `length`/`gunRe`/`vmShift` di un nuovo viewmodel e a SCOVARE i modelli
// rotti dalla conversione glTF di Sketchfab (mesh in bind-pose esplosa → box a ±15000).
// Uso: node tools/vm-measure.mjs   (dalla root; nessun server necessario)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis; // GLTFLoader tocca `self` anche in Node

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

// [nome, file, gunRe, length, vmShift] — tenere allineato a MANIFEST.guns in src/assets.js
const GUNS = [
  ['pistol', 'public/assets/models/gun_pistol_xd.glb', /^material\b/i, 0.42, { x: -0.28, y: 0.07, z: 0.02 }],
  ['smg', 'public/assets/models/gun_smg_mpa.glb', /material_45\d/i, 0.66, { x: -0.26, y: -0.08, z: 0.12 }],
  ['magnum', 'public/assets/models/gun_magnum_revolver.glb', /revolver/i, 0.52, { x: -0.28, y: 0.06, z: 0.03 }],
  ['shotgun', 'public/assets/models/gun_shotgun_cransh.glb', /remington|12ge/i, 1.2, { y: -0.09 }],
];
const VM = { x: 0.2, y: -0.19, fwd: 0.5 }; // globali (player.VM); vmShift si somma

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [name, path, gunRe, length, shift] of GUNS) {
  const doc = await io.read(join(ROOT, path));
  for (const t of doc.getRoot().listTextures()) t.dispose();
  const bin = await io.writeBinary(doc);
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const model = gltf.scene;
  const clips = gltf.animations;
  const idle = clips.find((c) => /idle|watch/i.test(c.name)) || clips[0];
  const mixer = new THREE.AnimationMixer(model);
  const a = mixer.clipAction(idle); a.play();
  // per le timeline uniche l'idle sta in una finestra: campiona a metà del range plausibile
  mixer.update(0.3);
  model.updateMatrixWorld(true);
  const metas = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const box = new THREE.Box3();
    if (o.isSkinnedMesh) { o.computeBoundingBox(); box.copy(o.boundingBox); }
    else { o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox); }
    box.applyMatrix4(o.matrixWorld);
    metas.push({ o, box, sz: box.getSize(new THREE.Vector3()) });
  });
  const matName = (o) => {
    const m = o.material;
    return (Array.isArray(m) ? m.map((x) => x && x.name).join(' ') : (m && m.name) || '') + ' ' + o.name;
  };
  console.log(`\n=== ${name} (idle: ${idle && idle.name})`);
  const gunParts = metas.filter((m) => gunRe.test(matName(m.o)));
  const arms = metas.filter((m) => !gunParts.includes(m));
  const f = (n) => n.toFixed(3);
  for (const m of metas) {
    const tag = gunParts.includes(m) ? 'GUN' : 'ARM';
    const broken = m.sz.length() > 100 ? '  ⚠ ESPLOSA' : '';
    console.log(`  ${tag} "${matName(m.o)}" sz=(${f(m.sz.x)},${f(m.sz.y)},${f(m.sz.z)})${broken}`);
  }
  const gunBox = new THREE.Box3(); for (const m of gunParts) gunBox.union(m.box);
  const armsBox = new THREE.Box3(); for (const m of arms) armsBox.union(m.box);
  const gSz = gunBox.getSize(new THREE.Vector3());
  const gC = gunBox.getCenter(new THREE.Vector3());
  const scale = length / Math.max(gSz.z, 0.01);
  let front = gunParts[0];
  for (const m of gunParts) if (m.box.max.z > front.box.max.z) front = m;
  const barrelY = ((front.box.min.y + front.box.max.y) / 2 - gC.y) * scale; // linea canna vs centro (mondo)
  // inquadratura: centro arma a (VM+shift); coordinate rilevanti relative alla camera
  const px = VM.x + (shift.x || 0), py = VM.y + (shift.y || 0), pz = VM.fwd + (shift.z || 0);
  console.log(`  scala=${f(scale)} (arma ${f(gSz.z)} u -> ${length} m; alta ${f(gSz.y * scale)} m)`);
  console.log(`  centro arma: x=${f(px)} (x+ = sinistra schermo) y=${f(py)} fwd=${f(pz)}`);
  console.log(`  linea canna: y=${f(py + barrelY)} (angolo sotto il centro: ${(Math.atan2(-(py + barrelY), pz) * 180 / Math.PI).toFixed(1)}°)`);
  if (arms.length) {
    const armsBackZ = (armsBox.min.z - gC.z) * scale; // gomiti dietro il centro arma (mondo)
    console.log(`  gomiti: ${f(pz + armsBackZ)} davanti alla camera (near plane 0.08; <0 = DENTRO la camera)`);
  }
  console.log(`  fronte arma (bocca): ${f(pz + (gunBox.max.z - gC.z) * scale)} davanti alla camera`);
}
