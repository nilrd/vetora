// Puxa os relatos "Ficou ruim" do Supabase para bench/reais/relatos/<id>/ (original + resultado + relato.json).
// Uso: SUPABASE_SERVICE_KEY=... node --experimental-strip-types bench/relatos.ts [--todos]
// A chave de serviço fica no painel do Supabase (Project Settings > API keys). Nunca vai para o site nem para o git.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const URL_BASE = 'https://dttuyrpdzqmjckfhlnkd.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!KEY) { console.error('Falta SUPABASE_SERVICE_KEY'); process.exit(1) }
const cab = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const todos = process.argv.includes('--todos')
const response = await fetch(`${URL_BASE}/rest/v1/relatos?select=*&order=criado_em.desc${todos ? '' : '&tratado=eq.false'}`, { headers: cab })
if (!response.ok) throw new Error(`Falha ao consultar relatos: HTTP ${response.status}`)
const rows = await response.json() as Record<string, unknown>[]
console.log(rows.length, 'relatos')
for (const r of rows) {
  const dir = `bench/reais/relatos/${r.id}`
  mkdirSync(dir, { recursive: true })
  let complete = true
  for (const k of ['original_path', 'resultado_path']) {
    const path = r[k] as string | null
    if (!path) continue
    const destination = `${dir}/${path.split('/').pop()}`
    if (existsSync(destination) && !todos) continue
    const res = await fetch(`${URL_BASE}/storage/v1/object/relatos/${path}`, { headers: cab })
    if (!res.ok) { console.log('  falhou', path, res.status); complete = false; process.exitCode = 1; continue }
    const buf = Buffer.from(await res.arrayBuffer())
    // SVG compactado (relatos novos): guarda também descompactado, para abrir direto
    if (destination.endsWith('.svg.gz')) writeFileSync(destination.slice(0, -3), gunzipSync(buf))
    else writeFileSync(destination, buf)
  }
  writeFileSync(`${dir}/relato.json`, JSON.stringify(r, null, 2))
  console.log(' ', complete ? 'ok' : 'incompleto', r.criado_em, r.nome_arquivo, r.comentario || '')
}

// erros registrados pelo site (tabela public.erros), os não tratados
const er = await fetch(`${URL_BASE}/rest/v1/erros?select=*&order=criado_em.desc${todos ? '' : '&tratado=eq.false'}&limit=200`, { headers: cab })
if (er.ok) {
  const erros = await er.json() as Record<string, unknown>[]
  mkdirSync('bench/reais/erros', { recursive: true })
  writeFileSync('bench/reais/erros/erros.json', JSON.stringify(erros, null, 2))
  console.log(erros.length, 'erros do site (bench/reais/erros/erros.json)')
  const grupos = new Map<string, number>()
  for (const e of erros) { const k = `${e.onde} | ${String(e.mensagem).slice(0, 120)}`; grupos.set(k, (grupos.get(k) || 0) + 1) }
  for (const [k, n] of [...grupos].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x ${k}`)
} else console.log('erros: falha ao consultar', er.status)
