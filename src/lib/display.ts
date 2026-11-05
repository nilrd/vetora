import type { RGB, VectorResult } from '../engine/types.ts'
import { hex } from '../engine/color.ts'

/** Resultado com as edições aplicadas (cores trocadas). */
export function applyEdits(r: VectorResult, overrides: Map<number, RGB>, regionColors?: Map<number, RGB>): VectorResult {
  if (!overrides.size && !regionColors?.size) return r
  const palette = r.palette.map((c, i) => overrides.get(i) ?? c)
  return {
    ...r, palette,
    shapes: r.shapes.map((s) => {
      const rc = regionColors?.get(s.id)
      if (rc) return { ...s, color: rc }
      return overrides.has(s.colorIndex) ? { ...s, color: overrides.get(s.colorIndex)! } : s
    }),
  }
}

/** Formas escondidas: as clicadas com a borracha + as das cores apagadas. */
export function hiddenIds(r: VectorResult, hidden: Set<number>, hiddenColors: Set<number>): Set<number> {
  const out = new Set(hidden)
  if (hiddenColors.size) for (const s of r.shapes) if (hiddenColors.has(s.colorIndex)) out.add(s.id)
  return out
}

/** SVG para a tela: cada forma com data-id (para clicar) e traço por baixo para fechar frestas. */
export function displaySvg(r: VectorResult, hidden: Set<number>): string {
  const vis = r.shapes.filter((s) => !hidden.has(s.id))
  const strokes = vis.map((s) => `<path stroke="${hex(s.color)}" d="${s.d}"/>`).join('')
  const fills = vis.map((s) => `<path data-id="${s.id}" fill="${hex(s.color)}" d="${s.d}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r.width} ${r.height}" preserveAspectRatio="none" shape-rendering="geometricPrecision"><g fill="none" stroke-width="0.5" stroke-linejoin="round">${strokes}</g>${fills}</svg>`
}

export function outlineSvg(r: VectorResult, hidden: Set<number>): string {
  const vis = r.shapes.filter((s) => !hidden.has(s.id))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r.width} ${r.height}" preserveAspectRatio="none"><g fill="none" stroke="#3c3489" stroke-width="1" vector-effect="non-scaling-stroke">${vis.map((s) => `<path vector-effect="non-scaling-stroke" d="${s.dCutout}"/>`).join('')}</g></svg>`
}
