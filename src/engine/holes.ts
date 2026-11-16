import type { Shape } from './types.ts'

/**
 * Caminho empilhado (contorno externo) com os furos que não serão cobertos por ninguém.
 * Sem isso, ao tirar o fundo ou apagar uma cor, o miolo das letras (O, A, R...) fica tampado.
 */
export function stackedD(s: Shape, drawn: Set<number>): string {
  if (!s.holes?.length) return s.d
  let d = s.d
  for (const h of s.holes) if (h.inner.some((id) => !drawn.has(id)) && !d.includes(h.d)) d += h.d
  return d
}

/** Formas visíveis, com os furos recortados onde a forma de dentro foi escondida. */
export function visibleStacked(shapes: Shape[], hidden: Set<number>): Shape[] {
  const vis = shapes.filter((s) => !hidden.has(s.id))
  if (!hidden.size) return vis
  const drawn = new Set(vis.map((s) => s.id))
  return vis.map((s) => ({ ...s, d: stackedD(s, drawn) }))
}
