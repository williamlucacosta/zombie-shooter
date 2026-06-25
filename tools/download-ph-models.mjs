// Scarica modelli CC0 da PolyHaven (glTF 1k: .gltf + .bin + texture diff/nor/arm) in
// public/assets/models/ph/<id>/. Riutilizzabile: aggiungi gli id e rilancia.
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const IDS = [
  'dead_tree_trunk', 'dead_tree_trunk_02', 'tree_stump_01',
  'boulder_01', 'rock_07', 'rock_moss_set_01',
  'wooden_lantern_01', 'marble_bust_01',
];
const RES = '1k';
const OUTROOT = 'public/assets/models/ph';

async function dl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

for (const id of IDS) {
  try {
    const f = await (await fetch('https://api.polyhaven.com/files/' + id)).json();
    const g = f.gltf?.[RES]?.gltf;
    if (!g) { console.log('NO gltf', id); continue; }
    const baseDir = join(OUTROOT, id);
    const gltfName = g.url.split('/').pop();
    let total = await dl(g.url, join(baseDir, gltfName));
    let files = 1;
    for (const [rel, info] of Object.entries(g.include || {})) {
      total += await dl(info.url, join(baseDir, rel));
      files++;
    }
    console.log(`OK ${id} -> ${gltfName} (${files} file, ${(total / 1024 | 0)} KB)`);
  } catch (e) {
    console.log('FAIL', id, e.message);
  }
}
console.log('done');
