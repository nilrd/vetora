import type { Segmentation } from './segment.ts'
import type { Chain } from './trace.ts'

/**
 * Pontos de uma cadeia com precisão sub-pixel.
 * Cada aresta da escada vira um ponto no meio dela, empurrado para a posição real da borda
 * usando o antialiasing da imagem original (quanto de cada cor existe nos pixels dos dois lados).
 */
export function chainPoints(
  ch: Chain, seg: Segmentation, rgba: Uint8ClampedArray | Uint8Array, H: number, useSubpixel: boolean,
): Float64Array {
  const { w, h, comp, compLabel, palette, transparent } = seg
  const W1 = w + 1
  const n = ch.edges.length
  const extra = ch.closed ? 0 : 2
  const out = new Float64Array((n + extra) * 2)
  let o = 0
  if (!ch.closed) { out[o++] = ch.startV % W1; out[o++] = Math.floor(ch.startV / W1) }

  const pcomp = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : comp[y * w + x])

  // meio de cada aresta (sem deslocamento) para estimar a direção local da borda
  const mids = new Float64Array(n * 2)
  const isH = new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    const e = ch.edges[k]
    if (e < H) { const x = e % w, y = (e - x) / w; mids[k * 2] = x + 0.5; mids[k * 2 + 1] = y; isH[k] = 1 }
    else { const r = e - H, x = r % W1, y = (r - x) / W1; mids[k * 2] = x; mids[k * 2 + 1] = y + 0.5 }
  }
  const midAt = (k: number) => {
    if (ch.closed) k = ((k % n) + n) % n
    else k = Math.max(0, Math.min(n - 1, k))
    return k
  }
  /** degrau: aresta cuja normal aponta ao longo da borda (a medição de antialiasing ali não vale) */
  const isJog = (k: number) => {
    if (n < 5) return false
    const a = midAt(k - 3), b = midAt(k + 3)
    const tx = mids[b * 2] - mids[a * 2], ty = mids[b * 2 + 1] - mids[a * 2 + 1]
    const L = Math.hypot(tx, ty)
    if (L < 2.5) return false
    // normal da aresta: horizontal -> (0,1); vertical -> (1,0)
    const along = isH[k] ? Math.abs(ty) / L : Math.abs(tx) / L
    return along > 0.8
  }
  const keep: number[] = []

  for (let k = 0; k < n; k++) {
    const e = ch.edges[k], sg = ch.signs[k]
    let mx: number, my: number, nx: number, ny: number // meio da aresta e normal (da esquerda para a direita)
    let lx: number, ly: number, rx: number, ry: number // pixel esquerdo / direito
    if (e < H) {
      const x = e % w, y = (e - x) / w
      mx = x + 0.5; my = y
      // indo +x: esquerda = (x,y-1), direita = (x,y)
      if (sg > 0) { lx = x; ly = y - 1; rx = x; ry = y; nx = 0; ny = 1 } else { lx = x; ly = y; rx = x; ry = y - 1; nx = 0; ny = -1 }
    } else {
      const r = e - H, x = r % W1, y = (r - x) / W1
      mx = x; my = y + 0.5
      // indo +y: esquerda = (x,y), direita = (x-1,y)
      if (sg > 0) { lx = x; ly = y; rx = x - 1; ry = y; nx = -1; ny = 0 } else { lx = x - 1; ly = y; rx = x; ry = y; nx = 1; ny = 0 }
    }
    let off = 0
    if (useSubpixel) {
      if (isJog(k)) continue
      const A = pcomp(lx, ly), B = pcomp(rx, ry)
      if (A >= 0 && B >= 0) off = edgeOffset(A, B, lx, ly, rx, ry, nx, ny)
    }
    out[o++] = mx + nx * off
    out[o++] = my + ny * off
    keep.push(k)
  }
  if (!ch.closed) { out[o++] = ch.endV % W1; out[o++] = Math.floor(ch.endV / W1) }
  return out.slice(0, o)

  function edgeOffset(A: number, B: number, ax: number, ay: number, bx: number, by: number, nx: number, ny: number) {
    const la = compLabel[A], lb = compLabel[B]
    let cov: (i: number) => number
    if (la === transparent || lb === transparent) {
      const aOpaque = la !== transparent
      cov = (i: number) => (aOpaque ? rgba[i * 4 + 3] / 255 : 1 - rgba[i * 4 + 3] / 255)
    } else {
      const ca = palette[la], cb = palette[lb]
      const d0 = ca[0] - cb[0], d1 = ca[1] - cb[1], d2 = ca[2] - cb[2]
      const den = d0 * d0 + d1 * d1 + d2 * d2
      if (den < 900) return 0 // cores parecidas demais: o antialiasing não é confiável
      cov = (i: number) => {
        const t = ((rgba[i * 4] - cb[0]) * d0 + (rgba[i * 4 + 1] - cb[1]) * d1 + (rgba[i * 4 + 2] - cb[2]) * d2) / den
        return t < 0 ? 0 : t > 1 ? 1 : t
      }
    }
    // lado A (atrás): pixel A e, se for da mesma região, mais um
    let s = 0
    const ia = ay * w + ax, ib = by * w + bx
    const a2x = ax - nx, a2y = ay - ny, b2x = bx + nx, b2y = by + ny
    const a2 = pcomp(a2x, a2y), b2 = pcomp(b2x, b2y)
    const a3 = pcomp(a2x - nx, a2y - ny), b3 = pcomp(b2x + nx, b2y + ny)
    const covA = cov(ia) - 1
    const covB = cov(ib)
    // profundidade da região de cada lado: 1 px (traço fino) divide a falta com a outra borda;
    // 2 px usa só o pixel vizinho (o outro pertence à borda de lá); 3+ usa dois pixels
    if (a2 !== A) s += covA * 0.5
    else if (a3 !== A) s += covA
    else s += covA + (cov(a2y * w + a2x) - 1)
    if (b2 !== B) s += covB * 0.5
    else if (b3 !== B) s += covB
    else s += covB + cov(b2y * w + b2x)
    // positivo = A avança sobre B (na direção da normal)
    if (s > 0.75) s = 0.75
    if (s < -0.75) s = -0.75
    return s
  }
}
