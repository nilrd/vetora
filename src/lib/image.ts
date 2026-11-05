export interface LoadedImage {
  name: string
  url: string
  data: ImageData
  origWidth: number
  origHeight: number
  /** a imagem foi reduzida para caber no limite */
  scaled: boolean
}

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp'
export const MAX_PIXELS = 4_000_000
export const MAX_BYTES = 40 * 1024 * 1024

export async function loadImage(file: Blob, name = 'imagem'): Promise<LoadedImage> {
  if (file.size > MAX_BYTES) throw new Error('Arquivo grande demais. O limite é 40 MB.')
  if (file.type && !/^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.type)) throw new Error('Formato não suportado. Use PNG, JPG, WebP, GIF ou BMP.')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('Não deu para abrir essa imagem. Ela pode estar corrompida.')
  }
  const ow = bmp.width, oh = bmp.height
  let w = ow, h = oh
  let scaled = false
  if (w * h > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (w * h))
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k))
    scaled = true
  }
  const cv = new OffscreenCanvas(w, h)
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const data = ctx.getImageData(0, 0, w, h)
  return { name, url: URL.createObjectURL(file), data, origWidth: ow, origHeight: oh, scaled }
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'vetora'
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
