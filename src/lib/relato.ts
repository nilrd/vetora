// Relato de vetorização ruim: manda a imagem original, o resultado e os ajustes para o Supabase.
// A chave abaixo é a chave PÚBLICA do projeto: só consegue enviar (as regras do banco não deixam ler).
import type { Settings } from '../engine/types.ts'
import type { ExportOptions } from './export.ts'

const URL_BASE = 'https://dttuyrpdzqmjckfhlnkd.supabase.co'
const CHAVE = 'sb_publishable_hTTiUc1wCK0I4q6g9rjKfQ__QIISQkt'
export const VERSAO = __VETORA_VERSAO__

const cab = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` }

async function envia(path: string, body: Blob, tipo: string) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/relatos/${path}`, { method: 'POST', headers: { ...cab, 'Content-Type': tipo, 'x-upsert': 'false' }, body })
  if (!r.ok) throw new Error(`envio ${r.status}`)
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

export async function enviarRelato(r: Relato): Promise<void> {
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
  const ext = (r.nome.match(/\.(png|jpe?g|webp|gif|bmp)$/i)?.[1] || 'png').toLowerCase()
  const tipo = r.original.type || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`)
  const origPath = `${id}/original.${ext}`
  const svgPath = `${id}/resultado.svg`
  await envia(origPath, r.original, tipo)
  await envia(svgPath, new Blob([r.resultadoSvg], { type: 'image/svg+xml' }), 'image/svg+xml')
  const row = {
    nome_arquivo: r.nome, largura: r.largura, altura: r.altura,
    configuracoes: { ...r.settings, palette: undefined, mergeMap: undefined }, exportacao: r.exp,
    comentario: r.comentario || null, original_path: origPath, resultado_path: svgPath, versao: VERSAO,
  }
  const res = await fetch(`${URL_BASE}/rest/v1/relatos`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) })
  if (!res.ok) throw new Error(`registro ${res.status}`)
}
