export type RGB = [number, number, number]

export type ImageType = 'auto' | 'clipart' | 'photo' | 'drawing'
export type Purpose = 'general' | 'print' | 'embroidery' | 'line' | 'sticker' | 'cut'

export interface Settings {
  imageType: ImageType
  purpose: Purpose
  /** 0 = automático */
  maxColors: number
  palette?: RGB[]
  /** com paleta fixa: junta a cor de índice X na cor de índice Y */
  mergeMap?: Record<number, number>
  /** 0..100 — mais alto guarda mais detalhes pequenos */
  detail: number
  /** 0..100 — mais alto deixa as curvas mais lisas (menos nós) */
  smoothness: number
  corners: 'auto' | 'sharp' | 'round'
  /** 0..100 — junta tons parecidos */
  mergeSimilar: number
  background: 'keep' | 'remove'
  /** amplia 2x por dentro antes de vetorizar (experimental; padrão: não — o sub-pixel rende mais) */
  upscale?: boolean
}

export const defaultSettings: Settings = {
  imageType: 'auto',
  purpose: 'general',
  maxColors: 0,
  detail: 50,
  smoothness: 50,
  corners: 'auto',
  mergeSimilar: 50,
  background: 'keep',
}

export interface Point { x: number; y: number }

/** Segmento de curva: linha (L) ou cúbica (C). Sempre começa onde o anterior termina. */
export type Seg =
  | { t: 'L'; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }

export interface Curve {
  start: Point
  segs: Seg[]
  closed: boolean
  primitive?: 'circle' | 'ellipse'
}

export interface Shape {
  id: number
  color: RGB
  /** índice na paleta */
  colorIndex: number
  /** caminho SVG (apenas contorno externo, modo empilhado) */
  d: string
  /** caminho com furos (modo recortes, regra evenodd) */
  dCutout: string
  area: number
  /** nível de aninhamento (0 = encosta na borda da imagem ou no fundo) */
  level: number
}

export interface VectorResult {
  width: number
  height: number
  palette: RGB[]
  shapes: Shape[]
  /** cada fronteira entre duas regiões, uma vez só (para "linhas das bordas") */
  edges: { d: string; a: number; b: number }[]
  stats: { shapes: number; colors: number; nodes: number; ms: number }
}

export type Progress = (stage: string, fraction: number) => void
