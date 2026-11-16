import { writeFileSync, readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { vectorize } from '../src/engine/index.ts'
import { toSvg } from '../src/engine/svg.ts'
const tag = process.argv[2] || 'x'
const cases: [string, string, number][] = [
  ['emblema', readFileSync('bench/gt/14-emblema.svg', 'utf8'), 45],
  ['raposa', readFileSync('bench/gt/13-raposa.svg', 'utf8'), 45],
  ['preta', readFileSync('bench/estampa.ts', 'utf8').match(/const preta = `([\s\S]*?)`/)![1], 40],
]
for (const [name, svg, q] of cases) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 420 }, background: '#fff', font: { loadSystemFonts: true } }).render()
  const jpg = await sharp(Buffer.from(r.pixels), { raw: { width: r.width, height: r.height, channels: 4 } }).blur(0.8).removeAlpha().jpeg({ quality: q }).toBuffer()
  const d = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const res = vectorize({ rgba: new Uint8Array(d.data), width: d.info.width, height: d.info.height, settings: { background: 'remove', mergeSimilar: 65 } })
  const by: Record<string, { n: number; area: number }> = {}
  for (const s of res.shapes) { const k = s.color.join(','); by[k] ??= { n: 0, area: 0 }; by[k].n++; by[k].area += Math.round(s.area) }
  console.log(tag, name, res.stats.shapes, by)
  writeFileSync(`bench/out/halo-${name}-${tag}.png`, new Resvg(toSvg(res), { fitTo: { mode: 'width', value: 840 }, background: '#222' }).render().asPng())
}
