import type { Segmentation } from './segment.ts'

/**
 * Mapa planar: cada fronteira entre duas regiões vira UMA cadeia, compartilhada pelas duas.
 * Assim as regiões vizinhas usam exatamente a mesma curva e não sobra fresta.
 *
 * Arestas da grade:
 *   horizontal (x,y), 0<=x<w, 0<=y<=h  -> id = y*w + x            (entre pixel (x,y-1) e (x,y))
 *   vertical   (x,y), 0<=x<=w, 0<=y<h  -> id = H + y*(w+1) + x    (entre pixel (x-1,y) e (x,y))
 * Direções: 0:+x 1:+y 2:-x 3:-y. "Esquerda" de quem anda = (dy, -dx) em coordenadas com y para baixo.
 */

export interface Chain {
  /** arestas não direcionadas, na ordem da cadeia */
  edges: Int32Array
  /** +1/-1: sentido de cada aresta nesta cadeia */
  signs: Int8Array
  /** vértice inicial (índice da grade (w+1)) */
  startV: number
  endV: number
  closed: boolean
  left: number // componente à esquerda
  right: number // componente à direita (-1 = fora da imagem)
}

export interface LoopRef { chain: number; reversed: boolean }
export interface Loop { refs: LoopRef[]; area: number; outer: boolean }

export interface Trace {
  chains: Chain[]
  /** laços de cada componente */
  loops: Loop[][]
  H: number
}

export function trace(seg: Segmentation, onProgress?: (f: number) => void): Trace {
  const { w, h, comp, diag } = seg
  const W1 = w + 1
  const H = w * (h + 1)
  const nE = H + W1 * h
  const pc = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : comp[y * w + x])

  // pixel à esquerda / direita de uma aresta direcionada
  const leftPix = (x: number, y: number, d: number) =>
    d === 0 ? pc(x, y - 1) : d === 1 ? pc(x, y) : d === 2 ? pc(x - 1, y) : pc(x - 1, y - 1)
  const rightPix = (x: number, y: number, d: number) =>
    d === 0 ? pc(x, y) : d === 1 ? pc(x - 1, y) : d === 2 ? pc(x - 1, y - 1) : pc(x, y - 1)
  const edgeOf = (x: number, y: number, d: number) =>
    d === 0 ? (x < w ? y * w + x : -1)
      : d === 2 ? (x > 0 ? y * w + x - 1 : -1)
        : d === 1 ? (y < h ? H + y * W1 + x : -1)
          : (y > 0 ? H + (y - 1) * W1 + x : -1)
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]

  // grau de cada vértice (quantas arestas de fronteira chegam nele)
  const deg = new Uint8Array(W1 * (h + 1))
  const isB = new Uint8Array(nE)
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < w; x++) {
      if (pc(x, y - 1) !== pc(x, y)) {
        isB[y * w + x] = 1
        deg[y * W1 + x]++; deg[y * W1 + x + 1]++
      }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x <= w; x++) {
      if (pc(x - 1, y) !== pc(x, y)) {
        isB[H + y * W1 + x] = 1
        deg[y * W1 + x]++; deg[(y + 1) * W1 + x]++
      }
    }
  const isJ = (v: number) => deg[v] >= 3

  const visited = new Uint8Array(nE) // bit1: + percorrida, bit2: - percorrida
  const chainOf = new Int32Array(nE).fill(-1)
  const chainSign = new Int8Array(nE)
  const chains: Chain[] = []
  const loops: Loop[][] = Array.from({ length: seg.nComp }, () => [])

  const dirs: number[] = [] // reutilizado
  const verts: number[] = []

  const traceFrom = (sx: number, sy: number, sd: number, R: number) => {
    dirs.length = 0; verts.length = 0
    let x = sx, y = sy, d = sd
    let area2 = 0
    for (let guard = 0; guard < nE * 2 + 8; guard++) {
      const e = edgeOf(x, y, d)
      const sgn = d === 0 || d === 1 ? 1 : 2
      visited[e] |= sgn
      dirs.push(d); verts.push(y * W1 + x)
      const nx = x + DX[d], ny = y + DY[d]
      area2 += x * ny - nx * y
      x = nx; y = ny
      // próxima direção
      const v = y * W1 + x
      let order: number[]
      const dg = diag[v]
      let diagMine = false
      if (dg) {
        if (dg === 1) diagMine = pc(x - 1, y - 1) === R && pc(x, y) === R
        else diagMine = pc(x, y - 1) === R && pc(x - 1, y) === R
      }
      const L = (d + 3) & 3, S = d, Rt = (d + 1) & 3
      order = diagMine ? [Rt, S, L] : [L, S, Rt]
      let nd = -1
      for (const c of order) {
        if (edgeOf(x, y, c) < 0) continue
        if (leftPix(x, y, c) === R && rightPix(x, y, c) !== R) { nd = c; break }
      }
      if (nd < 0) break // não deveria acontecer
      d = nd
      if (x === sx && y === sy && d === sd) break
    }
    return area2 / 2
  }

  const register = (R: number, area: number) => {
    const n = dirs.length
    // começa num vértice de junção, se houver
    let s = -1
    for (let i = 0; i < n; i++) if (isJ(verts[i])) { s = i; break }
    const refs: LoopRef[] = []
    const pieces: number[][] = []
    if (s < 0) pieces.push(Array.from({ length: n }, (_, i) => i))
    else {
      let cur: number[] = []
      for (let k = 0; k < n; k++) {
        const i = (s + k) % n
        if (k > 0 && isJ(verts[i])) { pieces.push(cur); cur = [] }
        cur.push(i)
      }
      pieces.push(cur)
    }
    for (const p of pieces) {
      const i0 = p[0]
      const d0 = dirs[i0]
      const vx = verts[i0] % W1, vy = (verts[i0] - vx) / W1
      const e0 = edgeOf(vx, vy, d0)
      const s0 = d0 === 0 || d0 === 1 ? 1 : -1
      const existing = chainOf[e0]
      if (existing >= 0) {
        refs.push({ chain: existing, reversed: chainSign[e0] !== s0 })
        continue
      }
      const id = chains.length
      const edges = new Int32Array(p.length)
      const signs = new Int8Array(p.length)
      for (let k = 0; k < p.length; k++) {
        const i = p[k]
        const vx2 = verts[i] % W1, vy2 = (verts[i] - vx2) / W1
        const e = edgeOf(vx2, vy2, dirs[i])
        edges[k] = e
        signs[k] = dirs[i] === 0 || dirs[i] === 1 ? 1 : -1
        chainOf[e] = id
        chainSign[e] = signs[k]
      }
      const last = p[p.length - 1]
      const lx = verts[last] % W1, ly = (verts[last] - lx) / W1
      const endV = (ly + DY[dirs[last]]) * W1 + lx + DX[dirs[last]]
      chains.push({
        edges, signs, startV: verts[i0], endV,
        closed: s < 0,
        left: R,
        right: rightPix(vx, vy, d0),
      })
      refs.push({ chain: id, reversed: false })
    }
    // y para baixo: contorno externo tem área negativa
    loops[R].push({ refs, area: Math.abs(area), outer: area < 0 })
  }

  let lastReport = 0
  for (let e = 0; e < nE; e++) {
    if (!isB[e]) continue
    if (onProgress && e - lastReport > 50000) { lastReport = e; onProgress(e / nE) }
    let x: number, y: number
    if (e < H) { x = e % w; y = (e - x) / w } else { const r = e - H; x = r % W1; y = (r - x) / W1 }
    // lado "+": percorre na direção positiva
    const dPlus = e < H ? 0 : 1
    const dMinus = e < H ? 2 : 3
    if (!(visited[e] & 1)) {
      const R = leftPix(x, y, dPlus)
      if (R >= 0) { const a = traceFrom(x, y, dPlus, R); register(R, a) } else visited[e] |= 1
    }
    if (!(visited[e] & 2)) {
      const sx = x + DX[dPlus], sy = y + DY[dPlus]
      const R = leftPix(sx, sy, dMinus)
      if (R >= 0) { const a = traceFrom(sx, sy, dMinus, R); register(R, a) } else visited[e] |= 2
    }
  }
  return { chains, loops, H }
}
