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
  // --- CITTÀ ABBANDONATA (tutti CC-BY, statici) ---
  { name: 'car_police', uid: 'ad16f7085cb047b494997cf9efed5059' },   // Free Burned Police Cars (kryik1023)
  { name: 'car_crashed', uid: '66ef51a84c9843dda53bf0b4b9020011' },  // Crashed Abandoned Car (rashad-brahimli)
  { name: 'car_sedan', uid: '6a2169dafc254f399387a679305bb1bf' },    // Abandoned Generic Sedan 1 (rashad-brahimli)
  { name: 'car_bmw', uid: '32498418a32d43a78d0847ce4c55fcb0' },      // Abandoned BMW E30 (roh3d)
  { name: 'car_hudson', uid: '3a15481d9da9486a8f8e3b5165b66e2d' },   // Abandoned Hudson Hornet (roh3d)
  { name: 'bus_destroyed', uid: 'fdf39ca893a64368af45f82a6b6d68a4' },// destroyed Bus 01 (dadndan0091)
  { name: 'prop_streetlight', uid: 'd75f8d8a26054e3584f55eb07644801a' }, // Rusty Streetlight (barbodoji)
  { name: 'prop_dumpster', uid: '989ea7f01b924859b3484ee27103e8d9' },    // dumpster (YJ_)
  { name: 'prop_jersey', uid: 'b52246c9611a42a99a03b425535a0237' },      // Jersey Barrier (emran.bayati)
  // --- vestizione premium (tutti CC-BY): rovine, elicottero, checkpoint militare ---
  { name: 'ruin_pack', uid: '690edb7d64b84df7bfeee3b54746d6eb' },   // Ruined buildings pack (tobiasherbers2)
  { name: 'ruin_city', uid: '0d32be87779243749417ec783fb3ef60' },   // City Ruins Environment (falk)
  { name: 'heli_crashed', uid: '0f801510406c452686d0f550add826cd' },// New, Old, Crashed Helicopter (Vasyukov_S)
  { name: 'prop_sandbags', uid: '18d348bd76004edd9a1c39155970382d' }, // Barricade Sandbags LOD0 (fertator99)
  { name: 'prop_watchtower', uid: 'd5ee8a573a474830b5d7ee9b3baa844d' },// Watch Tower (edminchi)
  { name: 'prop_debris', uid: '194bec2429da4b74b3926ac981616da8' },  // Pile of Concrete Debris scan (albentan2012)
  { name: 'truck_m725', uid: 'fbeafdb305114e4eb331d1b69d5fe094' },   // M725 Military Ambulance (kryik1023)
  // --- mappa FORESTA (tutti CC-BY) ---
  { name: 'pines_scots', uid: '422b961ff3d14e7baa7e9077572b2247' },  // Scots Pine Trees Set (c3posw01)
  { name: 'cabin_wood', uid: 'c90674a377864ac1b8fd141ad1917ee3' },   // Wooden Cabin (donnichols)
  { name: 'shed_old', uid: '761c0879b18041e1a42bc10de88d2228' },     // Old Wooden Shed (donnichols)
  // --- ORDA REALISTICA COERENTE dalla libreria di temptecn/DanteGuy (tutti CC-BY, low-poly
  //     game-ready, molte animazioni, stile horror uniforme) ---
  { name: 'zombie_slow1', uid: '815a957192254a64abdd7378a3624de2' },   // walker: infetto classico (11 anim)
  { name: 'zombie_putrid', uid: '7b6d264e523c42ac8f7690668eaeeade' },  // runner: emaciato scheletrico (15 anim)
  { name: 'zombie_crawler', uid: '16e3ec0cf0cd4f0db19dc238eec73ed7' },// strisciante: mezzo busto (5 anim)
  { name: 'zombie_chainsaw', uid: 'd7e44e442d65487f96a343a2bd2e442c' },// brute: bestione con motosega (10 anim)
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
