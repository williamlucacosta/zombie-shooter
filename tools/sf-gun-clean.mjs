// Porta i viewmodel FPS scaricati da Sketchfab (public/assets/models/sf/) a file di gioco
// (public/assets/models/gun_*.glb): scarta le mesh estranee alla scena (skybox cotto, pannelli
// di mira "Aim" del Desert Eagle) e fa prune di nodi/materiali/texture rimasti orfani.
// Dopo questo passo va lanciato `node tools/compress-assets.mjs gun_` per il webp @1024.
// Uso: node tools/sf-gun-clean.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'public', 'assets', 'models');

// drop: mesh/nodi da eliminare (regex sul nome). Il Deagle di 1Matzh include uno skybox
// cotto e due quad "Aim"/"AimBottom" (allineamento del mirino in Blender): via tutti.
const GUNS = [
  // (il Makarov di Cransh e il Deagle di 1Matzh sono stati SCARTATI: nella conversione glTF
  //  di Sketchfab braccia/arma restano in bind-pose esplosa in ogni clip — verificare i nuovi
  //  candidati con tools/vm-measure.mjs PRIMA di integrarli)
  { src: 'sf/pistol_cransh_xd.glb', dst: 'gun_pistol_xd.glb', drop: null },
  { src: 'sf/smg_cransh_mpa.glb', dst: 'gun_smg_mpa.glb', drop: null },
  { src: 'sf/magnum_bum_revolver.glb', dst: 'gun_magnum_revolver.glb', drop: null },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const g of GUNS) {
  const doc = await io.read(join(MODELS, g.src));
  const root = doc.getRoot();
  let dropped = 0;
  if (g.drop) {
    for (const node of root.listNodes()) {
      if (g.drop.test(node.getName())) { node.dispose(); dropped++; }
    }
    for (const mesh of root.listMeshes()) {
      if (g.drop.test(mesh.getName())) { mesh.dispose(); dropped++; }
    }
  }
  await doc.transform(prune());
  await io.write(join(MODELS, g.dst), doc);
  const anims = root.listAnimations().map((a) => a.getName()).join(', ');
  console.log(`OK ${g.dst}  (drop:${dropped})  clip: ${anims}`);
}
console.log('done');
