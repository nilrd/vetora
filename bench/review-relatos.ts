// Reproduz os relatos baixados, salvando vetores e prévias para comparação entre revisões.
// Uso: node --experimental-strip-types bench/review-relatos.ts <etiqueta> [id ...]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import { vectorize, type Settings } from '../src/engine/index.ts'
import { buildSvg, buildPdf, defaultExport, type ExportOptions } from '../src/lib/export.ts'

interface Report {
  nome_arquivo: string
  criado_em: string
  configuracoes: Partial<Settings>
  exportacao: Partial<ExportOptions>
}

const tag = process.argv[2] || 'atual'
if (!/^[a-zA-Z0-9_-]+$/.test(tag)) throw new Error('Use letras, números e hífens na etiqueta.')
const root = 'bench/reais/relatos'
if (!existsSync(root)) throw new Error('Baixe os relatos com ./bench/relatos.ps1 antes de executar.')
const selected = new Set(process.argv.slice(3))
const reports = readdirSync(root).filter(id => !selected.size || selected.has(id))
const latest = new Map<string, { id: string; meta: Report }>()
for (const id of reports) {
  const meta = JSON.parse(readFileSync(join(root, id, 'relato.json'), 'utf8'))
  const prior = latest.get(meta.nome_arquivo)
  if (!prior || meta.criado_em > prior.meta.criado_em) latest.set(meta.nome_arquivo, { id, meta })
}
const summaries = []
for (const { id, meta } of latest.values()) {
  const folder = join(root, id)
  const file = readdirSync(folder).find(name => /^original\./.test(name))
  if (!file) throw new Error(`Original ausente no relato ${id}. Execute o download novamente.`)
  const original = join(folder, file)
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const result = vectorize({ rgba: data, width: info.width, height: info.height, settings: meta.configuracoes })
  const options = { ...defaultExport, ...meta.exportacao }
  const svg = buildSvg(result, options, new Set())
  const out = join('bench/out/relatos', id, tag)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'resultado.svg'), svg)
  writeFileSync(join(out, 'resultado.pdf'), buildPdf(result, options, new Set()))
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 800 }, font: { loadSystemFonts: false } }).render().asPng()
  writeFileSync(join(out, 'vetor.png'), png)
  await sharp(original).resize({ width: 800 }).png().toFile(join(out, 'original.png'))
  const summary = { id, arquivo: meta.nome_arquivo, ...result.stats, svgBytes: Buffer.byteLength(svg) }
  summaries.push(summary)
  console.log(summary)
}
mkdirSync('bench/out/relatos', { recursive: true })
writeFileSync(`bench/out/relatos/${tag}.json`, JSON.stringify(summaries, null, 2))
