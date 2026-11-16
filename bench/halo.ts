// Halo: arte preta borrada + JPEG, fundo removido. Conta cores e formas finas que sobram em volta do preto.
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { vectorize } from '../src/engine/index.ts'
import { toSvg } from '../src/engine/svg.ts'
const tag = process.argv[2] || 'x'
const { data, info } = await sharp('bench/reais/jair-triangulo-print.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const a = new Uint8Array(data)
for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; const v = l > 140 ? 255 : l < 60 ? 0 : Math.round((l - 60) / 80 * 255); a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255 }
// borra (como ampliação ruim) e salva em JPEG fraco
const jpg = await sharp(Buffer.from(a), { raw: { width: info.width, height: info.height, channels: 4 } }).blur(1.2).removeAlpha().jpeg({ quality: 50 }).toBuffer()
const d = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
for (const purpose of ['print'] as const) {
  const res = vectorize({ rgba: new Uint8Array(d.data), width: d.info.width, height: d.info.height, settings: { background: 'remove', mergeSimilar: 65 } })
  const by: Record<string, { n: number; area: number }> = {}
  for (const s of res.shapes) { const k = s.color.join(','); by[k] ??= { n: 0, area: 0 }; by[k].n++; by[k].area += s.area }
  console.log(tag, purpose, res.stats, by)
  const svg = toSvg(res)
  writeFileSync(`bench/out/halo-${tag}.png`, new Resvg(svg, { fitTo: { mode: 'width', value: 900 }, background: '#c0392b' }).render().asPng())
}
