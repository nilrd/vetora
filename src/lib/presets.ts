import type { Settings, Purpose } from '../engine/types.ts'
import type { ExportOptions } from './export.ts'

export interface PurposeInfo {
  id: Purpose
  label: string
  hint: string
  settings: Partial<Settings>
  exportOpts: Partial<ExportOptions>
}

export const PURPOSES: PurposeInfo[] = [
  {
    id: 'general', label: 'Geral', hint: 'Logos, ícones e ilustrações. O equilíbrio padrão.',
    settings: { maxColors: 0, detail: 50, smoothness: 50, mergeSimilar: 50, background: 'keep' },
    exportOpts: { format: 'svg', preset: 'edit', groupByColor: false, gapFiller: true },
  },
  {
    id: 'print', label: 'Estampa', hint: 'Silk e sublimação: cores separadas em camadas, sem frestas.',
    settings: { maxColors: 0, detail: 50, smoothness: 55, mergeSimilar: 65, background: 'keep' },
    exportOpts: { format: 'pdf', preset: 'edit', groupByColor: true, gapFiller: true },
  },
  {
    id: 'embroidery', label: 'Bordado', hint: 'Poucas cores, formas firmes e sem detalhes minúsculos.',
    settings: { maxColors: 8, detail: 25, smoothness: 70, mergeSimilar: 75, background: 'keep' },
    exportOpts: { format: 'svg', preset: 'edit', groupByColor: true, gapFiller: false },
  },
  {
    id: 'sticker', label: 'Adesivo', hint: 'Tira o fundo e deixa o contorno limpo para recorte.',
    settings: { maxColors: 0, detail: 45, smoothness: 60, mergeSimilar: 55, background: 'remove' },
    exportOpts: { format: 'svg', preset: 'edit', groupByColor: false, gapFiller: true },
  },
  {
    id: 'cut', label: 'Corte a laser', hint: 'Plotter, laser e Cricut: só contornos, em milímetros.',
    settings: { maxColors: 6, detail: 35, smoothness: 65, mergeSimilar: 70, background: 'remove' },
    exportOpts: { format: 'dxf', preset: 'cut', groupByColor: false, gapFiller: false, unit: 'mm', width: 100 },
  },
  {
    id: 'line', label: 'Desenho a traço', hint: 'Desenhos e rabiscos em linhas, preto no branco.',
    settings: { maxColors: 2, detail: 70, smoothness: 45, mergeSimilar: 60, background: 'keep' },
    exportOpts: { format: 'svg', preset: 'edit', groupByColor: false, gapFiller: true },
  },
]

export const IMAGE_TYPES: { id: Settings['imageType']; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'clipart', label: 'Logo' },
  { id: 'drawing', label: 'Desenho' },
  { id: 'photo', label: 'Foto' },
]
