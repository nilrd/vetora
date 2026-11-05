import { segment } from './segment.ts'
import { noiseLevel, denoise, upscale2x } from './denoise.ts'
import { trace } from './trace.ts'
import { chainPoints } from './subpixel.ts'
import { fitChain, reverseCurve } from './fit.ts'
import type { Curve, Progress, RGB, Seg, Settings, Shape, VectorResult } from './types.ts'
import { defaultSettings } from './types.ts'

export * from './types.ts'

let K = 1 // fator de escala da saída (imagem ampliada internamente)
const fmt = (v: number) => {
  const r = Math.round((v / K) * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

function segsToD(start: { x: number; y: number }, segs: Seg[], move: boolean): string {
  let d = move ? `M${fmt(start.x)} ${fmt(start.y)}` : ''
  for (const s of segs) {
    if (s.t === 'L') d += `L${fmt(s.x)} ${fmt(s.y)}`
    else d += `C${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)} ${fmt(s.x)} ${fmt(s.y)}`
  }
  return d
}

/** Detecta se a imagem tem antialiasing (bordas com cores intermediárias). */
function detectAA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): boolean {
  // antialiasing = cores raras (cada pixel de borda tem um tom próprio de mistura)
  const colors = new Map<number, number>()
  const step = Math.max(1, Math.floor((w * h) / 200000))
  let total = 0
  for (let i = 0; i < w * h; i += step) {
    const k = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]
    colors.set(k, (colors.get(k) || 0) + 1)
    total++
  }
  if (colors.size > 256) return true
  let rare = 0
  const lim = Math.max(2, total * 0.0005)
  for (const c of colors.values()) if (c <= lim) rare += c
  return colors.size > 12 && rare / total > 0.001
}

export interface EngineInput {
  rgba: Uint8ClampedArray | Uint8Array
  width: number
  height: number
  settings?: Partial<Settings>
  onProgress?: Progress
}

export function vectorize(inp: EngineInput): VectorResult {
  const t0 = Date.now()
  const s: Settings = { ...defaultSettings, ...(inp.settings || {}) }
  const { width: W0, height: H0 } = inp
  let w = W0, h = H0
  let rgba = inp.rgba
  const prog = inp.onProgress || (() => {})
  const photo = s.imageType === 'photo'
  const noise = noiseLevel(rgba, w, h)
  const noisy = noise > 0.06
  if (noisy || photo) {
    prog('limpando ruído', 0.02)
    rgba = denoise(rgba, w, h, photo ? 3 : noise > 0.5 ? 3 : 2, 2, photo ? 10 : 14)
  }
  // imagem pequena: amplia 2x por dentro (mais pixels para as curvas); a saída volta ao tamanho original
  const up = !photo && s.upscale === true && w * h <= 360_000 && w >= 8 && h >= 8
  K = up ? 2 : 1
  if (up) { rgba = upscale2x(rgba, w, h); w *= 2; h *= 2 }
  const hasAA = up || detectAA(rgba, w, h)

  const detail = s.detail / 100
  let minArea = photo ? Math.round(12 - detail * 9) : Math.max(1, Math.round(6 - detail * 5))
  if (noisy) minArea = Math.max(minArea, Math.round(Math.sqrt(W0 * H0) / 40))
  minArea *= K * K
  const mergeDist = 3 + (s.mergeSimilar / 100) * 16 // 3..19 ΔE

  prog('cores', 0.05)
  const seg = segment({ rgba, w, h, maxColors: s.maxColors, palette: s.palette, mergeDist, minArea, photo, noisy, mergeMap: s.palette ? s.mergeMap : undefined })
  prog('contornos', 0.4)
  const tr = trace(seg, (f) => prog('contornos', 0.4 + f * 0.2))
  prog('curvas', 0.6)

  const smooth = s.smoothness / 100
  const tolerance = (photo ? 0.6 + smooth * 1.2 : 0.2 + smooth * 0.6 + (noisy ? 0.15 : 0)) * (up ? 1.6 : 1)
  const cornerAngle = s.corners === 'sharp' ? 38 : s.corners === 'round' ? 85 : 52
  const curves: Curve[] = tr.chains.map((ch, i) => {
    if (i % 500 === 0) prog('curvas', 0.6 + (i / tr.chains.length) * 0.35)
    const pts = chainPoints(ch, seg, rgba, tr.H, hasAA)
    // com ruído (JPEG) a borda medida treme: suaviza mais
    return fitChain(pts, ch.closed, { tolerance, cornerAngle, smooth: noisy ? 1.5 : hasAA ? 0.5 : 1, primitives: true }, hasAA)
  })

  // fundo a remover: a cor que mais aparece na borda da imagem
  let removeLabel = -1
  if (s.background === 'remove') {
    const cnt = new Map<number, number>()
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const l = seg.label[y * w + x]; cnt.set(l, (cnt.get(l) || 0) + 1) }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const l = seg.label[y * w + x]; cnt.set(l, (cnt.get(l) || 0) + 1) }
    let best = 0
    for (const [l, c] of cnt) if (c > best && l !== seg.transparent) { best = c; removeLabel = l }
  }

  // nível de aninhamento: quem está dentro do furo de quem
  const nC = seg.nComp
  const holeSide = new Map<number, Set<number>>() // chain -> componentes que usam a cadeia num furo
  tr.loops.forEach((ls, c) => ls.forEach((lp) => { if (!lp.outer) for (const r of lp.refs) { let st = holeSide.get(r.chain); if (!st) holeSide.set(r.chain, (st = new Set())); st.add(c) } }))
  const parent = new Int32Array(nC).fill(-1)
  for (let c = 0; c < nC; c++) {
    const outer = tr.loops[c].find((l) => l.outer)
    if (!outer) continue
    for (const r of outer.refs) {
      const ch = tr.chains[r.chain]
      const other = ch.left === c ? ch.right : ch.left
      if (other >= 0 && holeSide.get(r.chain)?.has(other)) { parent[c] = other; break }
    }
  }
  const level = new Int32Array(nC).fill(-1)
  const getLevel = (c: number): number => {
    if (level[c] >= 0) return level[c]
    level[c] = 0
    const p = parent[c]
    level[c] = p >= 0 && p !== c ? getLevel(p) + 1 : 0
    return level[c]
  }

  const loopD = (refs: { chain: number; reversed: boolean }[]) => {
    let d = ''
    refs.forEach((r, i) => {
      const c = curves[r.chain]
      const g = r.reversed ? reverseCurve(c) : { start: c.start, segs: c.segs }
      d += segsToD(g.start, g.segs, i === 0)
    })
    return d + 'Z'
  }

  const shapes: Shape[] = []
  let nodes = 0
  for (let c = 0; c < nC; c++) {
    const L = seg.compLabel[c]
    if (L === seg.transparent || L === removeLabel) continue
    const ls = tr.loops[c]
    const outer = ls.find((l) => l.outer)
    if (!outer) continue
    const d = loopD(outer.refs)
    let dCut = d
    for (const l of ls) if (!l.outer) dCut += loopD(l.refs)
    for (const r of outer.refs) nodes += curves[r.chain].segs.length
    shapes.push({ id: c, color: seg.palette[L] as RGB, colorIndex: L, d, dCutout: dCut, area: seg.compArea[c] / (K * K), level: getLevel(c) })
  }
  shapes.sort((a, b) => a.level - b.level || b.area - a.area)
  // fronteiras únicas (sem a moldura da imagem); a/b = ids das formas dos dois lados (-1 = nenhuma)
  const shown = new Set(shapes.map((x) => x.id))
  const edges = tr.chains.flatMap((ch, i) => {
    if (ch.right < 0) return []
    const a = shown.has(ch.left) ? ch.left : -1, b = shown.has(ch.right) ? ch.right : -1
    if (a < 0 && b < 0) return []
    const c = curves[i]
    return [{ d: segsToD(c.start, c.segs, true) + (c.closed ? 'Z' : ''), a, b }]
  })
  prog('pronto', 1)
  const usedColors = new Set(shapes.map((s) => s.colorIndex))
  return {
    width: W0, height: H0, palette: seg.palette, shapes, edges,
    stats: { shapes: shapes.length, colors: usedColors.size, nodes, ms: Date.now() - t0 },
  }
}
