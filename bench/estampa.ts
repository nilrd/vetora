// Teste "estampa": arte preta (e uma colorida) como chega do cliente — pequena, borrada e em JPEG de WhatsApp.
// Vetoriza com o preset Estampa e salva SVG/PDF e prévias grandes em bench/out/estampa.
// Uso: node --experimental-strip-types bench/estampa.ts
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { vectorize } from '../src/engine/index.ts'
import { PURPOSES } from '../src/lib/presets.ts'
import { buildSvg, buildPdf, defaultExport } from '../src/lib/export.ts'

const OUT = 'bench/out/estampa'
mkdirSync(OUT, { recursive: true })

const preta = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#fff"/>
<circle cx="200" cy="150" r="110" fill="#111"/>
<path d="M200 60 L226 125 L296 128 L241 172 L260 240 L200 201 L140 240 L159 172 L104 128 L174 125Z" fill="#fff"/>
<circle cx="200" cy="150" r="98" fill="none" stroke="#fff" stroke-width="4"/>
<text x="200" y="320" font-family="Arial Black, Arial" font-weight="900" font-size="64" text-anchor="middle" fill="#111">ROCK 77</text>
<text x="200" y="365" font-family="Georgia" font-style="italic" font-size="30" text-anchor="middle" fill="#111">since forever</text>
<path d="M40 380 Q200 340 360 380" fill="none" stroke="#111" stroke-width="3"/></svg>`

const cases: [string, string][] = [['preta', preta], ['emblema', readFileSync('bench/gt/14-emblema.svg', 'utf8')]]
const preset = PURPOSES.find((p) => p.id === 'print')!

for (const [name, svg] of cases) {
  // cliente: arte de ~500px, reduzida e reenviada em JPEG forte
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 500 }, background: '#fff', font: { loadSystemFonts: true } }).render()
  const jpg = await sharp(Buffer.from(r.pixels), { raw: { width: r.width, height: r.height, channels: 4 } })
    .removeAlpha().jpeg({ quality: 55 }).toBuffer()
  writeFileSync(`${OUT}/${name}-entrada.jpg`, jpg)
  const d = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const res = vectorize({ rgba: new Uint8Array(d.data), width: d.info.width, height: d.info.height, settings: preset.settings })
  const opts = { ...defaultExport, ...preset.exportOpts }
  const outSvg = buildSvg(res, opts as typeof defaultExport, new Set())
  writeFileSync(`${OUT}/${name}.svg`, outSvg)
  writeFileSync(`${OUT}/${name}.pdf`, buildPdf(res, opts as typeof defaultExport, new Set()))
  // prévia grande (como impresso em 30 cm), de fundo branco
  const big = new Resvg(outSvg, { fitTo: { mode: 'width', value: 3000 }, background: '#fff' }).render()
  writeFileSync(`${OUT}/${name}-svg-3000.png`, big.asPng())
  console.log(name, res.stats, 'cores:', res.palette.map((c) => c.join(',')).join(' | '))
}
