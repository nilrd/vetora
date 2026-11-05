import { useRef, useState } from 'react'
import type { Settings } from '../engine/types.ts'
import { loadImage, baseName, download, ACCEPT } from '../lib/image.ts'
import { vectorizeOnce } from '../lib/useVectorizer.ts'
import { exportFile, type ExportOptions, type Format } from '../lib/export.ts'
import { makeZip } from '../lib/zip.ts'
import { IUpload, IDownload } from './icons.tsx'

interface Item { file: File; url: string; status: 'fila' | 'processando' | 'pronto' | 'erro'; blob?: Blob; msg?: string }

interface Props { initial: File[]; settings: Settings; exp: ExportOptions; onBack: () => void }

export function Batch({ initial, settings, exp, onBack }: Props) {
  const [items, setItems] = useState<Item[]>(() => initial.map((f) => ({ file: f, url: URL.createObjectURL(f), status: 'fila' })))
  const [format, setFormat] = useState<Format>(exp.format)
  const [running, setRunning] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const add = (fl: FileList | null) => {
    const list = [...(fl ?? [])].filter((f) => f.type.startsWith('image/'))
    setItems((it) => [...it, ...list.map((f) => ({ file: f, url: URL.createObjectURL(f), status: 'fila' as const }))])
  }

  const run = async () => {
    setRunning(true)
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'pronto') continue
      setItems((it) => it.map((x, j) => (j === i ? { ...x, status: 'processando' } : x)))
      try {
        const img = await loadImage(items[i].file, items[i].file.name)
        const r = await vectorizeOnce(img.data, settings)
        const blob = await exportFile(r, { ...exp, format }, new Set())
        setItems((it) => it.map((x, j) => (j === i ? { ...x, status: 'pronto', blob } : x)))
      } catch (e) {
        setItems((it) => it.map((x, j) => (j === i ? { ...x, status: 'erro', msg: e instanceof Error ? e.message : 'falhou' } : x)))
      }
    }
    setRunning(false)
  }

  const zip = async () => {
    const ok = items.filter((x) => x.blob)
    const names = new Set<string>()
    const files = ok.map((x) => {
      let n = `${baseName(x.file.name)}.${format}`
      let k = 2
      while (names.has(n)) n = `${baseName(x.file.name)}-${k++}.${format}`
      names.add(n)
      return { name: n, blob: x.blob! }
    })
    download(await makeZip(files), 'vetora-lote.zip')
  }

  const done = items.filter((x) => x.status === 'pronto').length
  return (
    <main className="batch">
      <button className="btn ghost small" onClick={onBack}>← Voltar</button>
      <h2>Vetorizar em lote</h2>
      <p style={{ color: 'var(--text-2)', marginTop: 0 }}>Todas as imagens usam a finalidade <b>{settings.purpose === 'general' ? 'Geral' : settings.purpose}</b> e os ajustes atuais. Uma falha não trava as outras.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={() => input.current?.click()}><IUpload /> Adicionar imagens</button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <select value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Formato">
          {['svg', 'pdf', 'eps', 'dxf', 'png'].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
        </select>
        <button className="btn primary" disabled={!items.length || running} onClick={run}>{running ? 'Vetorizando…' : 'Vetorizar tudo'}</button>
        <button className="btn" disabled={!done || running} onClick={zip}><IDownload /> Baixar tudo (.zip)</button>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{done} de {items.length} prontas</span>
      </div>
      <div className="blist">
        {items.length === 0 && <div className="hint">Adicione imagens para começar.</div>}
        {items.map((x, i) => (
          <div className="bitem" key={i}>
            <img src={x.url} alt="" />
            <div className="name">{x.file.name}</div>
            <div className={`st${x.status === 'pronto' ? ' ok' : x.status === 'erro' ? ' bad' : ''}`}>{x.status === 'erro' ? x.msg : x.status}</div>
            {x.blob && <button className="btn small" onClick={() => download(x.blob!, `${baseName(x.file.name)}.${format}`)}>Baixar</button>}
          </div>
        ))}
      </div>
    </main>
  )
}
