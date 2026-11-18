// Monta original | vetor lado a lado (e um recorte ampliado) para inspeção visual de um relato revisado.
// Uso: node --experimental-strip-types bench/lado.ts <id> <etiqueta> [x y w h] (recorte em fração 0..1)
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, readdirSync } from 'node:fs'
const [id, tag, ...crop] = process.argv.slice(2)
const dir = `bench/reais/relatos/${id}`
const orig = `${dir}/${readdirSync(dir).find((f) => f.startsWith('original.'))}`
const svg = readFileSync(`bench/out/relatos/${id}/${tag}/resultado.svg`, 'utf8')
const meta = await sharp(orig).metadata()
const W = meta.width!, H = meta.height!
const [fx, fy, fw, fh] = crop.length === 4 ? crop.map(Number) : [0, 0, 1, 1]
const cx = Math.round(fx * W), cy = Math.round(fy * H), cw = Math.round(fw * W), ch = Math.round(fh * H)
const OUT = 640
const k = OUT / cw
const a = await sharp(orig).flatten({ background: '#fff' }).extract({ left: cx, top: cy, width: cw, height: ch }).resize(OUT, null, { kernel: 'nearest' }).png().toBuffer()
const big = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(W * k) }, background: '#fff' }).render().asPng()
const b = await sharp(big).extract({ left: Math.round(cx * k), top: Math.round(cy * k), width: OUT, height: Math.round(ch * k) }).png().toBuffer()
const hh = Math.round(ch * k)
await sharp({ create: { width: OUT * 2 + 8, height: hh, channels: 3, background: '#888' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: OUT + 8, top: 0 }]).png().toFile(`bench/out/lado-${id.slice(0, 8)}-${tag}.png`)
console.log(`bench/out/lado-${id.slice(0, 8)}-${tag}.png`)
