// Genera public/assets/audio/headshot.ogg: un colpo alla TESTA distinto dall'impatto normale
// (zombie_hit). Layer di sorgenti CC0: crack "bagnato" del cranio (extreme splatter) + snap osseo
// secco (37 hits), con un boost sulle alte per il "pop" e coda cortissima. Mono OGG.
// Uso: node tools/make-headshot.mjs   (serve ffmpeg in C:\program files\ffmpeg\bin)
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', '_audiosrc', 'impacts');
const OUT = join(ROOT, 'public', 'assets', 'audio', 'headshot.ogg');
const FF = 'C:\\program files\\ffmpeg\\bin\\ffmpeg.exe';

const crack = join(SRC, 'splatter', 'extreme_splatter', 'crack11.mp3.flac'); // cranio bagnato
const snap = join(SRC, '37hits', 'hits', 'hit25.mp3.flac');                    // snap osseo secco

// crack: highpass leggero + boost 3-5 kHz (secchezza) ; snap: transiente iniziale ; amix,
// loudnorm per un livello costante, trim a 0.5 s, mono a 44.1k.
execFileSync(FF, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', crack, '-i', snap,
  '-filter_complex',
  '[0:a]highpass=f=180,treble=g=6:f=3800,volume=1.25[c];' +
  '[1:a]atrim=0:0.18,highpass=f=400,volume=0.9[s];' +
  '[c][s]amix=inputs=2:duration=longest:normalize=0,' +
  'atrim=0:0.5,loudnorm=I=-13:TP=-1.2,aformat=channel_layouts=mono:sample_rates=44100[out]',
  '-map', '[out]', OUT,
]);
console.log('OK', OUT);
