// Stampa translation/rotation/scale di nodi specifici di un GLB (per nome).
import { readFileSync } from 'fs';
function parseGLB(path) {
  const buf = readFileSync(path);
  let offset = 12, json = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    offset += 8 + len;
  }
  return json;
}
const g = parseGLB(process.argv[2]);
const want = process.argv.slice(3);
g.nodes.forEach((n, i) => {
  if (want.length && !want.includes(n.name)) return;
  console.log(`[${i}] ${n.name}`);
  console.log('   T:', n.translation || '(0,0,0)');
  console.log('   R:', n.rotation || '(identity)');
  console.log('   S:', n.scale || '(1,1,1)');
});
