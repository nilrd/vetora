// Teste com o print do Jair (triângulo "A"): fundo xadrez vira branco, vetoriza e amplia.
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { vectorize } from '../src/engine/index.ts'
import { toSvg } from '../src/engine/svg.ts'
const tag = process.argv[2] || 'x'
const { data, info } = await sharp('bench/reais/jair-z-print.jpg').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const a = new Uint8Array(data)
for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; const v = l > 140 ? 255 : l < 60 ? 0 : Math.round((l - 60) / 80 * 255); a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255 }
await sharp(Buffer.from(a), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile('bench/out/z-entrada.png')
const res = vectorize({ rgba: a, width: info.width, height: info.height, settings: { background: 'remove' } })
const svg = toSvg(res)
writeFileSync(`bench/out/z-${tag}.svg`, svg)
writeFileSync(`bench/out/z-${tag}.png`, new Resvg(svg, { fitTo: { mode: 'width', value: 900 }, background: '#fff' }).render().asPng())
console.log(tag, res.stats)
