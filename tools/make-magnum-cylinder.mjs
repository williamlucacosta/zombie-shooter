// Costruisce i suoni della RICARICA DEL REVOLVER da registrazioni REALI CC0 (BigSoundBank,
// Joseph Sardin — pubblico dominio), già scaricate in tools/_audiosrc/guns/:
//   • magnum_open.ogg      — sgancio/apertura del tamburo (movimento meccanico da #1990).
//   • magnum_insert_1/2.ogg — click del SINGOLO proiettile che entra in camera: click metallico
//                             reale (#1989/#1991) accorciato e alzato di tono (~+20%), da cartuccia
//                             piccola. Suonano ai tempi di config.WEAPONS.magnum.reloadEvents.
//   • magnum_close.ogg     — CHIUSURA del tamburo: doppio clack secco (bsb_arm1) con corpo grave
//                             rinforzato → lo scatto solido del cilindro che rientra nel telaio.
// Uso: node tools/make-magnum-cylinder.mjs   (richiede i sorgenti già in tools/_audiosrc/guns/)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', '_audiosrc', 'guns');
const OUT = join(ROOT, 'public', 'assets', 'audio');
const FF = 'C:\\program files\\ffmpeg\\bin\\ffmpeg.exe';
const TMP = join(OUT, '_mg_tmp.wav');

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

// click del proiettile in camera: trim del transiente, pitch su (~cartuccia piccola), coda corta
function insert(out, src, a, b, rate) {
  if (!need(src)) return;
  build(out, I(src),
    `[0:a]atrim=${a}:${b},asetpts=PTS-STARTPTS,asetrate=44100*${rate},aresample=44100,` +
      `highpass=f=220,lowpass=f=7500,equalizer=f=420:width_type=o:width=1.4:g=2.5,` +
      `afade=t=in:d=0.002,afade=t=out:st=0.07:d=0.05,` +
      `acompressor=threshold=-15dB:ratio=3:attack=1:release=40,alimiter=limit=0.96`,
    -2.5);
}
insert('magnum_insert_1.ogg', 'bsb_charg1.ogg', 0.32, 0.44, 1.22);
insert('magnum_insert_2.ogg', 'bsb_charg3.ogg', 0.365, 0.50, 1.18);

// apertura del tamburo: pressione della leva + oscillazione fuori (movimento più "morbido")
if (need('bsb_charg2.ogg')) {
  build('magnum_open.ogg', I('bsb_charg2.ogg'),
    '[0:a]atrim=0.19:0.42,asetpts=PTS-STARTPTS,highpass=f=150,lowpass=f=6000,' +
      'afade=t=in:d=0.003,afade=t=out:st=0.16:d=0.07,' +
      'acompressor=threshold=-16dB:ratio=2.5:attack=1:release=60,alimiter=limit=0.95',
    -4.0);
}

// chiusura del tamburo: doppio clack secco + corpo grave (il cilindro sbatte nel telaio)
if (need('bsb_arm1.ogg')) {
  build('magnum_close.ogg', I('bsb_arm1.ogg'),
    '[0:a]atrim=0.04:0.30,asetpts=PTS-STARTPTS,highpass=f=110,lowpass=f=7000,' +
      'equalizer=f=240:width_type=o:width=1.6:g=4,' +
      'afade=t=in:d=0.002,afade=t=out:st=0.18:d=0.08,' +
      'acompressor=threshold=-14dB:ratio=3:attack=1:release=50,alimiter=limit=0.96',
    -1.5);
}

try { rmSync(TMP); } catch {}
console.log('fatto.');
