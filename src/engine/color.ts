import type { RGB } from './types.ts'

const LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function f(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

/** sRGB 0..255 -> Lab (D65) */
export function rgbToLab(r: number, g: number, b: number, out: Float32Array | number[], o = 0) {
  const R = LIN[r], G = LIN[g], B = LIN[b]
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const fx = f(X), fy = f(Y), fz = f(Z)
  out[o] = 116 * fy - 16
  out[o + 1] = 500 * (fx - fy)
  out[o + 2] = 200 * (fy - fz)
}

export function labToRgb(L: number, a: number, b: number): RGB {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787)
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883
  const R = X * 3.2406 - Y * 1.5372 - Z * 0.4986
  const G = -X * 0.9689 + Y * 1.8758 + Z * 0.0415
  const B = X * 0.0557 - Y * 0.204 + Z * 1.057
  const g = (c: number) => {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(c * 255)))
  }
  return [g(R), g(G), g(B)]
}

export function hex(c: RGB) {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function parseHex(h: string): RGB {
  const s = h.replace('#', '')
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function dLab2(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number) {
  const d0 = a[ao] - b[bo], d1 = a[ao + 1] - b[bo + 1], d2 = a[ao + 2] - b[bo + 2]
  return d0 * d0 + d1 * d1 + d2 * d2
}
