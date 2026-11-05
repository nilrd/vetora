import { hex } from './color.ts'
import type { VectorResult } from './types.ts'

export interface SvgOptions {
  stacking?: 'stacked' | 'cutouts'
  /** traço da mesma cor por baixo, fecha frestas de antialiasing entre formas vizinhas */
  gapFiller?: boolean
  gapWidth?: number
  groupByColor?: boolean
  /** largura/altura finais (com unidade). Padrão: tamanho original em px. */
  width?: string
  height?: string
  drawStyle?: 'fill' | 'strokeShapes' | 'strokeEdges'
  strokeWidth?: number
}

export function toSvg(r: VectorResult, o: SvgOptions = {}): string {
  const stacking = o.stacking ?? 'stacked'
  const gap = o.gapFiller ?? true
  const gw = o.gapWidth ?? 0.5
  const W = o.width ?? String(r.width)
  const H = o.height ?? String(r.height)
  const style = o.drawStyle ?? 'fill'
  const dOf = (s: VectorResult['shapes'][number]) => (stacking === 'stacked' ? s.d : s.dCutout)
  const fillRule = stacking === 'cutouts' ? ' fill-rule="evenodd"' : ''
  let body = ''
  if (style === 'strokeEdges') {
    const sw = o.strokeWidth ?? 0.5
    const vis = new Set(r.shapes.map((s) => s.id))
    body = `<g fill="none" stroke="#000000" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">` +
      r.edges.filter((e) => vis.has(e.a) || vis.has(e.b)).map((e) => `<path d="${e.d}"/>`).join('') + '</g>'
  } else if (style === 'strokeShapes') {
    const sw = o.strokeWidth ?? 0.5
    body = `<g fill="none" stroke-width="${sw}" stroke-linejoin="round">` +
      r.shapes.map((s) => `<path stroke="${hex(s.color)}" d="${s.dCutout}"/>`).join('') + '</g>'
  } else if (o.groupByColor) {
    const groups = new Map<number, string[]>()
    for (const s of r.shapes) {
      let g = groups.get(s.colorIndex)
      if (!g) groups.set(s.colorIndex, (g = []))
      g.push(s.dCutout)
    }
    // por cor exige recortes (sem sobreposição), senão a ordem entre cores quebra
    for (const [ci, ds] of groups) {
      const c = hex(r.palette[ci])
      body += `<g id="cor-${c.slice(1)}" fill="${c}"${gap ? ` stroke="${c}" stroke-width="${gw}" stroke-linejoin="round"` : ''}><path fill-rule="evenodd" d="${ds.join('')}"/></g>`
    }
  } else {
    if (gap) {
      body += `<g fill="none" stroke-width="${gw}" stroke-linejoin="round">` +
        r.shapes.map((s) => `<path stroke="${hex(s.color)}" d="${dOf(s)}"${fillRule}/>`).join('') + '</g>'
    }
    body += r.shapes.map((s) => `<path fill="${hex(s.color)}"${fillRule} d="${dOf(s)}"/>`).join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${r.width} ${r.height}">${body}</svg>`
}
