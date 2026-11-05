import { useState } from 'react'
import type { RGB, Settings, VectorResult } from '../engine/types.ts'
import { hex, parseHex } from '../engine/color.ts'
import { PURPOSES, IMAGE_TYPES } from '../lib/presets.ts'
import type { ExportOptions, Format, Unit } from '../lib/export.ts'
import { IDownload } from './icons.tsx'

interface Props {
  settings: Settings
  onSettings: (s: Partial<Settings>, purposeExport?: Partial<ExportOptions>) => void
  result: VectorResult | null
  palette: RGB[]
  hiddenColors: Set<number>
  onRecolor: (index: number, c: RGB) => void
  onToggleColor: (index: number) => void
  onMergeColor: (from: number, into: number) => void
  onAddColor: (c: RGB) => void
  exp: ExportOptions
  onExp: (e: Partial<ExportOptions>) => void
  onDownload: () => void
  downloading: boolean
  sizeHint: string
}

const FORMATS: { id: Format; label: string }[] = [
  { id: 'svg', label: 'SVG' }, { id: 'pdf', label: 'PDF' }, { id: 'eps', label: 'EPS' }, { id: 'dxf', label: 'DXF' }, { id: 'png', label: 'PNG' },
]

export function Panel(p: Props) {
  const s = p.settings
  const [sel, setSel] = useState<number | null>(null)
  const [addHex, setAddHex] = useState('#000000')
  const used = new Set(p.result?.shapes.map((x) => x.colorIndex) ?? [])
  const colors = p.palette.map((c, i) => ({ c, i })).filter((x) => used.has(x.i))
  const selColor = sel != null ? p.palette[sel] : null

  return (
    <aside className="panel" aria-label="Ajustes">
      <section className="sec">
        <h3>Finalidade</h3>
        <div className="chips">
          {PURPOSES.map((x) => (
            <button key={x.id} className="chip" aria-pressed={s.purpose === x.id}
              onClick={() => p.onSettings({ ...x.settings, purpose: x.id }, x.exportOpts)}>{x.label}</button>
          ))}
        </div>
        <div className="hint">{PURPOSES.find((x) => x.id === s.purpose)?.hint}</div>
      </section>

      <section className="sec">
        <h3>Tipo de imagem</h3>
        <div className="seg" style={{ width: '100%' }}>
          {IMAGE_TYPES.map((t) => (
            <button key={t.id} style={{ flex: 1 }} aria-pressed={s.imageType === t.id} onClick={() => p.onSettings({ imageType: t.id })}>{t.label}</button>
          ))}
        </div>
      </section>

      <section className="sec">
        <h3>Cores</h3>
        <div className="field">
          <label>Quantidade de cores <span>{s.maxColors === 0 ? 'automático' : s.maxColors}</span></label>
          <input type="range" min={0} max={32} step={1} value={s.maxColors}
            onChange={(e) => p.onSettings({ maxColors: Number(e.target.value), palette: undefined })} aria-label="Quantidade de cores" />
        </div>
        <div className="field">
          <label>Juntar tons parecidos <span>{s.mergeSimilar}</span></label>
          <input type="range" min={0} max={100} step={1} value={s.mergeSimilar}
            onChange={(e) => p.onSettings({ mergeSimilar: Number(e.target.value), palette: undefined })} aria-label="Juntar tons parecidos" />
        </div>
        {colors.length > 0 && (
          <>
            <div className="palette" role="list">
              {colors.map(({ c, i }) => (
                <button key={i} role="listitem" className={`sw${p.hiddenColors.has(i) ? ' off' : ''}`} style={{ background: hex(c) }}
                  aria-pressed={sel === i} title={hex(c)} onClick={() => setSel(sel === i ? null : i)} aria-label={`Cor ${hex(c)}`} />
              ))}
            </div>
            {sel != null && selColor && used.has(sel) && (
              <div className="colorbox">
                <div className="row">
                  <input type="color" value={hex(selColor)} onChange={(e) => p.onRecolor(sel, parseHex(e.target.value))} aria-label="Trocar cor" />
                  <input type="text" defaultValue={hex(selColor)} key={hex(selColor)}
                    onBlur={(e) => { if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) p.onRecolor(sel, parseHex(e.target.value)) }} aria-label="Código da cor" />
                  <button className="btn small" onClick={() => p.onToggleColor(sel)}>{p.hiddenColors.has(sel) ? 'Mostrar' : 'Apagar'}</button>
                </div>
                {colors.length > 1 && (
                  <div className="row">
                    <span style={{ fontSize: 13 }}>Juntar com</span>
                    <select value="" onChange={(e) => { if (e.target.value) { p.onMergeColor(sel, Number(e.target.value)); setSel(null) } }} aria-label="Juntar com outra cor">
                      <option value="">escolha…</option>
                      {colors.filter((x) => x.i !== sel).map((x) => <option key={x.i} value={x.i}>{hex(x.c)}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div className="hint">Clique numa cor para trocar, apagar ou juntar com outra.</div>
            <div className="colorbox">
              <div className="row">
                <span style={{ fontSize: 13, fontWeight: 550 }}>Faltou uma cor?</span>
                <input type="color" value={addHex} onChange={(e) => setAddHex(e.target.value)} aria-label="Cor para adicionar" />
                {'EyeDropper' in window && (
                  <button className="btn small" onClick={async () => {
                    try {
                      // @ts-expect-error API do Chrome/Edge
                      const r = await new window.EyeDropper().open()
                      setAddHex(r.sRGBHex)
                    } catch { /* cancelado */ }
                  }}>Conta-gotas</button>
                )}
                <button className="btn small" onClick={() => p.onAddColor(parseHex(addHex))}>Adicionar</button>
              </div>
              <div className="hint" style={{ marginTop: 0 }}>Pegue a cor na imagem e adicione: o vetor é refeito com essa cor na paleta.</div>
            </div>
          </>
        )}
      </section>

      <section className="sec">
        <h3>Forma</h3>
        <div className="field">
          <label>Detalhes <span>{s.detail}</span></label>
          <input type="range" min={0} max={100} value={s.detail} onChange={(e) => p.onSettings({ detail: Number(e.target.value) })} aria-label="Detalhes" />
        </div>
        <div className="field">
          <label>Suavidade das curvas <span>{s.smoothness}</span></label>
          <input type="range" min={0} max={100} value={s.smoothness} onChange={(e) => p.onSettings({ smoothness: Number(e.target.value) })} aria-label="Suavidade das curvas" />
        </div>
        <div className="field">
          <label>Cantos</label>
          <div className="seg" style={{ width: '100%' }}>
            {([['auto', 'Automático'], ['sharp', 'Vivos'], ['round', 'Arredondados']] as const).map(([id, l]) => (
              <button key={id} style={{ flex: 1 }} aria-pressed={s.corners === id} onClick={() => p.onSettings({ corners: id })}>{l}</button>
            ))}
          </div>
        </div>
        <label className="switch">
          Remover o fundo
          <input type="checkbox" checked={s.background === 'remove'} onChange={(e) => p.onSettings({ background: e.target.checked ? 'remove' : 'keep' })} />
        </label>
      </section>

      <section className="sec">
        <h3>Exportar</h3>
        <div className="formats">
          {FORMATS.map((f) => <button key={f.id} aria-pressed={p.exp.format === f.id} onClick={() => p.onExp({ format: f.id })}>{f.label}</button>)}
        </div>
        {p.exp.format !== 'png' ? (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Uso</label>
              <div className="seg" style={{ width: '100%' }}>
                <button style={{ flex: 1 }} aria-pressed={p.exp.preset === 'edit'} onClick={() => p.onExp({ preset: 'edit' })}>Edição e impressão</button>
                <button style={{ flex: 1 }} aria-pressed={p.exp.preset === 'cut'} onClick={() => p.onExp({ preset: 'cut' })}>Corte e gravação</button>
              </div>
            </div>
            <div className="field">
              <label>Largura final</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="num" type="number" min={0} step="any" value={p.exp.width || ''} placeholder="original"
                  onChange={(e) => p.onExp({ width: Math.max(0, Number(e.target.value) || 0) })} aria-label="Largura final" />
                <select value={p.exp.unit} onChange={(e) => p.onExp({ unit: e.target.value as Unit })} aria-label="Unidade">
                  <option value="px">px</option><option value="mm">mm</option><option value="cm">cm</option><option value="in">pol</option>
                </select>
              </div>
            </div>
            {p.exp.preset === 'cut' && (
              <div className="field">
                <label>Linhas de corte</label>
                <div className="seg" style={{ width: '100%' }}>
                  <button style={{ flex: 1 }} aria-pressed={p.exp.cutStyle === 'strokeShapes'} onClick={() => p.onExp({ cutStyle: 'strokeShapes' })}>Contorno de cada forma</button>
                  <button style={{ flex: 1 }} aria-pressed={p.exp.cutStyle === 'strokeEdges'} onClick={() => p.onExp({ cutStyle: 'strokeEdges' })}>Bordas sem linha dupla</button>
                </div>
              </div>
            )}
            {p.exp.preset === 'edit' && (
              <>
                <label className="switch">Camadas por cor <input type="checkbox" checked={p.exp.groupByColor} onChange={(e) => p.onExp({ groupByColor: e.target.checked })} /></label>
                {!p.exp.groupByColor && (
                  <label className="switch">Formas empilhadas (sem furos) <input type="checkbox" checked={p.exp.stacking === 'stacked'} onChange={(e) => p.onExp({ stacking: e.target.checked ? 'stacked' : 'cutouts' })} /></label>
                )}
                <label className="switch">Fechar frestas entre cores <input type="checkbox" checked={p.exp.gapFiller} onChange={(e) => p.onExp({ gapFiller: e.target.checked })} /></label>
              </>
            )}
          </>
        ) : (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Resolução <span>{p.exp.pngScale}x</span></label>
            <input type="range" min={1} max={8} value={p.exp.pngScale} onChange={(e) => p.onExp({ pngScale: Number(e.target.value) })} aria-label="Resolução do PNG" />
          </div>
        )}
      </section>

      <div className="dl">
        <button className="btn ink big" onClick={p.onDownload} disabled={!p.result || p.downloading}>
          <IDownload /> {p.downloading ? 'Gerando…' : `Baixar ${p.exp.format.toUpperCase()}`}
        </button>
        <div className="note">{p.sizeHint || 'Grátis, sem marca d’água e sem limite.'}</div>
      </div>
    </aside>
  )
}
