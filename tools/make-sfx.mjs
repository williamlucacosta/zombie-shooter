// Genera SFX da sorgenti CC0 reali (tools/_audiosrc/) con normalizzazione di PICCO (loud e coerente):
//   • zombie_hit  — proiettile sulla carne: schizzo carnoso REALE + tonfo (corpo di un pugno reale,
//                   filtrato a passa-basso) — niente sintesi. 3 varianti.
//   • wave_start / wave_clear — stings musicali (braam apocalittico / alba che si risolve).
//   • cand_* — alternative auditionabili da /audios per SCEGLIERE (inizio: evil_open/evil_hit;
//              fine: hope/bell). Una volta scelte, si promuovono a wave_start/clear e si tolgono.
// Uso: node tools/make-sfx.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', '_audiosrc');
const IMP = join(SRC, 'impacts');
const STG = join(SRC, 'stings');
const OUT = join(ROOT, 'public', 'assets', 'audio');
const FF = 'C:\\program files\\ffmpeg\\bin\\ffmpeg.exe';
const TMP = join(OUT, '_tmp.wav');

function ff(args) { execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args]); }
function maxVol(file) {
  const r = spawnSync(FF, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stderr.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1];
  return m ? parseFloat(m) : 0;
}
// rende il filtergraph su WAV, misura il picco, ri-codifica in OGG col guadagno per arrivare a target dB
function build(out, inputs, fc, targetDb = -1) {
  ff([...inputs, '-filter_complex', fc, '-ac', '1', TMP]);
  const gain = (targetDb - maxVol(TMP)).toFixed(2);
  ff(['-i', TMP, '-af', `volume=${gain}dB`, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '5', join(OUT, out)]);
  console.log(`  ✓ ${out}  (gain ${gain} dB)`);
}
const I = (p) => ['-i', p];

// ---- impatto proiettile-carne: schizzo reale + tonfo (corpo di un pugno reale, passa-basso) ----
// [0]=schizzo carnoso (umido, presenza), [1]=pugno reale -> tengo solo il corpo grave (tonfo)
// in gioco `zombie_hit` alterna a caso splat.ogg e zombie_hit_1.ogg (vedi AUDIO_MANIFEST)
const HIT = [
  { out: 'zombie_hit_1.ogg', wet: 'various_snd_splathit.wav', body: '37hits/hits/hit12.mp3.flac', len: 0.34, pres: 3.0 },
];
function makeHit(v) {
  const wet = join(IMP, v.wet), body = join(IMP, v.body);
  if (!existsSync(wet) || !existsSync(body)) { console.log(`  ⚠ manca sorgente per ${v.out}`); return; }
  const fc =
    `[0:a]aformat=channel_layouts=mono,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0,` +
      `atrim=0:${v.len},asetpts=PTS-STARTPTS,highpass=f=70,lowpass=f=7000,` +
      `equalizer=f=2600:width_type=o:width=1.2:g=${v.pres},afade=t=out:st=${(v.len - 0.1).toFixed(2)}:d=0.1[meat];` +
    `[1:a]aformat=channel_layouts=mono,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0,` +
      `atrim=0:0.12,asetpts=PTS-STARTPTS,lowpass=f=1600,afade=t=out:st=0.04:d=0.08,volume=0.85[thump];` +
    `[meat][thump]amix=inputs=2:duration=longest:normalize=0,acompressor=threshold=-16dB:ratio=3:attack=2:release=80,alimiter=limit=0.98`;
  build(v.out, [...I(wet), ...I(body)], fc);
}

// ---- suoni ondata: stings musicali, tagliati e dissolti ----
function makeSting(out, src, { start = 0, len = 2.4, fadeIn = 0.01, fadeOut = 0.7 } = {}) {
  const p = join(STG, src);
  if (!existsSync(p)) { console.log(`  ⚠ manca ${src}`); return; }
  const fc = `[0:a]aformat=channel_layouts=mono,atrim=${start}:${start + len},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${(len - fadeOut).toFixed(2)}:d=${fadeOut}`;
  build(out, I(p), fc);
}

console.log('IMPATTO carne (3 varianti reali):');
for (const v of HIT) makeHit(v);

console.log('ONDATA — scelte attuali:');
makeSting('wave_start.ogg', 'fs_856173_braam_apocalyptic.mp3', { len: 2.6, fadeOut: 0.8 }); // braam apocalittico
makeSting('wave_clear.ogg', '_preview_newsunrise_resolve.wav', { len: 2.5, fadeOut: 0.7 }); // alba / risoluzione

console.log('ONDATA — alternative da provare su /audios:');
makeSting('cand_start_evilopen.ogg', '_preview_evil_open.wav', { len: 2.4, fadeOut: 0.6 });
makeSting('cand_start_evilhit.ogg', '_preview_evil_hit.wav', { len: 2.3, fadeOut: 0.6 });
makeSting('cand_start_braamhit.ogg', 'fs_431316_braam_hit.mp3', { start: 0, len: 2.6, fadeOut: 0.8 });
makeSting('cand_clear_hope.ogg', '_preview_hope_resolve.wav', { len: 3.0, fadeOut: 0.8 });
makeSting('cand_clear_bell.ogg', 'oga_pleasing_bell.wav', { len: 0.62, fadeOut: 0.25 });

try { rmSync(TMP); } catch {}
console.log('fatto.');
