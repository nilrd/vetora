// Banco de testes de qualidade do Vetora.
// Uso: npm run bench [-- filtro] [-- --save]
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { vectorize } from '../src/engine/index.ts'
import { toSvg } from '../src/engine/svg.ts'
import { rgbToLab } from '../src/engine/color.ts'

const require = createRequire(import.meta.url)
const vtracer = require('@visioncortex/vtracer')
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const save = args.includes('--save')
const filter = args.find((a) => !a.startsWith('--'))
const engines = (args.find((a) => a.startsWith('--engines='))?.slice(10) || 'vetora,vtracer').split(',')

const REF = 1280

function render(svg: string, width: number, bg = '#ffffff') {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: bg, font: { loadSystemFonts: true } })
  const img = r.render()
  return { rgba: new Uint8Array(img.pixels), w: img.width, h: img.height }
}
function renderAlpha(svg: string, width: number) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } })
  const img = r.render()
  return { rgba: new Uint8Array(img.pixels), w: img.width, h: img.height }
}

const labA = new Float32Array(3), labB = new Float32Array(3)
function compare(a: Uint8Array, b: Uint8Array, n: number) {
  let sum = 0, bad = 0
  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (a[o] === b[o] && a[o + 1] === b[o + 1] && a[o + 2] === b[o + 2]) continue
    rgbToLab(a[o], a[o + 1], a[o + 2], labA, 0)
    rgbToLab(b[o], b[o + 1], b[o + 2], labB, 0)
    const d = Math.sqrt((labA[0] - labB[0]) ** 2 + (labA[1] - labB[1]) ** 2 + (labA[2] - labB[2]) ** 2)
    sum += d
    if (d > 20) bad++
  }
  return { meanDE: sum / n, badPct: (bad / n) * 100 }
}

const countNodes = (svg: string) => (svg.match(/[LCQSAHVlcqsahv]/g) || []).length

async function variants(name: string, svg: string) {
  const out: { v: string; rgba: Uint8Array; w: number; h: number }[] = []
  const big = renderAlpha(svg, 320)
  out.push({ v: 'png', ...big })
  const small = renderAlpha(svg, 140)
  out.push({ v: 'pequena', ...small })
  const flat = render(svg, 320)
  const jpg = await sharp(Buffer.from(flat.rgba), { raw: { width: flat.w, height: flat.h, channels: 4 } })
    .removeAlpha().jpeg({ quality: 70 }).toBuffer()
  const dec = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  out.push({ v: 'jpeg', rgba: new Uint8Array(dec.data), w: dec.info.width, h: dec.info.height })
  return out
}

type Row = { img: string; v: string; eng: string; meanDE: number; badPct: number; nodes: number; kb: number; ms: number }
const rows: Row[] = []
const gtDir = join(here, 'gt')
const outDir = join(here, 'out')
mkdirSync(outDir, { recursive: true })

for (const f of readdirSync(gtDir).filter((f) => f.endsWith('.svg')).sort()) {
  if (filter && !f.includes(filter)) continue
  const name = f.replace('.svg', '')
  const gt = readFileSync(join(gtDir, f), 'utf8')
  const ref = render(gt, REF)
  for (const vr of await variants(name, gt)) {
    for (const eng of engines) {
      const t0 = Date.now()
      let svg: string
      if (eng === 'vetora') {
        const r = vectorize({ rgba: vr.rgba, width: vr.w, height: vr.h })
        svg = toSvg(r)
      } else {
        svg = vtracer.convertPixels(vr.rgba, vr.w, vr.h, {})
      }
      const ms = Date.now() - t0
      const res = render(svg, REF)
      const n = Math.min(res.w * res.h, ref.w * ref.h)
      const m = res.w === ref.w && res.h === ref.h ? compare(ref.rgba, res.rgba, n) : { meanDE: NaN, badPct: NaN }
      rows.push({ img: name, v: vr.v, eng, ...m, nodes: countNodes(svg), kb: svg.length / 1024, ms })
      if (save) {
        mkdirSync(join(outDir, eng), { recursive: true })
        writeFileSync(join(outDir, eng, `${name}-${vr.v}.svg`), svg)
        await sharp(Buffer.from(res.rgba), { raw: { width: res.w, height: res.h, channels: 4 } }).png().toFile(join(outDir, eng, `${name}-${vr.v}.png`))
      }
    }
  }
}

// tabela
const pad = (s: string | number, n: number) => String(s).padEnd(n)
let txt = pad('imagem', 18) + pad('var', 9) + pad('motor', 9) + pad('ΔE méd', 9) + pad('% ruins', 9) + pad('nós', 7) + pad('KB', 8) + 'ms\n'
for (const r of rows) txt += pad(r.img, 18) + pad(r.v, 9) + pad(r.eng, 9) + pad(r.meanDE.toFixed(2), 9) + pad(r.badPct.toFixed(2), 9) + pad(r.nodes, 7) + pad(r.kb.toFixed(1), 8) + r.ms + '\n'
txt += '\nMédias por motor e variante:\n'
for (const eng of engines)
  for (const v of ['png', 'pequena', 'jpeg']) {
    const rs = rows.filter((r) => r.eng === eng && r.v === v)
    if (!rs.length) continue
    const avg = (k: keyof Row) => rs.reduce((s, r) => s + (r[k] as number), 0) / rs.length
    txt += `${pad(eng, 9)} ${pad(v, 9)} ΔE ${avg('meanDE').toFixed(3)}  ruins ${avg('badPct').toFixed(3)}%  nós ${avg('nodes').toFixed(0)}  KB ${avg('kb').toFixed(1)}\n`
  }
console.log(txt)
writeFileSync(join(outDir, 'report.txt'), txt)
