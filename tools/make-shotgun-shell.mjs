// Costruisce i suoni del FUCILE A POMPA da registrazioni REALI CC0 (BigSoundBank, Joseph Sardin —
// pubblico dominio), scaricate in tools/_audiosrc/guns/:
//   • shot_shotgun.ogg      — UN singolo sparo estratto da "Shotgun: Shots" (#0532, tiro al piattello),
//                             con punch sui bassi + presenza sul crack, compresso/limitato.
//   • shotgun_insert_1/2.ogg — inserimento del bossolo: click metallico REALE di caricamento arma
//                             (#1989/#1990 "pistolet, chargement") rifinito e con un filo di corpo
//                             grave, così suona come un bossolo che si assesta nel tubo. 2 varianti.
// (Su BigSoundBank non esiste un caricamento specifico per fucile a pompa: uso il caricamento reale
//  di un'arma, rimodellato — è un vero suono meccanico, non più sintetizzato.)
// Uso: node tools/make-shotgun-shell.mjs   (richiede i sorgenti già in tools/_audiosrc/guns/)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', '_audiosrc', 'guns');
const OUT = join(ROOT, 'public', 'assets', 'audio');
const FF = 'C:\\program files\\ffmpeg\\bin\\ffmpeg.exe';
const TMP = join(OUT, '_sg_tmp.wav');

function ff(args) { execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args]); }
function maxVol(file) {
  const r = spawnSync(FF, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stderr.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1];
  return m ? parseFloat(m) : 0;
}
function build(out, inputs, fc, targetDb) {
  ff([...inputs, '-filter_complex', fc, '-ac', '1', '-ar', '44100', TMP]);
  const gain = (targetDb - maxVol(TMP)).toFixed(2);
  ff(['-i', TMP, '-af', `volume=${gain}dB`, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '5', join(OUT, out)]);
  console.log(`  ✓ ${out}  (gain ${gain} dB)`);
}
const I = (p) => ['-i', join(SRC, p)];
const need = (p) => { if (!existsSync(join(SRC, p))) { console.log(`  ⚠ manca ${p}`); return false; } return true; };

// --- SPARO: 3 registrazioni REALI scelte dall'utente (sparo + "pompa" del sottocanna nella coda),
//     i segmenti 2/3/4 di una stessa sessione → 3 VARIAZIONI casuali (shot_shotgun.ogg, _2, _3).
//     Lavorazione minima e fedele: taglio del SILENZIO INIZIALE (lo sparo parte subito, sennò sembra
//     in ritardo), micro fade-in anti-click, normalizzazione del picco a -0.8 dB così le 3 variazioni
//     hanno lo stesso volume. La coda con la pompa resta intatta. Sorgenti in _audiosrc/guns/. ---
const SHOTS = [
  { out: 'shot_shotgun.ogg', src: 'shot_seg2.mp3', start: 0.142 }, // sparo a ~0.157s
  { out: 'shot_shotgun_2.ogg', src: 'shot_seg3.mp3', start: 0.142 }, // sparo a ~0.157s
  { out: 'shot_shotgun_3.ogg', src: 'shot_seg4.mp3', start: 0.246 }, // sparo a ~0.261s
];
for (const s of SHOTS) {
  if (!need(s.src)) continue;
  build(s.out, I(s.src),
    `[0:a]aformat=channel_layouts=mono,atrim=${s.start},asetpts=PTS-STARTPTS,afade=t=in:d=0.004`,
    -0.8);
}

// --- INSERIMENTO BOSSOLO: click metallico reale + filo di corpo grave (2 varianti) ---
function insert(out, src, a, b) {
  if (!need(src)) return;
  build(out, I(src),
    `[0:a]atrim=${a}:${b},asetpts=PTS-STARTPTS,highpass=f=130,lowpass=f=6800,` +
      `equalizer=f=300:width_type=o:width=1.6:g=3,` +
      `afade=t=in:d=0.002,afade=t=out:st=0.1:d=0.06,` +
      `acompressor=threshold=-16dB:ratio=3:attack=1:release=50,alimiter=limit=0.96`,
    -2.0);
}
insert('shotgun_insert_1.ogg', 'bsb_charg3.ogg', 0.355, 0.52); // click singolo netto
insert('shotgun_insert_2.ogg', 'bsb_charg2.ogg', 0.30, 0.46);  // assestamento

try { rmSync(TMP); } catch {}
console.log('fatto.');
