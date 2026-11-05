import { rgbToLab, labToRgb, dLab2 } from './color.ts'
import type { RGB } from './types.ts'

export interface SegmentInput {
  rgba: Uint8ClampedArray | Uint8Array
  w: number
  h: number
  maxColors: number
  palette?: RGB[]
  mergeDist: number // ΔE para juntar tons
  minArea: number // px
  photo: boolean
  noisy?: boolean
  mergeMap?: Record<number, number>
}

export interface Segmentation {
  w: number
  h: number
  /** índice de cor por pixel; transparente = palette.length */
  label: Int32Array
  /** componente conexo por pixel */
  comp: Int32Array
  compLabel: Int32Array
  compArea: Int32Array
  nComp: number
  /** diagonal ligada no vértice (w+1)*(h+1): 0 nenhuma, 1 = TL-BR, 2 = TR-BL */
  diag: Uint8Array
  palette: RGB[]
  transparent: number
  lab: Float32Array
}

/** Escolhe a paleta: cores "de verdade" vêm de áreas lisas; o antialiasing não vira cor nova. */
function pickPalette(lab: Float32Array, alpha: Uint8Array, w: number, h: number, flat: Uint8Array, inp: SegmentInput): Float32Array {
  const n = w * h
  if (inp.palette && inp.palette.length) {
    const c = new Float32Array(inp.palette.length * 3)
    inp.palette.forEach((p, i) => rgbToLab(p[0], p[1], p[2], c, i * 3))
    return c
  }
  // histograma das cores lisas (caixas de 2 ΔE)
  const B = 2
  const bins = new Map<number, number[]>() // key -> [count, L, a, b]
  let nFlat = 0, nOpaque = 0
  for (let i = 0; i < n; i++) {
    if (alpha[i] < 128) continue
    nOpaque++
    if (!flat[i]) continue
    nFlat++
    const o = i * 3
    const key = (Math.round(lab[o] / B) + 64) * 65536 + (Math.round(lab[o + 1] / B) + 128) * 256 + (Math.round(lab[o + 2] / B) + 128)
    let e = bins.get(key)
    if (!e) bins.set(key, (e = [0, 0, 0, 0]))
    e[0]++; e[1] += lab[o]; e[2] += lab[o + 1]; e[3] += lab[o + 2]
  }
  const photo = inp.photo || nFlat < nOpaque * 0.25
  let pts: number[][] = [...bins.values()].map((e) => [e[1] / e[0], e[2] / e[0], e[3] / e[0], e[0]])
  if (photo) {
    // foto: amostra todos os pixels
    const step = Math.max(1, Math.floor(n / 60000))
    const m = new Map<number, number[]>()
    for (let i = 0; i < n; i += step) {
      if (alpha[i] < 128) continue
      const o = i * 3
      const key = (Math.round(lab[o] / 3) + 64) * 65536 + (Math.round(lab[o + 1] / 3) + 128) * 256 + (Math.round(lab[o + 2] / 3) + 128)
      let e = m.get(key)
      if (!e) m.set(key, (e = [0, 0, 0, 0]))
      e[0]++; e[1] += lab[o]; e[2] += lab[o + 1]; e[3] += lab[o + 2]
    }
    pts = [...m.values()].map((e) => [e[1] / e[0], e[2] / e[0], e[3] / e[0], e[0]])
  }
  pts.sort((a, b) => b[3] - a[3])
  const md = photo ? Math.min(inp.mergeDist, 9) : inp.mergeDist
  // agrupamento inicial apertado: tons próximos mas diferentes (creme × branco) ficam separados;
  // a junção de verdade acontece depois, olhando o tamanho de cada cor
  const md2 = photo ? md * md : Math.min(md, 5.5) ** 2
  // agrupamento guloso: das cores mais comuns para as raras
  let cl: number[][] = [] // [L,a,b,weight]
  for (const p of pts) {
    let best = -1, bd = md2
    for (let k = 0; k < cl.length; k++) {
      const d = (cl[k][0] - p[0]) ** 2 + (cl[k][1] - p[1]) ** 2 + (cl[k][2] - p[2]) ** 2
      if (d < bd) { bd = d; best = k }
    }
    if (best < 0) cl.push([p[0], p[1], p[2], p[3]])
    else {
      const c = cl[best], wt = c[3] + p[3]
      c[0] = (c[0] * c[3] + p[0] * p[3]) / wt
      c[1] = (c[1] * c[3] + p[1] * p[3]) / wt
      c[2] = (c[2] * c[3] + p[2] * p[3]) / wt
      c[3] = wt
    }
  }
  // refina (k-means ponderado)
  for (let it = 0; it < 4; it++) {
    const acc = cl.map(() => [0, 0, 0, 0])
    for (const p of pts) {
      let best = 0, bd = Infinity
      for (let k = 0; k < cl.length; k++) {
        const d = (cl[k][0] - p[0]) ** 2 + (cl[k][1] - p[1]) ** 2 + (cl[k][2] - p[2]) ** 2
        if (d < bd) { bd = d; best = k }
      }
      const a = acc[best]
      a[0] += p[0] * p[3]; a[1] += p[1] * p[3]; a[2] += p[2] * p[3]; a[3] += p[3]
    }
    cl = acc.filter((a) => a[3] > 0).map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3], a[3]])
  }
  // espalhamento de cada cor (variância em Lab): ruído de JPEG espalha; cor lisa de verdade não
  const vr = cl.map(() => [0, 0])
  for (const p of pts) {
    let best = 0, bd = Infinity
    for (let k = 0; k < cl.length; k++) {
      const d = (cl[k][0] - p[0]) ** 2 + (cl[k][1] - p[1]) ** 2 + (cl[k][2] - p[2]) ** 2
      if (d < bd) { bd = d; best = k }
    }
    vr[best][0] += bd * p[3]; vr[best][1] += p[3]
  }
  for (let k = 0; k < cl.length; k++) cl[k][4] = (vr[k][1] ? vr[k][0] / vr[k][1] : 0) + 1
  // junta cores próximas: quando a distância é pequena perto do espalhamento delas (ruído),
  // quando uma é rara, ou quando o usuário pediu para juntar mais (slider alto).
  // Duas cores lisas e bem separadas (creme x branco) ficam.
  const close2 = (md * 0.8) ** 2
  const forceMerge = photo || md > 11.5
  for (;;) {
    let bi = -1, bj = -1, bd = close2
    for (let i = 0; i < cl.length; i++)
      for (let j = i + 1; j < cl.length; j++) {
        const d = (cl[i][0] - cl[j][0]) ** 2 + (cl[i][1] - cl[j][1]) ** 2 + (cl[i][2] - cl[j][2]) ** 2
        if (d >= bd) continue
        const small = Math.min(cl[i][3], cl[j][3]) < 0.03 * Math.max(cl[i][3], cl[j][3])
        const spread = 2.2 * (Math.sqrt(cl[i][4]) + Math.sqrt(cl[j][4]))
        if (!forceMerge && !small && Math.sqrt(d) > Math.max(3, spread)) continue
        bd = d; bi = i; bj = j
      }
    if (bi < 0) break
    const a = cl[bi], b = cl[bj], wt = a[3] + b[3]
    const m = [(a[0] * a[3] + b[0] * b[3]) / wt, (a[1] * a[3] + b[1] * b[3]) / wt, (a[2] * a[3] + b[2] * b[3]) / wt]
    const shA = (a[0] - m[0]) ** 2 + (a[1] - m[1]) ** 2 + (a[2] - m[2]) ** 2
    const shB = (b[0] - m[0]) ** 2 + (b[1] - m[1]) ** 2 + (b[2] - m[2]) ** 2
    cl[bi] = [m[0], m[1], m[2], wt, (a[3] * (a[4] + shA) + b[3] * (b[4] + shB)) / wt]
    cl.splice(bj, 1)
  }
  // descarta cores raras (ruído)
  const total = cl.reduce((s, c) => s + c[3], 0)
  const minW = Math.max(photo ? 6 : 3, total * (photo ? 0.0008 : 0.00015), inp.minArea * 0.75)
  cl = cl.filter((c) => c[3] >= minW)
  if (!cl.length) cl = [[50, 0, 0, 1]]
  // limite de cores: junta o par mais barato (Ward)
  const maxC = inp.maxColors > 0 ? inp.maxColors : photo ? 48 : 64
  while (cl.length > maxC) {
    let bi = 0, bj = 1, bc = Infinity
    for (let i = 0; i < cl.length; i++)
      for (let j = i + 1; j < cl.length; j++) {
        const d = (cl[i][0] - cl[j][0]) ** 2 + (cl[i][1] - cl[j][1]) ** 2 + (cl[i][2] - cl[j][2]) ** 2
        const c = (cl[i][3] * cl[j][3]) / (cl[i][3] + cl[j][3]) * d
        if (c < bc) { bc = c; bi = i; bj = j }
      }
    const a = cl[bi], b = cl[bj], wt = a[3] + b[3]
    cl[bi] = [(a[0] * a[3] + b[0] * b[3]) / wt, (a[1] * a[3] + b[1] * b[3]) / wt, (a[2] * a[3] + b[2] * b[3]) / wt, wt]
    cl.splice(bj, 1)
  }
  const out = new Float32Array(cl.length * 3)
  cl.forEach((c, i) => { out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2] })
  return out
}

/**
 * Traços finos (1–2 px) quase não têm pixel "liso", então a cor deles não entra na paleta.
 * Aqui procuramos pixels que nenhuma cor (nem mistura de duas) explica bem e criamos a cor que falta,
 * puxando para os pixels mais "puros" (os mais distantes do fundo).
 */
function addThinColors(pal: Float32Array, lab: Float32Array, alpha: Uint8Array, flat: Uint8Array, n: number, inp: SegmentInput): Float32Array {
  let cur = pal
  const thr = inp.noisy ? 22 : 14
  for (let round = 0; round < 10; round++) {
    const K = cur.length / 3
    const unexplained: number[] = []
    const resid: number[] = []
    for (let i = 0; i < n; i++) {
      if (flat[i] || alpha[i] < 200) continue
      const o = i * 3
      // as 3 cores mais próximas
      let b1 = -1, b2 = -1, b3 = -1, d1 = Infinity, d2 = Infinity, d3 = Infinity
      for (let k = 0; k < K; k++) {
        const d = dLab2(lab, o, cur, k * 3)
        if (d < d1) { d3 = d2; b3 = b2; d2 = d1; b2 = b1; d1 = d; b1 = k }
        else if (d < d2) { d3 = d2; b3 = b2; d2 = d; b2 = k }
        else if (d < d3) { d3 = d; b3 = k }
      }
      let best = d1
      // mistura (em Lab, aproximação) entre pares das 3 mais próximas
      const cands = [b1, b2, b3].filter((k) => k >= 0)
      for (let u = 0; u < cands.length; u++)
        for (let v = u + 1; v < cands.length; v++) {
          const A = cands[u] * 3, B = cands[v] * 3
          let num = 0, den = 0
          for (let c = 0; c < 3; c++) { const d = cur[A + c] - cur[B + c]; num += (lab[o + c] - cur[B + c]) * d; den += d * d }
          const t = den > 1e-6 ? Math.max(0, Math.min(1, num / den)) : 0
          let e = 0
          for (let c = 0; c < 3; c++) { const m = cur[B + c] + t * (cur[A + c] - cur[B + c]); e += (lab[o + c] - m) ** 2 }
          if (e < best) best = e
        }
      if (best > thr * thr) { unexplained.push(i); resid.push(Math.sqrt(best)) }
    }
    const minGroup = Math.max(inp.noisy ? 14 : 6, inp.minArea * 2)
    if (unexplained.length < minGroup) break
    // agrupa os pixels não explicados
    const md2 = 16 * 16
    const groups: { L: number; a: number; b: number; members: number[] }[] = []
    for (const i of unexplained) {
      const o = i * 3
      let g = -1, gd = md2
      for (let k = 0; k < groups.length; k++) {
        const G = groups[k]
        const d = (G.L - lab[o]) ** 2 + (G.a - lab[o + 1]) ** 2 + (G.b - lab[o + 2]) ** 2
        if (d < gd) { gd = d; g = k }
      }
      if (g < 0) groups.push({ L: lab[o], a: lab[o + 1], b: lab[o + 2], members: [i] })
      else {
        const G = groups[g], m = G.members.length
        G.L = (G.L * m + lab[o]) / (m + 1); G.a = (G.a * m + lab[o + 1]) / (m + 1); G.b = (G.b * m + lab[o + 2]) / (m + 1)
        G.members.push(i)
      }
    }
    // só a cor mais "pura" desta rodada: as misturas dela com o fundo passam a ser explicadas na próxima
    let add: number[] = []
    let addDist = -1
    for (const G of groups) {
      if (G.members.length < minGroup) continue
      // pixels mais "puros": os mais distantes da cor da paleta mais próxima
      const scored = G.members.map((i) => {
        let d1 = Infinity
        for (let k = 0; k < cur.length / 3; k++) d1 = Math.min(d1, dLab2(lab, i * 3, cur, k * 3))
        return { i, d: d1 }
      }).sort((a, b) => b.d - a.d)
      const top = scored.slice(0, Math.max(3, Math.ceil(scored.length * 0.25)))
      let L = 0, a = 0, b = 0, dsum = 0
      for (const t of top) { L += lab[t.i * 3]; a += lab[t.i * 3 + 1]; b += lab[t.i * 3 + 2]; dsum += Math.sqrt(t.d) }
      const score = dsum / top.length
      const cand = [L / top.length, a / top.length, b / top.length]
      // não cria uma cor quase igual a uma que já existe (traço fino de JPEG puxa tons parecidos)
      let nearest = Infinity
      for (let k = 0; k < cur.length / 3; k++) nearest = Math.min(nearest, dLab2(cand, 0, cur, k * 3))
      if (nearest < 12 * 12) continue
      if (score > addDist) { addDist = score; add = cand }
    }
    if (!add.length) break
    const next = new Float32Array(cur.length + add.length)
    next.set(cur); next.set(add, cur.length)
    cur = next
  }
  return cur
}

export function segment(inp: SegmentInput): Segmentation {
  const { rgba, w, h } = inp
  const n = w * h
  const lab = new Float32Array(n * 3)
  const alpha = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], lab, i * 3)
    alpha[i] = rgba[i * 4 + 3]
  }
  // pixels "lisos": parecidos com todos os vizinhos
  const flat = new Uint8Array(n)
  const FT = inp.photo ? 5 : 7
  const ft2 = FT * FT
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (alpha[i] < 250) continue
      let ok = true
      if (x > 0 && dLab2(lab, i * 3, lab, (i - 1) * 3) > ft2) ok = false
      else if (x < w - 1 && dLab2(lab, i * 3, lab, (i + 1) * 3) > ft2) ok = false
      else if (y > 0 && dLab2(lab, i * 3, lab, (i - w) * 3) > ft2) ok = false
      else if (y < h - 1 && dLab2(lab, i * 3, lab, (i + w) * 3) > ft2) ok = false
      flat[i] = ok ? 1 : 0
    }
  let pal = pickPalette(lab, alpha, w, h, flat, inp)
  if (!inp.palette?.length && !inp.photo) pal = addThinColors(pal, lab, alpha, flat, n, inp)
  const K = pal.length / 3
  const T = K // rótulo transparente
  const palRgb: RGB[] = []
  for (let k = 0; k < K; k++) palRgb.push(labToRgb(pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2]))

  const nearest = (o: number) => {
    let best = 0, bd = Infinity
    for (let k = 0; k < K; k++) {
      const d = dLab2(lab, o, pal, k * 3)
      if (d < bd) { bd = d; best = k }
    }
    return best
  }
  const label = new Int32Array(n).fill(-1)
  // 1) transparentes e lisos
  for (let i = 0; i < n; i++) {
    if (alpha[i] < 128) label[i] = T
    else if (flat[i]) label[i] = nearest(i * 3)
  }
  // 2) pixels de borda: explicados como mistura de duas cores vizinhas (antialiasing)
  const R = 2
  const cand: number[] = []
  const pr = new Float32Array(3)
  const mix = new Float32Array(3)
  /** Melhor explicação do pixel com as cores candidatas: uma cor só, ou mistura de duas (antialiasing). */
  const explain = (i: number): [number, number] => {
    const pRgb = [rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255]
    const a = alpha[i] / 255
    let bestL = -1, bestE = Infinity
    for (const c of cand) {
      if (c === T) continue
      const e = dLab2(lab, i * 3, pal, c * 3)
      if (e < bestE) { bestE = e; bestL = c }
    }
    let pairL = -1, pairE = Infinity
    for (let u = 0; u < cand.length; u++)
      for (let v = u + 1; v < cand.length; v++) {
        const A = cand[u], Bc = cand[v]
        if (A === T || Bc === T) {
          const op = A === T ? Bc : A
          const e = dLab2(lab, i * 3, pal, op * 3) * 0.5
          if (e < pairE) { pairE = e; pairL = a >= 0.5 ? op : T }
          continue
        }
        const ca = palRgb[A], cb = palRgb[Bc]
        let num = 0, den = 0
        for (let k = 0; k < 3; k++) {
          const d = ca[k] / 255 - cb[k] / 255
          num += (pRgb[k] - cb[k] / 255) * d
          den += d * d
        }
        const t = den > 1e-6 ? Math.max(0, Math.min(1, num / den)) : 0.5
        for (let k = 0; k < 3; k++) pr[k] = (t * ca[k] + (1 - t) * cb[k])
        rgbToLab(Math.round(pr[0]), Math.round(pr[1]), Math.round(pr[2]), mix, 0)
        const e = dLab2(lab, i * 3, mix, 0)
        if (e < pairE) { pairE = e; pairL = t >= 0.5 ? A : Bc }
      }
    if (alpha[i] < 128) return [T, 0]
    if (pairL >= 0 && pairE < bestE * 0.6) return [pairL, pairE]
    if (bestL >= 0) return [bestL, bestE]
    return [-1, Infinity]
  }
  const gather = (x: number, y: number, onlyFlat: boolean) => {
    cand.length = 0
    const i = y * w + x
    for (let dy = -R; dy <= R; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        const j = yy * w + xx
        const l = label[j]
        if (l < 0 || cand.indexOf(l) >= 0) continue
        if (onlyFlat && j < i && !flat[j] && l !== T) continue
        cand.push(l)
      }
    }
  }
  // 2a) com as cores lisas por perto; pixel mal explicado fica para depois
  const deferred: number[] = []
  const GOOD = 12 * 12
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (label[i] !== -1) continue
      gather(x, y, true)
      const [l, e] = cand.length ? explain(i) : [-1, Infinity]
      if (l >= 0 && e < GOOD) label[i] = l
      else { label[i] = -2; deferred.push(i) }
    }
  // 2b) traços finos (sem pixel liso): usa também os vizinhos já resolvidos, crescendo de fora para dentro
  let pending = deferred
  for (let round = 0; round < 4 && pending.length; round++) {
    const next: number[] = []
    const lim = round < 3 ? 20 * 20 : 30 * 30
    for (const i of pending) {
      const x = i % w, y = (i - x) / w
      gather(x, y, false)
      const [l, e] = cand.length ? explain(i) : [-1, Infinity]
      if (l >= 0 && e < lim) label[i] = l
      else next.push(i)
    }
    pending = next
  }
  for (const i of pending) label[i] = nearest(i * 3)

  // cores juntadas pelo usuário
  if (inp.mergeMap) {
    const map = new Int32Array(K + 1).map((_, i) => i)
    for (const [a, b] of Object.entries(inp.mergeMap)) {
      const ai = Number(a), bi = Number(b)
      if (ai >= 0 && ai < K && bi >= 0 && bi < K) map[ai] = bi
    }
    for (let k = 0; k < K; k++) { let t = k, g = 0; while (map[t] !== t && g++ < K) t = map[t]; map[k] = t }
    for (let i = 0; i < n; i++) label[i] = map[label[i]]
  }

  const seg: Segmentation = {
    w, h, label, comp: new Int32Array(n), compLabel: new Int32Array(0), compArea: new Int32Array(0), nComp: 0,
    diag: new Uint8Array((w + 1) * (h + 1)), palette: palRgb, transparent: T, lab,
  }
  if (inp.noisy && !inp.palette?.length) absorbRareVariants(seg, inp.mergeDist * 1.6)
  computeDiag(seg)
  components(seg)
  mergeSpecks(seg, inp.minArea)
  removeFringes(seg, inp.noisy ? 12 : 6, inp.noisy ? 22 : 0)
  if (inp.noisy) unifyThin(seg, 40)
  return seg
}

/**
 * Em JPEG, um traço fino perde saturação em trechos e vira duas cores alternadas.
 * Regiões finas vizinhas com cores próximas viram uma só (a cor da maior).
 */
function unifyThin(s: Segmentation, maxDE: number) {
  const { w, h, comp, compArea, compLabel, label } = s
  const T = s.transparent
  const per = new Int32Array(s.nComp)
  const pairs = new Map<number, number>() // key c*nComp+d -> shared
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, c = comp[i]
      for (const j of [x < w - 1 ? i + 1 : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0) continue
        const d = comp[j]
        if (d === c) continue
        per[c]++; per[d]++
        const k = c < d ? c * s.nComp + d : d * s.nComp + c
        pairs.set(k, (pairs.get(k) || 0) + 1)
      }
    }
  const palLab = s.palette.map((p) => { const o = new Float32Array(3); rgbToLab(p[0], p[1], p[2], o, 0); return o })
  const thin = (c: number) => per[c] > 0 && compArea[c] / per[c] < 0.9
  // soma, por par de cores, quanto de borda os traços finos dividem
  const colorPair = new Map<number, number>()
  for (const [k, len] of pairs) {
    const c = Math.floor(k / s.nComp), d = k % s.nComp
    const A = compLabel[c], B = compLabel[d]
    if (A === B || A === T || B === T || !thin(c) || !thin(d)) continue
    const e = Math.sqrt(dLab2(palLab[A], 0, palLab[B], 0))
    if (e > maxDE) continue
    const kk = A < B ? A * 1000 + B : B * 1000 + A
    colorPair.set(kk, (colorPair.get(kk) || 0) + len)
  }
  if (!colorPair.size) return
  // cor que "vence" em cada par: a de maior área total
  const area = new Float64Array(s.palette.length + 1)
  for (let c = 0; c < s.nComp; c++) area[compLabel[c]] += compArea[c]
  const to = new Int32Array(s.palette.length + 1).map((_, i) => i)
  for (const [kk, len] of colorPair) {
    if (len < 3) continue
    const A = Math.floor(kk / 1000), B = kk % 1000
    if (area[A] >= area[B]) to[B] = A
    else to[A] = B
  }
  let changed = false
  for (let i = 0; i < w * h; i++) {
    const c = comp[i]
    if (!thin(c)) continue
    let L = label[i]
    let g = 0
    while (to[L] !== L && g++ < 10) L = to[L]
    if (L !== label[i]) { label[i] = L; changed = true }
  }
  if (changed) { computeDiag(s); components(s) }
}

/**
 * Franjas: regiões finas cuja cor é só a mistura das duas vizinhas (antialiasing ou chiado do JPEG).
 * Cada pixel da franja volta para a vizinha mais parecida com ele.
 */
function removeFringes(s: Segmentation, maxResid: number, nearDE = 0) {
  for (let round = 0; round < 2; round++) {
    const { w, h, comp, compLabel, compArea, lab, label } = s
    const T = s.transparent
    const per = new Int32Array(s.nComp)
    const nb = new Map<number, Map<number, number>>()
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, c = comp[i]
        const chk = (j: number) => {
          const d = comp[j]
          if (d === c) return
          per[c]++
          let m = nb.get(c)
          if (!m) nb.set(c, (m = new Map()))
          m.set(d, (m.get(d) || 0) + 1)
        }
        if (x > 0) chk(i - 1)
        if (x < w - 1) chk(i + 1)
        if (y > 0) chk(i - w)
        if (y < h - 1) chk(i + w)
      }
    const palLab = s.palette.map((p) => { const o = new Float32Array(3); rgbToLab(p[0], p[1], p[2], o, 0); return o })
    const reassign = new Map<number, [number, number]>() // comp -> [A, B] (labels)
    for (let c = 0; c < s.nComp; c++) {
      const L = compLabel[c]
      if (L === T || !per[c]) continue
      const thin = compArea[c] / per[c] < 0.9 // largura média < ~2 px
      if (!thin) continue
      const m = nb.get(c)
      if (!m) continue
      const top = [...m.entries()].filter(([d]) => compLabel[d] !== T && compLabel[d] !== L).sort((a, b) => b[1] - a[1]).slice(0, 3)
      let best: [number, number] | null = null, bestE = maxResid * maxResid
      const cl = palLab[L]
      for (let u = 0; u < top.length; u++)
        for (let v = u + 1; v < top.length; v++) {
          const A = compLabel[top[u][0]], B = compLabel[top[v][0]]
          if (A === B) continue
          const a = palLab[A], b = palLab[B]
          let num = 0, den = 0
          for (let k = 0; k < 3; k++) { const d = a[k] - b[k]; num += (cl[k] - b[k]) * d; den += d * d }
          const t = den > 1e-6 ? num / den : 0
          if (t < 0.08 || t > 0.92) continue
          let e = 0
          for (let k = 0; k < 3; k++) e += (cl[k] - (b[k] + t * (a[k] - b[k]))) ** 2
          if (e < bestE) { bestE = e; best = [A, B] }
        }
      if (best) { reassign.set(c, best); continue }
      // franja de JPEG: mesma claridade da vizinha, só com a cor desbotada
      if (nearDE > 0 && top.length) {
        const [d0] = top[0]
        const A = compLabel[d0]
        const e = Math.sqrt(dLab2(palLab[L], 0, palLab[A], 0))
        if (e < nearDE) {
          const B = top.length > 1 ? compLabel[top[1][0]] : A
          reassign.set(c, [A, B])
        }
      }
    }
    if (!reassign.size) return
    for (let i = 0; i < w * h; i++) {
      const r = reassign.get(comp[i])
      if (!r) continue
      const da = dLab2(lab, i * 3, palLab[r[0]], 0), db = dLab2(lab, i * 3, palLab[r[1]], 0)
      label[i] = da <= db ? r[0] : r[1]
    }
    computeDiag(s)
    components(s)
  }
}

/**
 * JPEG desbota a cor em bordas e detalhes pequenos, criando uma "cor" que é só uma variação rara de outra.
 * Se ela é parecida e bem menos comum que a vizinha de paleta, vira a vizinha.
 */
function absorbRareVariants(s: Segmentation, maxDE: number) {
  const K = s.palette.length
  const { w, h, label } = s
  const area = new Float64Array(K + 1)
  const edge = new Float64Array(K + 1) // pixels encostados em outra cor
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, l = label[i]
      area[l]++
      if ((x > 0 && label[i - 1] !== l) || (x < w - 1 && label[i + 1] !== l) || (y > 0 && label[i - w] !== l) || (y < h - 1 && label[i + w] !== l)) edge[l]++
    }
  const lab = s.palette.map((p) => { const o = new Float32Array(3); rgbToLab(p[0], p[1], p[2], o, 0); return o })
  const to = new Int32Array(K + 1).map((_, i) => i)
  const order = [...Array(K).keys()].sort((a, b) => area[a] - area[b])
  for (const k of order) {
    // variação de JPEG vive na borda; cor de verdade tem miolo
    if (!area[k] || edge[k] / area[k] < 0.55) continue
    let best = -1, bd = maxDE * maxDE
    for (let j = 0; j < K; j++) {
      if (j === k || to[j] !== j || area[j] < area[k] * 1.5) continue
      const d = dLab2(lab[k], 0, lab[j], 0)
      if (d < bd) { bd = d; best = j }
    }
    if (best >= 0) { to[k] = best; area[best] += area[k]; area[k] = 0 }
  }
  for (let i = 0; i < s.label.length; i++) {
    let l = s.label[i], g = 0
    while (l < K && to[l] !== l && g++ < K) l = to[l]
    s.label[i] = l
  }
}

/** Decide, em cada encontro diagonal, qual cor fica ligada (a menos frequente, normalmente traços finos). */
function computeDiag(s: Segmentation) {
  const { w, h, label, diag } = s
  const count = new Int32Array(s.palette.length + 1)
  for (let i = 0; i < label.length; i++) count[label[i]]++
  diag.fill(0)
  for (let y = 1; y < h; y++)
    for (let x = 1; x < w; x++) {
      const tl = label[(y - 1) * w + x - 1], tr = label[(y - 1) * w + x]
      const bl = label[y * w + x - 1], br = label[y * w + x]
      const d1 = tl === br && tl !== tr && tl !== bl
      const d2 = tr === bl && tr !== tl && tr !== br
      if (d1 && d2) diag[y * (w + 1) + x] = count[tl] <= count[tr] ? 1 : 2
      else if (d1) diag[y * (w + 1) + x] = 1
      else if (d2) diag[y * (w + 1) + x] = 2
    }
}

function components(s: Segmentation) {
  const { w, h, label, comp, diag } = s
  comp.fill(-1)
  const areas: number[] = [], labs: number[] = []
  const stack = new Int32Array(w * h)
  let nc = 0
  for (let start = 0; start < w * h; start++) {
    if (comp[start] >= 0) continue
    const L = label[start]
    let sp = 0, area = 0
    stack[sp++] = start
    comp[start] = nc
    while (sp) {
      const i = stack[--sp]
      area++
      const x = i % w, y = (i - x) / w
      const push = (j: number) => { if (comp[j] < 0 && label[j] === L) { comp[j] = nc; stack[sp++] = j } }
      if (x > 0) push(i - 1)
      if (x < w - 1) push(i + 1)
      if (y > 0) push(i - w)
      if (y < h - 1) push(i + w)
      // diagonais ligadas
      if (x > 0 && y > 0 && diag[y * (w + 1) + x] === 1) push(i - w - 1)
      if (x < w - 1 && y < h - 1 && diag[(y + 1) * (w + 1) + x + 1] === 1) push(i + w + 1)
      if (x < w - 1 && y > 0 && diag[y * (w + 1) + x + 1] === 2) push(i - w + 1)
      if (x > 0 && y < h - 1 && diag[(y + 1) * (w + 1) + x] === 2) push(i + w - 1)
    }
    areas.push(area); labs.push(L)
    nc++
  }
  s.nComp = nc
  s.compArea = Int32Array.from(areas)
  s.compLabel = Int32Array.from(labs)
}

/** Manchas menores que a área mínima são absorvidas pelo vizinho com quem mais fazem fronteira. */
function mergeSpecks(s: Segmentation, minArea: number) {
  for (let round = 0; round < 4; round++) {
    const { w, h, comp, compArea, compLabel, label, lab } = s
    const small: number[] = []
    for (let c = 0; c < s.nComp; c++) if (compArea[c] < minArea) small.push(c)
    if (!small.length) return
    // fronteiras de cada mancha pequena
    const isSmall = new Uint8Array(s.nComp)
    for (const c of small) isSmall[c] = 1
    const border = new Map<number, Map<number, number>>()
    const colorSum = new Map<number, number[]>()
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, c = comp[i]
        if (!isSmall[c]) continue
        let cs = colorSum.get(c)
        if (!cs) colorSum.set(c, (cs = [0, 0, 0, 0]))
        cs[0] += lab[i * 3]; cs[1] += lab[i * 3 + 1]; cs[2] += lab[i * 3 + 2]; cs[3]++
        let m = border.get(c)
        if (!m) border.set(c, (m = new Map()))
        const add = (j: number) => { const d = comp[j]; if (d !== c) m!.set(d, (m!.get(d) || 0) + 1) }
        if (x > 0) add(i - 1)
        if (x < w - 1) add(i + 1)
        if (y > 0) add(i - w)
        if (y < h - 1) add(i + w)
      }
    const target = new Int32Array(s.nComp).map((_, i) => i)
    const T = s.transparent
    const palLab = new Float32Array(3)
    small.sort((a, b) => compArea[a] - compArea[b])
    let changed = false
    for (const c of small) {
      const m = border.get(c)
      if (!m || !m.size) continue
      const cs = colorSum.get(c)!
      const mean = [cs[0] / cs[3], cs[1] / cs[3], cs[2] / cs[3]]
      let best = -1, bs = -Infinity
      for (const [d, len] of m) {
        let r = d
        while (target[r] !== r) r = target[r]
        if (r === c) continue
        const L = compLabel[r]
        let colorPenalty = 0
        if (L !== T) {
          const p = s.palette[L]
          rgbToLab(p[0], p[1], p[2], palLab, 0)
          colorPenalty = Math.sqrt((mean[0] - palLab[0]) ** 2 + (mean[1] - palLab[1]) ** 2 + (mean[2] - palLab[2]) ** 2)
        } else colorPenalty = 40
        const score = len * 4 - colorPenalty
        if (score > bs) { bs = score; best = r }
      }
      if (best >= 0) { target[c] = best; compArea[best] += compArea[c]; changed = true }
    }
    if (!changed) return
    for (let i = 0; i < w * h; i++) {
      let r = comp[i]
      while (target[r] !== r) r = target[r]
      label[i] = compLabel[r]
    }
    computeDiag(s)
    components(s)
  }
}
