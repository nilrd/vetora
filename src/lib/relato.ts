// Relato de vetorização ruim: manda a imagem original, o resultado e os ajustes para o Supabase.
// A chave abaixo é a chave PÚBLICA do projeto: só consegue enviar (as regras do banco não deixam ler).
import type { Settings } from '../engine/types.ts'
import type { ExportOptions } from './export.ts'

const URL_BASE = 'https://dttuyrpdzqmjckfhlnkd.supabase.co'
const CHAVE = 'sb_publishable_hTTiUc1wCK0I4q6g9rjKfQ__QIISQkt'
export const VERSAO = __VETORA_VERSAO__

const cab = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` }
/** limite do bucket (plano gratuito: 50 MB por arquivo); folga para o cabeçalho */
const LIMITE_BYTES = 48 * 1024 * 1024

async function envia(path: string, body: Blob, tipo: string) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/relatos/${path}`, { method: 'POST', headers: { ...cab, 'Content-Type': tipo, 'x-upsert': 'false' }, body })
  if (!r.ok) {
    let msg = ''
    try { msg = (await r.text()).slice(0, 300) } catch { /* sem corpo */ }
    throw new Error(`envio de ${path.split('/').pop()} falhou (${r.status}) ${msg}`)
  }
}

/** SVG compactado com gzip: ilustrações chegam a 40 MB de SVG e ~1/3 disso compactado. */
async function gzip(texto: string): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'))
  return await new Response(stream).blob()
}

export interface Relato {
  nome: string
  original: Blob
  largura: number
  altura: number
  resultadoSvg: string
  settings: Settings
  exp: ExportOptions
  comentario: string
}

/**
 * Envia o relato. O que importa é a imagem original e os ajustes (com eles e a versão o resultado se
 * reproduz igual). O SVG vai junto quando cabe; se não couber ou falhar, o relato segue sem ele.
 * Devolve um aviso (texto) quando algo foi deixado de fora.
 */
export async function enviarRelato(r: Relato): Promise<string> {
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
  const ext = (r.nome.match(/\.(png|jpe?g|webp|gif|bmp)$/i)?.[1] || 'png').toLowerCase()
  const tipo = r.original.type || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`)
  const origPath = `${id}/original.${ext}`
  if (r.original.size > LIMITE_BYTES) throw new Error(`imagem grande demais para o relato (${(r.original.size / 1048576).toFixed(1)} MB)`)
  await envia(origPath, r.original, tipo)

  let svgPath: string | null = null
  let info = ''
  try {
    const gz = await gzip(r.resultadoSvg)
    const corpo = gz ?? new Blob([r.resultadoSvg], { type: 'image/svg+xml' })
    const caminho = gz ? `${id}/resultado.svg.gz` : `${id}/resultado.svg`
    const mb = `${(r.resultadoSvg.length / 1048576).toFixed(1)} MB${gz ? ` (gzip ${(gz.size / 1048576).toFixed(1)} MB)` : ''}`
    if (corpo.size > LIMITE_BYTES) info = `SVG não enviado: ${mb}`
    else { await envia(caminho, corpo, gz ? 'application/gzip' : 'image/svg+xml'); svgPath = caminho; info = `SVG ${mb}` }
  } catch (e) {
    info = `SVG não enviado: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500)
  }

  const row = {
    nome_arquivo: r.nome, largura: r.largura, altura: r.altura,
    configuracoes: { ...r.settings, palette: undefined, mergeMap: undefined }, exportacao: r.exp,
    comentario: r.comentario || null, original_path: origPath, resultado_path: svgPath, versao: VERSAO,
    resultado_info: info,
  }
  const res = await fetch(`${URL_BASE}/rest/v1/relatos`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) })
  if (!res.ok) {
    let msg = ''
    try { msg = (await res.text()).slice(0, 300) } catch { /* sem corpo */ }
    throw new Error(`registro do relato falhou (${res.status}) ${msg}`)
  }
  return svgPath ? '' : info
}
