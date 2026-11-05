import { describe, it, expect } from 'vitest'
import { segment } from './segment.ts'
import { trace } from './trace.ts'
import { vectorize } from './index.ts'
import { toSvg } from './svg.ts'
import { parseD, buildDxf, buildPdf, defaultExport } from '../lib/export.ts'

/** Imagem sintética: fundo branco, quadrado vermelho com furo azul, e um disco verde (com antialiasing). */
function synth(w = 64, h = 64) {
  const a = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let c = [255, 255, 255]
      if (x >= 6 && x < 30 && y >= 6 && y < 30) c = [220, 30, 30]
      if (x >= 14 && x < 22 && y >= 14 && y < 22) c = [20, 40, 200]
      // disco com cobertura (antialiasing) por amostragem 4x4
      let cov = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4
        if ((px - 45) ** 2 + (py - 45) ** 2 < 12 ** 2) cov++
      }
      cov /= 16
      const g = [30, 160, 90]
      a[i] = Math.round(c[0] * (1 - cov) + g[0] * cov)
      a[i + 1] = Math.round(c[1] * (1 - cov) + g[1] * cov)
      a[i + 2] = Math.round(c[2] * (1 - cov) + g[2] * cov)
      a[i + 3] = 255
    }
  return a
}

describe('motor', () => {
  it('acha exatamente as cores da imagem (o antialiasing não vira cor nova)', () => {
    const r = vectorize({ rgba: synth(), width: 64, height: 64 })
    const used = [...new Set(r.shapes.map((s) => s.colorIndex))].map((i) => r.palette[i])
    expect(used.length).toBe(4)
    for (const target of [[255, 255, 255], [220, 30, 30], [20, 40, 200], [30, 160, 90]]) {
      expect(used.some((c) => c.every((v, k) => Math.abs(v - target[k]) <= 3))).toBe(true)
    }
  })

  it('mapa planar: cada fronteira interna é usada pelas duas regiões vizinhas (sem frestas)', () => {
    const seg = segment({ rgba: synth(), w: 64, h: 64, maxColors: 0, mergeDist: 11, minArea: 3, photo: false })
    const tr = trace(seg)
    const uses = new Map<number, number>()
    tr.loops.forEach((ls) => ls.forEach((l) => l.refs.forEach((r) => uses.set(r.chain, (uses.get(r.chain) || 0) + 1))))
    tr.chains.forEach((ch, i) => {
      const expected = ch.right < 0 ? 1 : 2
      expect(uses.get(i)).toBe(expected)
    })
    // toda região tem exatamente um contorno externo
    tr.loops.forEach((ls) => expect(ls.filter((l) => l.outer).length).toBe(1))
  })

  it('o disco vira um círculo de verdade', () => {
    const r = vectorize({ rgba: synth(), width: 64, height: 64 })
    const green = r.shapes.find((s) => s.color[1] > 140 && s.color[0] < 60)!
    const cmds = parseD(green.d)
    expect(cmds.filter((c) => c.c === 'C').length).toBe(4)
    // raio ~12 e centro ~(45,45)
    const xs = cmds.filter((c) => c.c !== 'Z').map((c) => c.v[c.v.length - 2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(23)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(25)
  })

  it('cantos do quadrado ficam vivos e no lugar', () => {
    const r = vectorize({ rgba: synth(), width: 64, height: 64 })
    const red = r.shapes.find((s) => s.color[0] > 200 && s.color[1] < 60)!
    const pts = parseD(red.d).filter((c) => c.c !== 'Z').map((c) => [c.v[c.v.length - 2], c.v[c.v.length - 1]])
    for (const corner of [[6, 6], [30, 6], [30, 30], [6, 30]]) {
      expect(pts.some(([x, y]) => Math.hypot(x - corner[0], y - corner[1]) < 0.6)).toBe(true)
    }
  })

  it('fundo transparente não vira forma', () => {
    const a = synth()
    for (let i = 0; i < 64 * 64; i++) if (a[i * 4] === 255 && a[i * 4 + 1] === 255) a[i * 4 + 3] = 0
    const r = vectorize({ rgba: a, width: 64, height: 64 })
    expect(r.shapes.some((s) => s.color.every((v) => v > 250))).toBe(false)
  })

  it('remover fundo tira a cor da borda', () => {
    const r = vectorize({ rgba: synth(), width: 64, height: 64, settings: { background: 'remove' } })
    expect(r.shapes.some((s) => s.color.every((v) => v > 250))).toBe(false)
    expect(r.shapes.length).toBeGreaterThanOrEqual(3)
  })

  it('juntar cores com paleta fixa respeita a cor escolhida', () => {
    const r0 = vectorize({ rgba: synth(), width: 64, height: 64 })
    const blue = r0.palette.findIndex((c) => c[2] > 180 && c[0] < 60)
    const red = r0.palette.findIndex((c) => c[0] > 200 && c[1] < 60)
    const r = vectorize({ rgba: synth(), width: 64, height: 64, settings: { palette: r0.palette, mergeMap: { [blue]: red } } })
    expect(r.shapes.some((s) => s.colorIndex === blue)).toBe(false)
  })

  it('imagem de uma cor só e imagem minúscula não quebram', () => {
    const one = new Uint8Array(8 * 8 * 4).fill(200)
    expect(vectorize({ rgba: one, width: 8, height: 8 }).shapes.length).toBe(1)
    const tiny = new Uint8Array([10, 10, 10, 255])
    expect(vectorize({ rgba: tiny, width: 1, height: 1 }).shapes.length).toBe(1)
  })
})

describe('exportação', () => {
  const r = vectorize({ rgba: synth(), width: 64, height: 64 })
  it('SVG tem viewBox e uma forma por região', () => {
    const s = toSvg(r)
    expect(s).toContain('viewBox="0 0 64 64"')
    expect((s.match(/<path fill=/g) || []).length).toBe(r.shapes.length)
  })
  it('PDF tem estrutura válida', () => {
    const b = buildPdf(r, defaultExport, new Set())
    const t = new TextDecoder('latin1').decode(b)
    expect(t.startsWith('%PDF-1.4')).toBe(true)
    expect(t).toContain('startxref')
    const xref = Number(t.match(/startxref\n(\d+)/)![1])
    expect(t.slice(xref, xref + 4)).toBe('xref')
  })
  it('corte por bordas desenha cada fronteira uma vez só', () => {
    const shapesSvg = toSvg(r, { drawStyle: 'strokeShapes' })
    const edgesSvg = toSvg(r, { drawStyle: 'strokeEdges' })
    expect(r.edges.length).toBeGreaterThan(0)
    expect((edgesSvg.match(/<path /g) || []).length).toBe(r.edges.length)
    // por formas, as fronteiras internas aparecem duas vezes; por bordas, uma
    expect(edgesSvg.length).toBeLessThan(shapesSvg.length)
    const dxf = buildDxf(r, { ...defaultExport, preset: 'cut', cutStyle: 'strokeEdges', unit: 'mm', width: 50 }, new Set())
    expect((dxf.match(/\nPOLYLINE\n/g) || []).length).toBe(r.edges.length)
  })
  it('cor adicionada na paleta fixa é usada', () => {
    const extra: [number, number, number] = [30, 160, 90]
    const pal = r.palette.filter((c) => !(c[1] > 140 && c[0] < 60))
    const r1 = vectorize({ rgba: synth(), width: 64, height: 64, settings: { palette: pal } })
    expect(r1.shapes.some((s) => s.color[1] > 140 && s.color[0] < 60)).toBe(false)
    const r2 = vectorize({ rgba: synth(), width: 64, height: 64, settings: { palette: [...pal, extra] } })
    expect(r2.shapes.some((s) => s.color[1] > 140 && s.color[0] < 60)).toBe(true)
  })
  it('DXF em milímetros respeita a largura pedida', () => {
    const d = buildDxf(r, { ...defaultExport, preset: 'cut', unit: 'mm', width: 50 }, new Set())
    const xs = [...d.matchAll(/\n10\n([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(Math.max(...xs)).toBeLessThanOrEqual(50.01)
    expect(d.trim().endsWith('EOF')).toBe(true)
  })
})
