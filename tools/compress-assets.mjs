// Compressione asset per un caricamento molto più rapido.
//   • Modelli  (GLB/GLTF): geometria -> EXT_meshopt_compression, texture -> WebP @1024.
//                          (niente simplify/join/flatten: il rig e le animazioni restano intatti).
//   • Texture PBR standalone (.jpg dei terreni/muri): -> WebP @1024 q85 (stessa risoluzione).
//
// Gli originali finiscono in public/assets/_orig/ (gitignorato): il tool legge SEMPRE
// da lì come sorgente, quindi è ri-eseguibile senza degrado progressivo.
//
// Uso (dalla root, dev server NON necessario):
//   node tools/compress-assets.mjs            # modelli + texture
//   node tools/compress-assets.mjs --models   # solo modelli
//   node tools/compress-assets.mjs --textures # solo texture
//   node tools/compress-assets.mjs aiden      # solo i modelli il cui path contiene "aiden"

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, cpSync, statSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'public', 'assets');
const ORIG = join(ASSETS, '_orig');
const CLI = join(ROOT, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');
const FFMPEG = 'C:\\program files\\ffmpeg\\bin\\ffmpeg.exe';

// path relativi a public/assets/. dst (se presente) cambia estensione .gltf->.glb.
const MODELS = [
  { src: 'models/player_soldier.glb' },
  { src: 'models/zombie_hazmat.glb' },
  { src: 'models/sf/zombie_aiden.glb' },
  { src: 'models/sf/zombie_larnox.glb' },
  { src: 'models/sf/wolf_3dhaupt.glb' },
  { src: 'models/zombie_a.glb' },
  { src: 'models/zombie_b.glb' },
  { src: 'models/zombie_c.glb' },
  { src: 'models/zombie_d.glb' },
  { src: 'models/dog.glb' },
  { src: 'models/skeleton_a.glb' },
  { src: 'models/skeleton_b.glb' },
  { src: 'models/skeleton_c.glb' },
  // ARMI = viewmodel FPS skinnati con bind-pose "esplosa" (coordinate enormi, la posa vera la
  // dà l'idle): la quantizzazione meshopt perderebbe precisione sulla bind-pose -> solo texture
  // webp, geometria intatta. I file di gioco nascono da tools/sf-gun-clean.mjs (sorgenti grezze
  // scaricate da Sketchfab in models/sf/ con tools/sketchfab-dl.mjs).
  { src: 'models/gun_shotgun_cransh.glb', noQuant: true },
  { src: 'models/gun_pistol_xd.glb', noQuant: true },
  { src: 'models/gun_smg_mpa.glb', noQuant: true },
  { src: 'models/gun_magnum_revolver.glb', noQuant: true },
  // .gltf+.bin+texture esterne -> un singolo .glb autosufficiente (cambia l'URL nel manifest)
  { src: 'models/mutant/a.gltf', dst: 'models/mutant/a.glb' },
  { src: 'models/ph/boulder_01/boulder_01_1k.gltf', dst: 'models/ph/boulder_01/boulder_01_1k.glb' },
  { src: 'models/ph/dead_tree_trunk/dead_tree_trunk_1k.gltf', dst: 'models/ph/dead_tree_trunk/dead_tree_trunk_1k.glb' },
  { src: 'models/ph/dead_tree_trunk_02/dead_tree_trunk_02_1k.gltf', dst: 'models/ph/dead_tree_trunk_02/dead_tree_trunk_02_1k.glb' },
  { src: 'models/ph/rock_moss_set_01/rock_moss_set_01_1k.gltf', dst: 'models/ph/rock_moss_set_01/rock_moss_set_01_1k.glb' },
  { src: 'models/ph/tree_stump_01/tree_stump_01_1k.gltf', dst: 'models/ph/tree_stump_01/tree_stump_01_1k.glb' },
  { src: 'models/ph/rock_07/rock_07_1k.gltf', dst: 'models/ph/rock_07/rock_07_1k.glb' },
  { src: 'models/ph/marble_bust_01/marble_bust_01_1k.gltf', dst: 'models/ph/marble_bust_01/marble_bust_01_1k.glb' },
  { src: 'models/ph/wooden_lantern_01/wooden_lantern_01_1k.gltf', dst: 'models/ph/wooden_lantern_01/wooden_lantern_01_1k.glb' },
];

// set PBR standalone (.jpg) usati dai terreni/muri delle zone -> .webp stessa risoluzione.
const TEX_BASES = [
  'ph_forrest_ground_01', 'ph_cobblestone_floor_08', 'ph_rock_wall_10', 'ph_weathered_planks',
];
const TEX_SUFFIXES = ['diff', 'nor_gl', 'rough'];
const TEX_SINGLE = ['ground']; // ground.jpg dell'hub

const KB = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
const ensure = (p) => { if (!existsSync(p)) mkdirSync(p, { recursive: true }); };
const sleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

// Su Windows l'antivirus (Defender) tiene aperto per qualche centinaio di ms il file appena
// scritto: il rename può fallire con EPERM. Riprova con backoff finché la scansione finisce.
function renameRetry(from, to, tries = 12) {
  for (let i = 0; i < tries; i++) {
    try { renameSync(from, to); return; }
    catch (e) { if (i === tries - 1) throw e; sleep(300); }
  }
}

/** Ritorna il path sorgente da usare (backup originale), creandolo al primo giro. */
function backedSource(rel) {
  const live = join(ASSETS, rel);
  const bak = join(ORIG, rel);
  if (existsSync(bak)) return bak; // già salvato: usa l'originale pristino
  if (!existsSync(live)) return null;
  ensure(dirname(bak));
  // per i .gltf serve l'intera cartella, RICORSIVA (bin + texture esterne in textures/)
  if (rel.endsWith('.gltf')) {
    cpSync(dirname(live), dirname(bak), { recursive: true });
  } else {
    copyFileSync(live, bak);
  }
  return bak;
}

function gltf(args) {
  execFileSync(process.execPath, [CLI, ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

function compressModels(filter) {
  let before = 0, after = 0, n = 0;
  for (const m of MODELS) {
    if (filter && !m.src.includes(filter)) continue;
    const src = backedSource(m.src);
    if (!src) { console.log(`  ⚠ manca ${m.src}`); continue; }
    const outRel = m.dst || m.src;
    const out = join(ASSETS, outRel);
    const tmp = out + '.tmp.glb';
    const inBytes = statSync(src).size;
    try {
      gltf(['optimize', src, tmp,
        '--compress', m.noQuant ? 'false' : 'meshopt', // noQuant: niente quantizzazione (preserva la bind-pose)
        '--texture-compress', 'webp',
        '--texture-size', '1024',
        '--simplify', 'false', '--join', 'false', '--flatten', 'false',
        '--instance', 'false', '--palette', 'false']);
      renameRetry(tmp, out);
      const outBytes = statSync(out).size;
      before += inBytes; after += outBytes; n++;
      console.log(`  ${basename(outRel).padEnd(28)} ${KB(inBytes)} -> ${KB(outBytes)}  (${(100 - outBytes / inBytes * 100).toFixed(0)}%)`);
    } catch (e) {
      try { if (existsSync(tmp)) rmSync(tmp); } catch {}
      console.log(`  ✖ ${m.src}: ${e.message.split('\n')[0]}`);
    }
  }
  if (n) console.log(`\n  MODELLI: ${KB(before)} -> ${KB(after)}  (-${(100 - after / before * 100).toFixed(0)}%, ${n} file)\n`);
}

function ffwebp(srcJpg, outWebp) {
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', srcJpg, '-c:v', 'libwebp', '-quality', '85', outWebp]);
}

function compressTextures() {
  const dir = join(ASSETS, 'textures');
  let before = 0, after = 0, n = 0;
  const files = [];
  for (const b of TEX_BASES) for (const s of TEX_SUFFIXES) files.push(`${b}_${s}`);
  for (const s of TEX_SINGLE) files.push(s);
  for (const name of files) {
    const rel = `textures/${name}.jpg`;
    const src = backedSource(rel);
    if (!src) { console.log(`  ⚠ manca ${rel}`); continue; }
    const out = join(dir, `${name}.webp`);
    const inBytes = statSync(src).size;
    try {
      ffwebp(src, out);
      const outBytes = statSync(out).size;
      before += inBytes; after += outBytes; n++;
      console.log(`  ${(name + '.webp').padEnd(34)} ${KB(inBytes)} -> ${KB(outBytes)}`);
    } catch (e) {
      console.log(`  ✖ ${rel}: ${e.message.split('\n')[0]}`);
    }
  }
  if (n) console.log(`\n  TEXTURE: ${KB(before)} -> ${KB(after)}  (-${(100 - after / before * 100).toFixed(0)}%, ${n} file)\n`);
}

// ------------------------------------------------------------------- main --
const arg = process.argv[2];
ensure(ORIG);
if (arg === '--textures') {
  compressTextures();
} else if (arg === '--models') {
  compressModels(null);
} else if (arg && !arg.startsWith('--')) {
  compressModels(arg); // filtro per nome
} else {
  console.log('\n== MODELLI ==');
  compressModels(null);
  console.log('== TEXTURE ==');
  compressTextures();
}
