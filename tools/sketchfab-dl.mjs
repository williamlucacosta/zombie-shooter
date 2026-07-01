// Scarica modelli dalla Download API ufficiale di Sketchfab (GLB autoconvertito, texture incluse).
// Uso:  node tools/sketchfab-dl.mjs <API_TOKEN>
// Token revocabile da sketchfab.com/settings/password — NON è la password.
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('manca il token'); process.exit(1); }

// { name, uid }  — name = file di destinazione in public/assets/models/sf/
// La Download API restituisce uno ZIP gltf (scene.gltf+bin+textures): va estratto e
// impacchettato in .glb (vedi tools/sf-shotgun-pack.mjs).
const MODELS = [
  // --- FUCILE A POMPA: viewmodel FPS animato (braccia+mani+arma, ricarica a colpo singolo) ---
  // "FPS Arms remington (shotgun)" di Cransh (CC-BY): è quello effettivamente usato nel gioco.
  { name: 'sg_cransh_remington', uid: 'e68ef617fe8a48cca8610d016ffd5881' }, // by "Cransh"
  // --- MITRA: "SMG FPS Animations" di Cransh (CC-BY), MPA 30 SST, 8 clip ---
  { name: 'smg_cransh_mpa', uid: 'ca37ea9148dc4fcc9cc632175d311b23' },
  // --- PISTOLA: "FPS pistol animations" di Cransh (CC-BY), Springfield XD, 5 clip ---
  // (la Makarov d02ebd58… e il Deagle 1Matzh 09a213d8… sono SCARTATI: la conversione
  //  glTF di Sketchfab ha le ossa di braccia/arma in bind-pose esplosa in ogni clip)
  { name: 'pistol_cransh_xd', uid: '0d7a343dcb6f401197a73c91aee93f6d' },
  // --- MAGNUM: "revolver animated" di bumstrum/DJMaesen (CC-BY), timeline unica ---
  { name: 'magnum_bum_revolver', uid: 'a34b6d0ddc774744bc3567d6afc0878f' },
  // riserva pistola: "heavy pistol animated" di bumstrum (CC-BY), timeline unica
  { name: 'pistol_bum_heavy', uid: 'b7c78c533ced40cd986c44594b778ed6' },
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
