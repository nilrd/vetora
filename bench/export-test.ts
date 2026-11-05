import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { vectorize } from '../src/engine/index.ts'
import { buildSvg, buildPdf, buildEps, buildDxf, defaultExport } from '../src/lib/export.ts'
const svg = readFileSync('bench/gt/09-adesivo.svg', 'utf8')
const r = new Resvg(svg, { fitTo: { mode: 'width', value: 320 } }).render()
const res = vectorize({ rgba: new Uint8Array(r.pixels), width: r.width, height: r.height })
const none = new Set<number>()
const o = { ...defaultExport }
writeFileSync('bench/out/export/a.svg', buildSvg(res, o, none))
writeFileSync('bench/out/export/a-camadas.svg', buildSvg(res, { ...o, groupByColor: true }, none))
writeFileSync('bench/out/export/a.pdf', buildPdf(res, { ...o, unit: 'mm', width: 100 }, none))
writeFileSync('bench/out/export/a-recortes.pdf', buildPdf(res, { ...o, stacking: 'cutouts' }, none))
writeFileSync('bench/out/export/a.eps', buildEps(res, o, none))
writeFileSync('bench/out/export/a-corte.dxf', buildDxf(res, { ...o, preset: 'cut', unit: 'mm', width: 100 }, none))
writeFileSync('bench/out/export/a-corte.svg', buildSvg(res, { ...o, preset: 'cut', unit: 'mm', width: 100 }, none))
console.log('formas', res.shapes.length)
