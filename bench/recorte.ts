// Vetoriza um RECORTE pequeno de uma imagem (leve: não pesa o PC) e salva original | vetor ampliados.
// Uso: node --experimental-strip-types bench/recorte.ts <imagem> <x> <y> <w> <h> <saida.png> [ajustes-json]
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import { vectorize } from '../src/engine/index.ts'
import { toSvg } from '../src/engine/svg.ts'
const [img, x, y, w, h, out, js] = process.argv.slice(2)
const [X, Y, Wd, Hd] = [x, y, w, h].map(Number)
if (Wd * Hd > 600 * 600) throw new Error('recorte grande demais (máx. 600×600)')
const { data, info } = await sharp(img).extract({ left: X, top: Y, width: Wd, height: Hd }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const r = vectorize({ rgba: new Uint8Array(data), width: info.width, height: info.height, settings: js ? JSON.parse(js) : {} })
const Z = Math.min(4, Math.floor(900 / Wd)) || 1
const a = await sharp(img).extract({ left: X, top: Y, width: Wd, height: Hd }).flatten({ background: '#fff' }).resize(Wd * Z, Hd * Z, { kernel: 'nearest' }).png().toBuffer()
const b = new Resvg(toSvg(r), { fitTo: { mode: 'width', value: Wd * Z }, background: '#fff' }).render().asPng()
await sharp({ create: { width: Wd * Z * 2 + 8, height: Hd * Z, channels: 3, background: '#888' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: Wd * Z + 8, top: 0 }]).png().toFile(out)
console.log(out, r.stats)
