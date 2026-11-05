import type { VectorResult, Shape, RGB } from '../engine/types.ts'
import { toSvg } from '../engine/svg.ts'
import { hex } from '../engine/color.ts'

export type Format = 'svg' | 'pdf' | 'eps' | 'dxf' | 'png'
export type Unit = 'px' | 'mm' | 'cm' | 'in'

export interface ExportOptions {
  format: Format
  preset: 'edit' | 'cut'
  /** no corte: contorno de cada forma, ou cada fronteira uma vez só (sem linha dupla) */
  cutStyle: 'strokeShapes' | 'strokeEdges'
  stacking: 'stacked' | 'cutouts'
  gapFiller: boolean
  groupByColor: boolean
  unit: Unit
  /** largura final na unidade escolhida (0 = original) */
  width: number
  pngScale: number
}

export const defaultExport: ExportOptions = {
  format: 'svg', preset: 'edit', cutStyle: 'strokeShapes', stacking: 'stacked', gapFiller: true, groupByColor: false, unit: 'px', width: 0, pngScale: 4,
}

/** mm por unidade */
const MM: Record<Unit, number> = { px: 25.4 / 96, mm: 1, cm: 10, in: 25.4 }

/** Tamanho final em mm, a partir das opções. */
function sizeMM(r: VectorResult, o: ExportOptions) {
  const wmm = o.width > 0 ? o.width * MM[o.unit] : r.width * MM.px
  return { wmm, hmm: (wmm * r.height) / r.width }
}

// ---------- leitura dos caminhos (só usamos M, L, C, Z absolutos) ----------
type Cmd = { c: 'M' | 'L' | 'C' | 'Z'; v: number[] }
export function parseD(d: string): Cmd[] {
  const out: Cmd[] = []
  const re = /([MLCZ])([^MLCZ]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const v = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : []
    out.push({ c: m[1] as Cmd['c'], v })
  }
  return out
}

function visibleShapes(r: VectorResult, hidden: Set<number>): Shape[] {
  return r.shapes.filter((s) => !hidden.has(s.id))
}

/** O que desenhar em PDF/EPS/DXF: formas (com cor) ou, no corte por bordas, cada fronteira uma vez. */
function drawList(r: VectorResult, o: ExportOptions, hidden: Set<number>): { color: RGB; d: string; closed?: boolean }[] {
  const vis = visibleShapes(r, hidden)
  if (o.preset === 'cut' && o.cutStyle === 'strokeEdges') {
    const ids = new Set(vis.map((s) => s.id))
    return r.edges.filter((e) => ids.has(e.a) || ids.has(e.b)).map((e) => ({ color: [0, 0, 0] as RGB, d: e.d }))
  }
  const cutOrHoles = o.preset === 'cut' || o.stacking === 'cutouts'
  return vis.map((s) => ({ color: s.color, d: cutOrHoles ? s.dCutout : s.d }))
}

export function buildSvg(r: VectorResult, o: ExportOptions, hidden: Set<number>): string {
  const vis = { ...r, shapes: visibleShapes(r, hidden) }
  const { wmm, hmm } = sizeMM(r, o)
  const useUnit = o.unit !== 'px' || o.width > 0
  const fmtU = (mm: number) => {
    if (!useUnit) return undefined
    if (o.unit === 'px') return String(Math.round((mm / MM.px) * 100) / 100)
    return `${Math.round((mm / MM[o.unit]) * 1000) / 1000}${o.unit}`
  }
  return toSvg(vis, {
    stacking: o.groupByColor ? 'cutouts' : o.stacking,
    gapFiller: o.preset === 'cut' ? false : o.gapFiller,
    groupByColor: o.groupByColor,
    drawStyle: o.preset === 'cut' ? o.cutStyle : 'fill',
    strokeWidth: o.preset === 'cut' ? Math.max(0.1, r.width / 1000) : undefined,
    width: fmtU(wmm), height: fmtU(hmm),
  })
}

// ---------- PDF ----------
export function buildPdf(r: VectorResult, o: ExportOptions, hidden: Set<number>): Uint8Array {
  const { wmm, hmm } = sizeMM(r, o)
  const W = (wmm / 25.4) * 72, H = (hmm / 25.4) * 72
  const sx = W / r.width, sy = H / r.height
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString()
  const cut = o.preset === 'cut'
  let c = `q ${f(sx)} 0 0 ${f(-sy)} 0 ${f(H)} cm\n`
  if (cut) c += `${f(Math.max(0.1, r.width / 1000))} w 1 j\n`
  for (const { color, d } of drawList(r, o, hidden)) {
    const [R, G, B] = color.map((v) => v / 255)
    c += cut ? `${f(R)} ${f(G)} ${f(B)} RG\n` : `${f(R)} ${f(G)} ${f(B)} rg\n`
    for (const k of parseD(d)) {
      if (k.c === 'M') c += `${f(k.v[0])} ${f(k.v[1])} m\n`
      else if (k.c === 'L') c += `${f(k.v[0])} ${f(k.v[1])} l\n`
      else if (k.c === 'C') c += `${k.v.map(f).join(' ')} c\n`
      else c += 'h\n'
    }
    c += cut ? 'S\n' : o.stacking === 'cutouts' ? 'f*\n' : 'f\n'
  }
  c += 'Q\n'
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${c.length} >>\nstream\n${c}endstream`,
    '<< /Producer (Vetora) /Creator (Vetora) >>',
  ]
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offs: number[] = []
  objs.forEach((ob, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${ob}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o2 of offs) out += `${String(o2).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255
  return bytes
}

// ---------- EPS ----------
export function buildEps(r: VectorResult, o: ExportOptions, hidden: Set<number>): string {
  const { wmm, hmm } = sizeMM(r, o)
  const W = (wmm / 25.4) * 72, H = (hmm / 25.4) * 72
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString()
  const cut = o.preset === 'cut'
  let s = `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}\n%%HiResBoundingBox: 0 0 ${f(W)} ${f(H)}\n%%Creator: Vetora\n%%LanguageLevel: 2\n%%EndComments\n`
  s += `gsave\n0 ${f(H)} translate ${f(W / r.width)} ${f(-H / r.height)} scale\n`
  if (cut) s += `${f(Math.max(0.1, r.width / 1000))} setlinewidth 1 setlinejoin\n`
  for (const { color, d } of drawList(r, o, hidden)) {
    const [R, G, B] = color.map((v) => v / 255)
    s += `${f(R)} ${f(G)} ${f(B)} setrgbcolor\nnewpath\n`
    for (const k of parseD(d)) {
      if (k.c === 'M') s += `${f(k.v[0])} ${f(k.v[1])} moveto\n`
      else if (k.c === 'L') s += `${f(k.v[0])} ${f(k.v[1])} lineto\n`
      else if (k.c === 'C') s += `${k.v.map(f).join(' ')} curveto\n`
      else s += 'closepath\n'
    }
    s += cut ? 'stroke\n' : o.stacking === 'cutouts' ? 'eofill\n' : 'fill\n'
  }
  s += 'grestore\nshowpage\n%%EOF\n'
  return s
}

// ---------- DXF (R12, o mais aceito por máquinas de corte) ----------
function flattenCubic(x0: number, y0: number, c: number[], tol: number, out: number[]) {
  const [x1, y1, x2, y2, x3, y3] = c
  const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)
  const n = Math.max(2, Math.min(64, Math.ceil(Math.sqrt(len / tol))))
  for (let i = 1; i <= n; i++) {
    const t = i / n, mt = 1 - t
    out.push(
      mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
      mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
    )
  }
}

function aci(c: RGB) {
  // cor AutoCAD aproximada (só para enxergar as camadas)
  const [r, g, b] = c
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  if (mx - mn < 30) return mx > 180 ? 7 : mx > 90 ? 8 : 250
  if (r >= g && r >= b) return g > 150 ? 2 : 1
  if (g >= r && g >= b) return b > 150 ? 4 : 3
  return r > 150 ? 6 : 5
}

export function buildDxf(r: VectorResult, o: ExportOptions, hidden: Set<number>): string {
  const { wmm } = sizeMM(r, o)
  const k = wmm / r.width // mm por px da imagem
  const H = r.height
  const lines: string[] = []
  const p = (code: number, v: string | number) => { lines.push(String(code), String(v)) }
  const items = drawList(r, { ...o, preset: 'cut' }, hidden)
  const layers = new Map<string, number>()
  for (const s of items) layers.set('COR_' + hex(s.color).slice(1).toUpperCase(), aci(s.color))
  p(0, 'SECTION'); p(2, 'HEADER')
  p(9, '$ACADVER'); p(1, 'AC1009')
  p(9, '$INSUNITS'); p(70, 4)
  p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'TABLES')
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, layers.size)
  for (const [name, color] of layers) { p(0, 'LAYER'); p(2, name); p(70, 0); p(62, color); p(6, 'CONTINUOUS') }
  p(0, 'ENDTAB'); p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'ENTITIES')
  const tol = 0.05 / Math.max(k, 1e-6) // 0,05 mm de precisão
  for (const s of items) {
    const layer = 'COR_' + hex(s.color).slice(1).toUpperCase()
    let pts: number[] = []
    let cx = 0, cy = 0
    let closed = false
    const flush = () => {
      if (pts.length >= 4) {
        p(0, 'POLYLINE'); p(8, layer); p(66, 1); p(70, closed ? 1 : 0)
        for (let i = 0; i < pts.length; i += 2) {
          p(0, 'VERTEX'); p(8, layer)
          p(10, (pts[i] * k).toFixed(4)); p(20, ((H - pts[i + 1]) * k).toFixed(4)); p(30, 0)
        }
        p(0, 'SEQEND'); p(8, layer)
      }
      pts = []
      closed = false
    }
    for (const c of parseD(s.d)) {
      if (c.c === 'M') { flush(); cx = c.v[0]; cy = c.v[1]; pts.push(cx, cy) }
      else if (c.c === 'L') { cx = c.v[0]; cy = c.v[1]; pts.push(cx, cy) }
      else if (c.c === 'C') { flattenCubic(cx, cy, c.v, tol, pts); cx = c.v[4]; cy = c.v[5] }
      else {
        // fecha: tira o último ponto se repetir o primeiro
        if (pts.length >= 4 && Math.abs(pts[0] - pts[pts.length - 2]) < 1e-6 && Math.abs(pts[1] - pts[pts.length - 1]) < 1e-6) pts.length -= 2
        closed = true
        flush()
      }
    }
    flush()
  }
  p(0, 'ENDSEC'); p(0, 'EOF')
  return lines.join('\n') + '\n'
}

// ---------- PNG (renderiza o próprio vetor) ----------
export async function buildPng(r: VectorResult, o: ExportOptions, hidden: Set<number>): Promise<Blob> {
  const svg = buildSvg(r, { ...o, unit: 'px', width: 0 }, hidden)
  const scale = Math.max(1, o.pngScale)
  const W = Math.round(r.width * scale), H = Math.round(r.height * scale)
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('svg')); img.src = url })
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    cv.getContext('2d')!.drawImage(img, 0, 0, W, H)
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/png'))
  } finally { URL.revokeObjectURL(url) }
}

export async function exportFile(r: VectorResult, o: ExportOptions, hidden: Set<number>): Promise<Blob> {
  switch (o.format) {
    case 'svg': return new Blob([buildSvg(r, o, hidden)], { type: 'image/svg+xml' })
    case 'pdf': return new Blob([buildPdf(r, o, hidden) as BlobPart], { type: 'application/pdf' })
    case 'eps': return new Blob([buildEps(r, o, hidden)], { type: 'application/postscript' })
    case 'dxf': return new Blob([buildDxf(r, o, hidden)], { type: 'application/dxf' })
    case 'png': return buildPng(r, o, hidden)
  }
}
