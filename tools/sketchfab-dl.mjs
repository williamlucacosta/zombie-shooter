// Scarica modelli dalla Download API ufficiale di Sketchfab (GLB autoconvertito, texture incluse).
// Uso:  node tools/sketchfab-dl.mjs <API_TOKEN>
// Token revocabile da sketchfab.com/settings/password — NON è la password.
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('manca il token'); process.exit(1); }

// { name, uid }  — name = file di destinazione in public/assets/models/sf/
const MODELS = [
  // cani / creature per il crawler+hound
  { name: 'wolf_3dhaupt', uid: 'f3769a474a714ebbbaca0d97f9b0a5a0' },
  { name: 'quirky_animals', uid: '19e91ef86cd0448f9cbb5d6c538dade2' },
  // fucili a pompa realistici
  { name: 'shotgun_opposite', uid: '71d8d3406932463295434ab274c8f4ee' },
  { name: 'shotgun_classic', uid: 'defe928d8f9747fe912794b8ee3e8aa7' },
  { name: 'shotgun_gameready', uid: '86a738c74f694d77813cd67b3ecdb6d3' },
  // mani / braccia FPS realistiche
  { name: 'fps_arms_djmaesen', uid: 'e3c42c05b22944e5839deb8e003f0987' },
  { name: 'fps_hands_cransh', uid: '5f2d0ed780a94724b36ab505f7564057' },
  { name: 'fps_hands_fischer', uid: '547a45535f0c4fe787948f7a7a6a88db' },
];
const OUT = 'public/assets/models/sf';

async function dl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

for (const m of MODELS) {
  try {
    const r = await fetch(`https://api.sketchfab.com/v3/models/${m.uid}/download`, {
      headers: { Authorization: 'Token ' + TOKEN },
    });
    if (!r.ok) { console.log(`FAIL ${m.name}: API ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
    const j = await r.json();
    const pick = j.glb || j.gltf; // preferisci il GLB monofile
    if (!pick?.url) { console.log(`FAIL ${m.name}: nessun glb/gltf`); continue; }
    const ext = j.glb ? 'glb' : 'zip';
    const size = await dl(pick.url, join(OUT, `${m.name}.${ext}`));
    console.log(`OK ${m.name}.${ext}  ${(size / 1048576).toFixed(1)} MB`);
  } catch (e) { console.log(`FAIL ${m.name}: ${e.message}`); }
}
console.log('done');
