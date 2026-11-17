import { describe, expect, it } from 'vitest'
import { fitChain } from './fit.ts'
import { segment } from './segment.ts'
import { hasContinuousTones } from './denoise.ts'
import { buildPdf, buildEps, defaultExport } from '../lib/export.ts'
import { vectorize } from './index.ts'

describe('preservação de detalhes', () => {
  it('reconstrói um polígono com lados curtos e cantos agudos sem pequenas curvas', () => {
    const vertices = [[220, 20], [40, 20], [40, 49], [150, 49], [120, 77], [145, 95]]
    const points: number[] = []
    for (let k = 0; k < vertices.length; k++) {
      const a = vertices[k], b = vertices[(k + 1) % vertices.length]
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (let j = 0; j < Math.ceil(length); j++) {
        const t = j / Math.ceil(length), jitter = Math.sin(j * 1.7) * 0.15
        points.push(a[0] + (b[0] - a[0]) * t + jitter, a[1] + (b[1] - a[1]) * t - jitter)
      }
    }
    const curve = fitChain(new Float64Array(points), true, {
      tolerance: 0.5, cornerAngle: 52, smooth: 0.5, primitives: true, scale: 1,
    }, true)
    expect(curve.segs).toHaveLength(vertices.length)
    expect(curve.segs.every(s => s.t === 'L')).toBe(true)
    for (const [x, y] of vertices) {
      expect(curve.segs.some(s => Math.hypot(s.x - x, s.y - y) < 1)).toBe(true)
    }
  })

  it('preserva marcas pequenas contrastantes no tratamento de tons contínuos', () => {
    const width = 32, height = 32
    const rgba = new Uint8Array(width * height * 4).fill(255)
    const mark = 16 * width + 16
    rgba[mark * 4] = rgba[mark * 4 + 1] = rgba[mark * 4 + 2] = 0
    const result = segment({ rgba, w: width, h: height, maxColors: 2,
      palette: [[255, 255, 255], [0, 0, 0]], mergeDist: 11, minArea: 5, photo: true })
    expect(result.label[mark]).not.toBe(result.label[0])
    expect(result.compArea[result.comp[mark]]).toBe(1)
  })

  it('mantém a estratégia de logos para imagens pequenas e para arte chapada grande', () => {
    expect(hasContinuousTones(new Uint8Array(32 * 32 * 4).fill(255), 32, 32)).toBe(false)
    const rgba = new Uint8Array(640 * 640 * 4).fill(255)
    for (let y = 100; y < 500; y++) for (let x = 100; x < 500; x++) {
      const i = (y * 640 + x) * 4
      rgba[i] = 200; rgba[i + 1] = 30; rgba[i + 2] = 60
    }
    expect(hasContinuousTones(rgba, 640, 640)).toBe(false)
  })

  it('aplica o fechamento de frestas no PDF e EPS apenas quando habilitado para preenchimento', () => {
    const rgba = new Uint8Array(16 * 16 * 4).fill(255)
    const result = vectorize({ rgba, width: 16, height: 16 })
    for (const gapFiller of [true, false]) {
      const options = { ...defaultExport, gapFiller }
      const pdf = new TextDecoder().decode(buildPdf(result, options, new Set()))
      const eps = buildEps(result, options, new Set())
      expect(pdf.includes('0.5 w 1 j')).toBe(gapFiller)
      expect(eps.includes('0.5 setlinewidth 1 setlinejoin')).toBe(gapFiller)
      const cutPdf = new TextDecoder().decode(buildPdf(result, { ...options, preset: 'cut' }, new Set()))
      expect(cutPdf.includes('0.5 w 1 j')).toBe(false)
    }
  })
})
