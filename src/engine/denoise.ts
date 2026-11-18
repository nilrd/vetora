import { rgbToLab } from './color.ts'

/** Sombras e textura distribuídas pela imagem, em vez de apenas antialiasing nas bordas. */
export function hasContinuousTones(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): boolean {
  // Em imagens pequenas, blocos JPEG ocupam uma fração grande da arte e imitam textura.
  // Nelas, o modo Foto explícito permite preservar tons sem mudar o tratamento de logos.
  if (w * h <= 360000) return false
  const step = Math.max(1, Math.ceil(Math.sqrt(w * h / 60000)))
  const bins = new Set<number>()
  let count = 0, subtle = 0, edges = 0, broad = 0
  for (let y = 4; y < h - 4; y += step) {
    for (let x = 4; x < w - 4; x += step) {
      const i = y * w + x
      if (rgba[i * 4 + 3] < 250) continue
      count++
      bins.add((rgba[i * 4] >> 4) * 256 + (rgba[i * 4 + 1] >> 4) * 16 + (rgba[i * 4 + 2] >> 4))
      let variation = 0
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        let difference = 0
        for (let c = 0; c < 3; c++) difference += Math.abs(rgba[i * 4 + c] - rgba[j * 4 + c])
        variation = Math.max(variation, difference)
      }
      if (variation >= 6 && variation < 60) subtle++
      else if (variation >= 60) edges++
      if (variation >= 6 && variation < 30) {
        let spread = 0
        for (const j of [i - 4, i + 4, i - 4 * w, i + 4 * w]) {
          let difference = 0
          for (let c = 0; c < 3; c++) difference += Math.abs(rgba[i * 4 + c] - rgba[j * 4 + c])
          spread = Math.max(spread, difference)
        }
        if (spread >= 12 && spread < 60) broad++
      }
    }
  }
  return bins.size >= 64 && subtle > count * 0.12 && edges > count * 0.08 && broad > count * 0.04
}

/**
 * Mede o ruído da imagem (típico de JPEG): fração de pixels com variação pequena, mas não zero,
 * em relação aos vizinhos. PNG limpo dá perto de 0; JPEG dá bem mais.
 */
export function noiseLevel(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): number {
  let flat = 0, noisy = 0
  const step = Math.max(1, Math.floor((w * h) / 120000))
  for (let i = w + 1; i < w * h - w - 1; i += step) {
    let m = 0
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      const d = Math.abs(rgba[i * 4] - rgba[j * 4]) + Math.abs(rgba[i * 4 + 1] - rgba[j * 4 + 1]) + Math.abs(rgba[i * 4 + 2] - rgba[j * 4 + 2])
      if (d > m) m = d
    }
    if (m === 0) flat++
    else if (m < 24) noisy++
  }
  return noisy / Math.max(1, flat + noisy)
}

/** Amplia 2x com interpolação bicúbica (Catmull-Rom). Dá mais pixels para o ajuste das curvas em imagens pequenas. */
export function upscale2x(src: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8ClampedArray {
  const W = w * 2, H = h * 2
  const out = new Uint8ClampedArray(W * H * 4)
  const cub = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  const px = (x: number, y: number, c: number) => {
    x = x < 0 ? 0 : x >= w ? w - 1 : x
    y = y < 0 ? 0 : y >= h ? h - 1 : y
    return src[(y * w + x) * 4 + c]
  }
  const col = new Float64Array(4)
  for (let Y = 0; Y < H; Y++) {
    const sy = (Y + 0.5) / 2 - 0.5, y0 = Math.floor(sy), ty = sy - y0
    for (let X = 0; X < W; X++) {
      const sx = (X + 0.5) / 2 - 0.5, x0 = Math.floor(sx), tx = sx - x0
      for (let c = 0; c < 4; c++) {
        for (let k = -1; k <= 2; k++) col[k + 1] = cub(px(x0 - 1, y0 + k, c), px(x0, y0 + k, c), px(x0 + 1, y0 + k, c), px(x0 + 2, y0 + k, c), tx)
        // sem "passar do ponto" (overshoot): fica entre o menor e o maior dos 4 pixels vizinhos,
        // senão a borda ganha um anel de cor nova que vira forma extra
        const a = px(x0, y0, c), b = px(x0 + 1, y0, c), d = px(x0, y0 + 1, c), e = px(x0 + 1, y0 + 1, c)
        const lo = Math.min(a, b, d, e), hi = Math.max(a, b, d, e)
        const v = cub(col[0], col[1], col[2], col[3], ty)
        out[(Y * W + X) * 4 + c] = v < lo ? lo : v > hi ? hi : v
      }
    }
  }
  return out
}

/**
 * Filtro sigma (preserva bordas): cada pixel vira a média dos vizinhos parecidos com ele.
 * Remove o chiado do JPEG sem borrar a fronteira entre duas cores.
 */
export function denoise(src: Uint8ClampedArray | Uint8Array, w: number, h: number, passes = 2, radius = 2, sigma = 14): Uint8ClampedArray {
  let a = new Uint8ClampedArray(src)
  const lab = new Float32Array(w * h * 3)
  const s2 = sigma * sigma
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < w * h; i++) rgbToLab(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], lab, i * 3)
    const b = new Uint8ClampedArray(a)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        let r = 0, g = 0, bl = 0, al = 0, n = 0
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            const j = yy * w + xx
            const d = (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2
            if (d > s2) continue
            r += a[j * 4]; g += a[j * 4 + 1]; bl += a[j * 4 + 2]; al += a[j * 4 + 3]; n++
          }
        }
        b[i * 4] = r / n; b[i * 4 + 1] = g / n; b[i * 4 + 2] = bl / n; b[i * 4 + 3] = al / n
      }
    a = b
  }
  return a
}

/**
 * Suavidade das bordas: entre dois pixels bem diferentes a 2 px de distância, quantos têm o do meio
 * intermediário. Borda nítida (PNG, JPEG comum) fica em ~0,4–0,5; imagem borrada passa de 0,65.
 */
export function edgeSoftness(a: Uint8ClampedArray | Uint8Array, w: number, h: number): number {
  let edges = 0, soft = 0
  const step = Math.max(1, Math.floor((w * h) / 400000))
  for (let y = 1; y < h - 1; y += step)
    for (let x = 1; x < w - 2; x++) {
      const i = (y * w + x) * 4, j = i + 4, k = i + 8
      const dd = Math.abs(a[i] - a[k]) + Math.abs(a[i + 1] - a[k + 1]) + Math.abs(a[i + 2] - a[k + 2])
      if (dd <= 90) continue
      const d1 = Math.abs(a[i] - a[j]) + Math.abs(a[i + 1] - a[j + 1]) + Math.abs(a[i + 2] - a[j + 2])
      const d2 = Math.abs(a[j] - a[k]) + Math.abs(a[j + 1] - a[k + 1]) + Math.abs(a[j + 2] - a[k + 2])
      edges++
      if (d1 > dd * 0.25 && d2 > dd * 0.25) soft++
    }
  return edges ? soft / edges : 0
}

/**
 * Quanto a imagem mostra a grade 8×8 do JPEG: diferença média entre vizinhos nas costuras dos blocos
 * (x ou y múltiplo de 8) dividida pela diferença média dentro dos blocos. Só conta diferenças pequenas
 * (as grandes são bordas do desenho). Sem grade ≈ 1; JPEG forte passa de 1,3.
 */
export function jpegBlockiness(a: Uint8ClampedArray | Uint8Array, w: number, h: number): number {
  if (w < 32 || h < 32) return 1
  let seam = 0, nSeam = 0, inner = 0, nInner = 0
  const step = Math.max(1, Math.floor(h / 300))
  const lum = (i: number) => a[i * 4] * 0.299 + a[i * 4 + 1] * 0.587 + a[i * 4 + 2] * 0.114
  for (let y = 0; y < h; y += step)
    for (let x = 1; x < w; x++) {
      const i = y * w + x
      if (a[i * 4 + 3] < 250 || a[(i - 1) * 4 + 3] < 250) continue
      const d = Math.abs(lum(i) - lum(i - 1))
      if (d > 20) continue
      if (x % 8 === 0) { seam += d; nSeam++ } else { inner += d; nInner++ }
    }
  if (nSeam < 200 || nInner < 200) return 1
  const ins = inner / nInner
  return ins < 0.3 ? 1 : seam / nSeam / ins
}

/**
 * Tira os "quadradinhos" do JPEG: em cada costura da grade 8×8, se o degrau entre os dois lados é
 * pequeno (não é uma borda do desenho) e cada lado é liso, espalha o degrau pelos 4 pixels em volta.
 * Bordas de verdade (degrau grande ou lado com textura) ficam como estão.
 */
export function deblock(src: Uint8ClampedArray | Uint8Array, w: number, h: number, maxStep = 22, passes = 2): Uint8ClampedArray {
  const a = new Uint8ClampedArray(src)
  const flat = 6 // variação máxima dentro de cada lado para considerar "liso"
  const fix = (i0: number, i1: number, i2: number, i3: number) => {
    // i0 i1 | i2 i3  (a costura fica entre i1 e i2)
    if (a[i0 * 4 + 3] < 250 || a[i3 * 4 + 3] < 250) return
    // os três canais decidem juntos (senão um canal suaviza e outro não, e a cor desvia)
    for (let c = 0; c < 3; c++) {
      const p0 = a[i0 * 4 + c], p1 = a[i1 * 4 + c], q0 = a[i2 * 4 + c], q1 = a[i3 * 4 + c]
      if (Math.abs(q0 - p1) > maxStep || Math.abs(p1 - p0) > flat || Math.abs(q1 - q0) > flat) return
    }
    for (let c = 0; c < 3; c++) {
      const p0 = a[i0 * 4 + c], p1 = a[i1 * 4 + c], q0 = a[i2 * 4 + c], q1 = a[i3 * 4 + c]
      const step = q0 - p1
      a[i0 * 4 + c] = p0 + step / 8
      a[i1 * 4 + c] = p1 + (step * 3) / 8
      a[i2 * 4 + c] = q0 - (step * 3) / 8
      a[i3 * 4 + c] = q1 - step / 8
    }
  }
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 8; x < w - 1; x += 8) { const i = y * w + x; fix(i - 2, i - 1, i, i + 1) }
    for (let y = 8; y < h - 1; y += 8) for (let x = 0; x < w; x++) { const i = y * w + x; fix(i - 2 * w, i - w, i, i + w) }
  }
  return a
}
