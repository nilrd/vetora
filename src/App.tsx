import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RGB, Settings } from './engine/types.ts'
import { defaultSettings } from './engine/types.ts'
import { parseHex } from './engine/color.ts'
import { loadImage, baseName, download, formatBytes, type LoadedImage } from './lib/image.ts'
import { useVectorizer } from './lib/useVectorizer.ts'
import { applyEdits, displaySvg, hiddenIds, outlineSvg } from './lib/display.ts'
import { buildSvg, defaultExport, exportFile, type ExportOptions } from './lib/export.ts'
import { Viewer, type ViewMode } from './ui/Viewer.tsx'
import { Panel } from './ui/Panel.tsx'
import { Home } from './ui/Home.tsx'
import { Batch } from './ui/Batch.tsx'
import { IEraser, IFit, IMinus, IPlus, IRedo, IUndo, IImage } from './ui/icons.tsx'

interface Edits { hidden: Set<number>; hiddenColors: Set<number>; overrides: Map<number, RGB>; regionColors: Map<number, RGB> }
const emptyEdits = (): Edits => ({ hidden: new Set(), hiddenColors: new Set(), overrides: new Map(), regionColors: new Map() })

const STORE = 'vetora:prefs'
function loadPrefs(): { settings: Settings; exp: ExportOptions } {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) || '{}')
    return { settings: { ...defaultSettings, ...(p.settings || {}), palette: undefined, mergeMap: undefined }, exp: { ...defaultExport, ...(p.exp || {}) } }
  } catch { return { settings: defaultSettings, exp: defaultExport } }
}

const STAGES: Record<string, string> = {
  preparando: 'Preparando', 'limpando ruído': 'Limpando o ruído', cores: 'Encontrando as cores', contornos: 'Traçando os contornos', curvas: 'Ajustando as curvas', pronto: 'Quase lá',
}

export default function App() {
  const prefs = useMemo(loadPrefs, [])
  const [screen, setScreen] = useState<'home' | 'edit' | 'batch'>('home')
  const [img, setImg] = useState<LoadedImage | null>(null)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [settings, setSettings] = useState<Settings>(prefs.settings)
  const [exp, setExp] = useState<ExportOptions>(prefs.exp)
  const [loadErr, setLoadErr] = useState('')
  const [mode, setMode] = useState<ViewMode>('compare')
  const [tool, setTool] = useState<'none' | 'erase' | 'paint'>('none')
  const [paintHex, setPaintHex] = useState('#e63946')
  const pick = tool !== 'none'
  const [zoomCmd, setZoomCmd] = useState<{ kind: 'in' | 'out' | 'fit'; n: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [toast, setToast] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [edits, setEdits] = useState<Edits>(emptyEdits)
  const undoStack = useRef<Edits[]>([])
  const redoStack = useRef<Edits[]>([])
  const vz = useVectorizer()

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ settings: { ...settings, palette: undefined, mergeMap: undefined }, exp })) } catch { /* sem armazenamento */ }
  }, [settings, exp])

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600) }

  const openFile = useCallback(async (f: Blob, name: string) => {
    setLoadErr('')
    try {
      const li = await loadImage(f, name)
      setImg((old) => { if (old) URL.revokeObjectURL(old.url); return li })
      setEdits(emptyEdits()); undoStack.current = []; redoStack.current = []
      setScreen('edit'); setMode('compare'); setTool('none')
      setSettings((s) => ({ ...s, palette: undefined, mergeMap: undefined }))
      if (li.scaled) flash(`Imagem reduzida para ${li.data.width}×${li.data.height} px para caber no limite de 4 MP.`)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Não deu para abrir essa imagem.')
    }
  }, [])

  // vetoriza de novo quando a imagem ou os ajustes mudam (com uma pequena espera nos sliders)
  useEffect(() => {
    if (!img) return
    const t = setTimeout(() => { vz.run(img.data, settings).catch(() => {}) }, 220)
    return () => clearTimeout(t)
  }, [img, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  // colar imagem na tela do editor também funciona
  useEffect(() => {
    if (screen !== 'edit') return
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (f) openFile(f, 'colado.png')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [screen, openFile])

  const commit = (next: Edits) => { undoStack.current.push(edits); redoStack.current = []; setEdits(next) }
  const undo = () => { const p = undoStack.current.pop(); if (p) { redoStack.current.push(edits); setEdits(p) } }
  const redo = () => { const n = redoStack.current.pop(); if (n) { undoStack.current.push(edits); setEdits(n) } }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== 'edit') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const result = vz.result
  const edited = useMemo(() => (result ? applyEdits(result, edits.overrides, edits.regionColors) : null), [result, edits.overrides, edits.regionColors])
  const hidden = useMemo(() => (edited ? hiddenIds(edited, edits.hidden, edits.hiddenColors) : new Set<number>()), [edited, edits])
  const svg = useMemo(() => (edited ? displaySvg(edited, hidden) : ''), [edited, hidden])
  const outline = useMemo(() => (edited && mode === 'outline' ? outlineSvg(edited, hidden) : ''), [edited, hidden, mode])
  const svgSize = useMemo(() => (edited && exp.format === 'svg' ? new Blob([buildSvg(edited, exp, hidden)]).size : 0), [edited, exp, hidden])

  const onSettings = (s: Partial<Settings>, purposeExport?: Partial<ExportOptions>) => {
    // mudar a paleta automática desfaz as edições de cor (os índices mudam)
    const resetsPalette = 'maxColors' in s || 'mergeSimilar' in s || 'purpose' in s || 'imageType' in s
    setSettings((cur) => ({ ...cur, ...s, ...(resetsPalette ? { palette: undefined, mergeMap: undefined } : {}) }))
    if (purposeExport) setExp((e) => ({ ...e, ...purposeExport }))
    if (resetsPalette) setEdits(emptyEdits())
    else setEdits((e) => ({ ...e, hidden: new Set(), regionColors: new Map() }))
  }

  const onMergeColor = (from: number, into: number) => {
    if (!result) return
    // paleta fixa = as cores originais (as trocadas continuam valendo pelo índice)
    setSettings((cur) => ({ ...cur, palette: result.palette, mergeMap: { ...(cur.palette ? cur.mergeMap : {}), [from]: into } }))
    flash('Cores juntadas.')
  }

  const doDownload = async () => {
    if (!edited || !img) return
    setDownloading(true)
    try {
      const blob = await exportFile(edited, exp, hidden)
      download(blob, `${baseName(img.name)}-vetora.${exp.format}`)
    } catch {
      flash('Não deu para gerar o arquivo. Tente outro formato.')
    } finally { setDownloading(false) }
  }

  const backHome = () => { setScreen('home'); vz.reset() }

  return (
    <>
      <header className="top">
        <a className="logo" href="./" onClick={(e) => { e.preventDefault(); backHome() }} aria-label="Vetora, início">
          <img src="favicon.svg" alt="" /><b>vetora</b>
        </a>
        {screen === 'edit' && img && <span className="file">{img.name} · {img.data.width}×{img.data.height}</span>}
        <span className="spacer" />
        {screen === 'edit' ? (
          <label className="btn small"><IImage /> Nova imagem<input hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f, f.name); e.target.value = '' }} /></label>
        ) : (
          <nav>
            <button onClick={() => { setBatchFiles([]); setScreen('batch') }}>Lote</button>
            {screen === 'home' && <a className="hide-sm" href="#como-funciona">Como funciona</a>}
            <a className="hide-sm" href="https://github.com/nilrd/vetora">GitHub</a>
          </nav>
        )}
      </header>

      {screen === 'home' && <Home onFile={openFile} onBatch={(f) => { setBatchFiles(f); setScreen('batch') }} error={loadErr} />}

      {screen === 'batch' && <Batch initial={batchFiles} settings={settings} exp={exp} onBack={backHome} />}

      {screen === 'edit' && img && (
        <div className="editor">
          <div className="stage">
            <div className="toolbar">
              <div className="seg" role="group" aria-label="Visualização">
                {([['compare', 'Comparar'], ['vector', 'Vetor'], ['original', 'Original'], ['outline', 'Contornos']] as const).map(([id, l]) => (
                  <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{l}</button>
                ))}
              </div>
              <button className="btn small" aria-pressed={tool === 'erase'} onClick={() => { setTool(tool === 'erase' ? 'none' : 'erase'); if (mode === 'original') setMode('vector') }} title="Clique nas regiões do vetor para apagar ou trazer de volta">
                <IEraser /> Borracha
              </button>
              <span className="seg" style={{ alignItems: 'center' }}>
                <button aria-pressed={tool === 'paint'} onClick={() => { setTool(tool === 'paint' ? 'none' : 'paint'); if (mode === 'original') setMode('vector') }} title="Clique numa região para pintar com a cor escolhida">Pincel</button>
                <input type="color" value={paintHex} onChange={(e) => { setPaintHex(e.target.value); setTool('paint') }} aria-label="Cor do pincel" style={{ width: 28, height: 26, border: 0, padding: 0, background: 'none', cursor: 'pointer' }} />
              </span>
              <span className="sep" />
              <button className="btn small ghost icon-only" onClick={undo} disabled={!undoStack.current.length} aria-label="Desfazer" title="Desfazer (Ctrl+Z)"><IUndo /></button>
              <button className="btn small ghost icon-only" onClick={redo} disabled={!redoStack.current.length} aria-label="Refazer" title="Refazer (Ctrl+Y)"><IRedo /></button>
              <span className="spacer" />
              <button className="btn small ghost icon-only" onClick={() => setZoomCmd({ kind: 'out', n: Date.now() })} aria-label="Diminuir zoom"><IMinus /></button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="btn small ghost icon-only" onClick={() => setZoomCmd({ kind: 'in', n: Date.now() })} aria-label="Aumentar zoom"><IPlus /></button>
              <button className="btn small ghost icon-only" onClick={() => setZoomCmd({ kind: 'fit', n: Date.now() })} aria-label="Caber na tela"><IFit /></button>
            </div>
            <Viewer
              imgUrl={img.url} width={img.data.width} height={img.data.height}
              svg={svg} outlineSvg={outline} mode={mode} pickable={pick && mode !== 'original'}
              onPick={(id) => {
                if (tool === 'paint') {
                  const m = new Map(edits.regionColors)
                  m.set(id, parseHex(paintHex))
                  commit({ ...edits, regionColors: m })
                  return
                }
                const h = new Set(edits.hidden)
                if (h.has(id)) h.delete(id); else h.add(id)
                commit({ ...edits, hidden: h })
              }}
              zoomCmd={zoomCmd} onZoomChange={setZoom}
            />
            {vz.status === 'working' && (
              <div className="busy" role="status"><span className="spin" />{STAGES[vz.progress.stage] ?? 'Processando'}<span className="bar"><i style={{ width: `${Math.round(vz.progress.fraction * 100)}%` }} /></span></div>
            )}
            {vz.status === 'error' && <div className="busy" role="alert" style={{ color: 'var(--danger)' }}>Algo deu errado: {vz.error}</div>}
            <div className="stats" aria-live="polite">
              {edited ? (
                <>
                  <span><b>{edited.stats.colors}</b> cores</span>
                  <span><b>{edited.shapes.length - hidden.size}</b> formas</span>
                  <span><b>{edited.stats.nodes}</b> nós</span>
                  <span><b>{img.data.width}×{img.data.height}</b> px</span>
                  <span>feito em <b>{(edited.stats.ms / 1000).toFixed(1)} s</b></span>
                  {svgSize > 0 && <span>SVG com <b>{formatBytes(svgSize)}</b></span>}
                </>
              ) : <span>Vetorizando…</span>}
            </div>
          </div>
          <Panel
            settings={settings} onSettings={onSettings} result={edited} palette={edited?.palette ?? []}
            hiddenColors={edits.hiddenColors}
            onRecolor={(i, c) => { const m = new Map(edits.overrides); m.set(i, c); commit({ ...edits, overrides: m }) }}
            onToggleColor={(i) => { const s = new Set(edits.hiddenColors); if (s.has(i)) s.delete(i); else s.add(i); commit({ ...edits, hiddenColors: s }) }}
            onMergeColor={onMergeColor}
            onAddColor={(c) => {
              if (!result) return
              setSettings((cur) => ({ ...cur, palette: [...result.palette, c], mergeMap: cur.palette ? cur.mergeMap : undefined }))
              flash('Cor adicionada. Refazendo o vetor…')
            }}
            exp={exp} onExp={(e) => setExp((x) => ({ ...x, ...e }))}
            onDownload={doDownload} downloading={downloading}
            sizeHint={tool === 'erase' ? 'Borracha ligada: clique nas regiões para apagar.' : tool === 'paint' ? 'Pincel ligado: clique numa região para pintar.' : ''}
          />
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
