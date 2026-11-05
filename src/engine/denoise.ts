import { rgbToLab } from './color.ts'

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
        out[(Y * W + X) * 4 + c] = cub(col[0], col[1], col[2], col[3], ty)
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
