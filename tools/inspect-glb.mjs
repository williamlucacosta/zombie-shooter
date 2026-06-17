// Stampa la struttura di un GLB: nodi, mesh, bone, animazioni.
// Uso: node tools/inspect-glb.mjs public/assets/models/player.glb
import { readFileSync } from 'fs';

function parseGLB(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error('non è un GLB');
  let offset = 12;
  let json = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    offset += 8 + len;
  }
  return json;
}

const path = process.argv[2];
const g = parseGLB(path);
console.log('=== ' + path + ' ===');
console.log('NODI (' + (g.nodes?.length || 0) + '):');
(g.nodes || []).forEach((n, i) => {
  const tags = [];
  if (n.mesh !== undefined) tags.push('mesh#' + n.mesh + '=' + (g.meshes[n.mesh]?.name || '?'));
  if (n.skin !== undefined) tags.push('skin#' + n.skin);
  if (n.children) tags.push('figli:' + n.children.length);
  console.log(`  [${i}] ${n.name || '(senza nome)'} ${tags.join(' ')}`);
});
console.log('MESH (' + (g.meshes?.length || 0) + '):');
(g.meshes || []).forEach((m, i) => console.log(`  [${i}] ${m.name || '?'} — primitive: ${m.primitives.length}`));
console.log('ANIMAZIONI (' + (g.animations?.length || 0) + '):');
(g.animations || []).forEach((a) => console.log('  - ' + a.name));
