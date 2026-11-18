// Log de erros do site: cada falha (vetorizar, exportar, relato, carregar imagem, erro solto da página)
// vai para a tabela public.erros do Supabase. Mesma chave PÚBLICA do relato: só consegue gravar, não ler.
// Nunca derruba nada: se o próprio registro falhar, é ignorado.
import { VERSAO } from './relato.ts'

const URL_BASE = 'https://dttuyrpdzqmjckfhlnkd.supabase.co'
const CHAVE = 'sb_publishable_hTTiUc1wCK0I4q6g9rjKfQ__QIISQkt'

export type Onde = 'vetorizar' | 'exportar' | 'relato' | 'carregar' | 'site'

const sessao = (() => { try { return crypto.randomUUID() } catch { return String(Math.random()).slice(2) } })()
const vistos = new Set<string>()
let enviados = 0
const LIMITE = 15 // por aba: um erro em loop não pode encher o banco

/** Contexto da imagem aberta, para o erro vir com o que estava sendo feito. */
let contexto: { imagem?: Record<string, unknown>; configuracoes?: Record<string, unknown> } = {}
export function definirContexto(c: typeof contexto) { contexto = c }

const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

export function registrarErro(onde: Onde, erro: unknown, extra?: string) {
  try {
    const e = erro instanceof Error ? erro : null
    const mensagem = corta(e ? e.message || e.name : typeof erro === 'string' ? erro : JSON.stringify(erro) ?? String(erro), 2000) || '(sem mensagem)'
    const chave = `${onde}|${mensagem}`
    if (vistos.has(chave) || enviados >= LIMITE) return
    vistos.add(chave)
    enviados++
    const detalhe = corta([extra, e?.stack].filter(Boolean).join('\n---\n'), 8000) || null
    const row = {
      onde, mensagem, detalhe, versao: VERSAO, sessao,
      navegador: corta(navigator.userAgent, 400),
      imagem: contexto.imagem ?? null,
      configuracoes: contexto.configuracoes ?? null,
    }
    fetch(`${URL_BASE}/rest/v1/erros`, {
      method: 'POST', keepalive: true,
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    }).catch(() => {})
  } catch { /* o registro de erro nunca pode causar outro erro */ }
}

/** Erros soltos da página (fora dos try/catch): também vão para o log. */
export function vigiarErrosDaPagina() {
  window.addEventListener('error', (ev) => {
    // erro de carregar recurso (imagem, script) não tem ev.error; ignora extensões do navegador
    if (!ev.error && !ev.message) return
    if (ev.filename && !ev.filename.startsWith(location.origin)) return
    registrarErro('site', ev.error ?? ev.message, ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : undefined)
  })
  window.addEventListener('unhandledrejection', (ev) => registrarErro('site', ev.reason, 'promessa sem tratamento'))
}
