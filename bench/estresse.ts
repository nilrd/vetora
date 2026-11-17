// Estresse: imagens difíceis (ruído, degradê, 1 px, minúsculas) em vários ajustes; nenhuma pode derrubar o motor.
// Uso: node --experimental-strip-types bench/estresse.ts
import { vectorize } from '../src/engine/index.ts'
// imagens de estresse: ruído, degradê, linhas de 1 px, cantos, tamanhos pequenos
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const mk = (w: number, h: number, f: (x: number, y: number) => number) => { const a = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const v = Math.max(0, Math.min(255, Math.round(f(x, y)))); a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255 } return a }
const cases: [string, number, number, (x: number, y: number) => number][] = [
  ['ruido', 300, 400, () => rnd() * 255],
  ['degrade+ruido', 400, 700, (x, y) => (x + y) / 4 + rnd() * 60],
  ['linhas1px', 200, 200, (x, y) => (x % 7 === 0 || y % 11 === 0 ? 0 : 255)],
  ['xadrez', 120, 120, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 0 : 255],
  ['tatuagem', 576, 1024, (x, y) => { const r = Math.hypot(x - 288, y - 512); return (Math.sin(r / 3) * 0.5 + 0.5) * 255 * (rnd() * 0.5 + 0.5) + (x > 280 && x < 296 ? -255 : 0) }],
  ['minusculo', 3, 3, (x) => x * 100],
  ['ponto', 1, 1, () => 0],
  ['diagonal', 150, 150, (x, y) => (Math.abs(x - y) < 2 ? 0 : 255)],
]
for (const [n, w, h, f] of cases) {
  for (const st of [{}, { background: 'remove' as const }, { imageType: 'photo' as const }, { purpose: 'print' as const, mergeSimilar: 65 }]) {
    try { const r = vectorize({ rgba: mk(w, h, f), width: w, height: h, settings: st }); process.stdout.write(`${n} ${JSON.stringify(st)} ok ${r.stats.shapes}\n`) }
    catch (e) { console.log(n, JSON.stringify(st), 'ERRO', (e as Error).stack?.split('\n').slice(0, 4).join(' | ')) }
  }
}
