import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VectorResult } from '../engine/types.ts'
import { hex } from '../engine/color.ts'
import { parseD } from '../lib/export.ts'
import { loadImage } from '../lib/image.ts'
import { vectorizeOnce } from '../lib/useVectorizer.ts'

export const DEMO_EXAMPLES = [
  // lens: onde a lupa começa (em cima de uma borda e da divisória)
  { file: 'exemplos/raposa.jpg', name: 'raposa.jpg', label: 'Mascote', lens: { x: 0.385, y: 0.52 } },
  { file: 'exemplos/emblema.png', name: 'emblema.png', label: 'Emblema', lens: { x: 0.42, y: 0.15 } },
  { file: 'exemplos/cafe.jpg', name: 'cafe.jpg', label: 'Logo com texto', lens: { x: 0.36, y: 0.86 } },
  { file: 'exemplos/ilustracao.png', name: 'ilustracao.png', label: 'Ilustração', lens: { x: 0.66, y: 0.24 } },
  { file: 'exemplos/adesivo.png', name: 'adesivo.png', label: 'Adesivo', lens: { x: 0.5, y: 0.29 } },
  { file: 'exemplos/texto.jpg', name: 'texto.jpg', label: 'Texto em JPG', lens: { x: 0.43, y: 0.36 } },
  { file: 'exemplos/engrenagem.png', name: 'engrenagem.png', label: 'Ícone', lens: { x: 0.5, y: 0.12 } },
]

interface Loaded { url: string; w: number; h: number; result: VectorResult; ms: number; blob: Blob; name: string }
const cache = new Map<string, Promise<Loaded>>()

function load(file: string, name: string): Promise<Loaded> {
  let p = cache.get(file)
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(file)).blob()
      const img = await loadImage(blob, name)
      const t0 = performance.now()
      const result = await vectorizeOnce(img.data, {})
      return { url: img.url, w: img.data.width, h: img.data.height, result, ms: performance.now() - t0, blob, name }
    })()
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return p
}

function vectorSvg(r: VectorResult) {
  const strokes = r.shapes.map((s) => `<path stroke="${hex(s.color)}" d="${s.d}"/>`).join('')
  const fills = r.shapes.map((s) => `<path fill="${hex(s.color)}" d="${s.d}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r.width} ${r.height}" preserveAspectRatio="none"><g fill="none" stroke-width="0.5" stroke-linejoin="round">${strokes}</g>${fills}</svg>`
}

/** Nós (pontos das curvas) e alças das Bézier, para mostrar na lupa. */
function nodesOf(r: VectorResult) {
  const anchors: number[] = []
  const handles: number[] = []
  for (const s of r.shapes) {
    let lx = 0, ly = 0
    for (const c of parseD(s.d)) {
      if (c.c === 'M' || c.c === 'L') { lx = c.v[0]; ly = c.v[1]; anchors.push(lx, ly) }
      else if (c.c === 'C') {
        handles.push(lx, ly, c.v[0], c.v[1], c.v[4], c.v[5], c.v[2], c.v[3])
        lx = c.v[4]; ly = c.v[5]; anchors.push(lx, ly)
      }
    }
  }
  return { anchors, handles }
}

interface Props { onOpen: (b: Blob, name: string) => void }

export function LiveDemo({ onOpen }: Props) {
  const [idx, setIdx] = useState(0)
  const [data, setData] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState('')
  const [split, setSplit] = useState(DEMO_EXAMPLES[0].lens.x) // 0..1 da largura
  const [lens, setLens] = useState(DEMO_EXAMPLES[0].lens) // centro da lupa, 0..1
  const [zoom, setZoom] = useState(4)
  const [showNodes, setShowNodes] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const [fw, setFw] = useState(480)
  const drag = useRef<'lens' | 'split' | null>(null)

  useEffect(() => {
    let alive = true
    setBusy(true); setErr('')
    const ex = DEMO_EXAMPLES[idx]
    setLens(ex.lens); setSplit(ex.lens.x)
    load(ex.file, ex.name).then((d) => { if (alive) { setData(d); setBusy(false) } }).catch(() => { if (alive) { setErr('Não deu para carregar o exemplo.'); setBusy(false) } })
    // já prepara o próximo em segundo plano
    const nx = DEMO_EXAMPLES[(idx + 1) % DEMO_EXAMPLES.length]
    const t = setTimeout(() => { load(nx.file, nx.name).catch(() => {}) }, 1200)
    return () => { alive = false; clearTimeout(t) }
  }, [idx])

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(() => setFw(el.clientWidth))
    ro.observe(el)
    setFw(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const svg = useMemo(() => (data ? vectorSvg(data.result) : ''), [data])
  const nodes = useMemo(() => (data ? nodesOf(data.result) : null), [data])

  const w = data?.w ?? 1, h = data?.h ?? 1
  const s = fw / w // px na tela por px da imagem
  const fh = h * s
  const R = Math.round(Math.min(fw, fh) * 0.24)
  const cx = lens.x * fw, cy = lens.y * fh
  const Z = zoom
  const inner = { w: w * s * Z, h: h * s * Z }
  const left = R - (cx / s) * s * Z, top = R - (cy / s) * s * Z
  const splitInnerPx = split * inner.w

  const pointer = useCallback((e: React.PointerEvent) => {
    const el = frame.current!
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    if (drag.current === 'split') setSplit(x)
    else if (drag.current === 'lens') setLens({ x, y })
  }, [])

  const onDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    drag.current = t.closest('.ld-knob') ? 'split' : 'lens'
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointer(e)
  }

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.min(16, Math.max(2, z * Math.exp(-e.deltaY * 0.002))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const k = 1 / (s * Z) // 1 px de tela em unidades da imagem, dentro da lupa
  const st = data?.result.stats

  return (
    <div className="ld">
      <div className="ld-stage">
        <div
          ref={frame}
          className="ld-frame"
          style={{ height: fh }}
          onPointerDown={onDown}
          onPointerMove={(e) => { if (drag.current) pointer(e) }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
          role="img"
          aria-label="Demonstração: lado esquerdo com os pixels da imagem, lado direito com o vetor gerado pelo Vetora. Arraste a lupa e a divisória."
        >
          {data && (
            <>
              <img className="ld-pix" src={data.url} alt="" draggable={false} />
              <div className="ld-vec" style={{ clipPath: `inset(0 0 0 ${split * 100}%)` }} dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="ld-seam" style={{ left: `${split * 100}%` }}><button className="ld-knob" aria-label="Arraste para mover a divisória">⟷</button></div>
              <div className="ld-lens" style={{ width: R * 2, height: R * 2, left: cx - R, top: cy - R }}>
                <div className="ld-lens-in" style={{ width: inner.w, height: inner.h, transform: `translate(${left}px, ${top}px)` }}>
                  <img className="ld-pix" src={data.url} alt="" draggable={false} />
                  <div className="ld-vec" style={{ clipPath: `inset(0 0 0 ${splitInnerPx}px)` }} dangerouslySetInnerHTML={{ __html: svg }} />
                  {showNodes && nodes && (
                    <svg className="ld-nodes" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ clipPath: `inset(0 0 0 ${splitInnerPx}px)` }}>
                      <g stroke="#4b3fd6" strokeWidth={1.2 * k} fill="none">
                        {Array.from({ length: nodes.handles.length / 4 }, (_, i) => {
                          const o = i * 4
                          return <line key={i} x1={nodes.handles[o]} y1={nodes.handles[o + 1]} x2={nodes.handles[o + 2]} y2={nodes.handles[o + 3]} />
                        })}
                      </g>
                      <g fill="#4b3fd6">
                        {Array.from({ length: nodes.handles.length / 4 }, (_, i) => (
                          <circle key={i} cx={nodes.handles[i * 4 + 2]} cy={nodes.handles[i * 4 + 3]} r={2.2 * k} />
                        ))}
                      </g>
                      <g fill="#fff" stroke="#141413" strokeWidth={1.3 * k}>
                        {Array.from({ length: nodes.anchors.length / 2 }, (_, i) => (
                          <rect key={i} x={nodes.anchors[i * 2] - 3 * k} y={nodes.anchors[i * 2 + 1] - 3 * k} width={6 * k} height={6 * k} />
                        ))}
                      </g>
                    </svg>
                  )}
                </div>
              </div>
            </>
          )}
          {busy && <div className="ld-busy"><span className="spin" /> Vetorizando ao vivo…</div>}
          {err && <div className="ld-busy">{err}</div>}
        </div>
        <div className="ld-zoom" aria-label="Zoom da lupa">
          <span>+</span>
          <input type="range" min={2} max={16} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom da lupa" />
          <span>−</span>
          <b>{zoom.toFixed(0)}x</b>
        </div>
      </div>

      <div className="ld-bar">
        <span className="ld-lbl">pixels</span>
        <span className="ld-info">
          {st && data ? <>{st.colors} cores · {st.nodes} nós · {(data.ms / 1000).toFixed(1)} s · {data.w}×{data.h}</> : 'vetorizando…'}
        </span>
        <span className="ld-lbl r">vetor</span>
      </div>

      <div className="ld-actions">
        <label className="switch ld-switch"><input type="checkbox" checked={showNodes} onChange={(e) => setShowNodes(e.target.checked)} /> Mostrar nós e alças</label>
        <button className="btn small" disabled={!data} onClick={() => data && onOpen(data.blob, data.name)}>Abrir este exemplo no editor</button>
      </div>

      <div className="ld-gallery" role="listbox" aria-label="Exemplos">
        {DEMO_EXAMPLES.map((ex, i) => (
          <button key={ex.file} role="option" aria-selected={i === idx} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} title={ex.label}>
            <img src={ex.file} alt={ex.label} />
          </button>
        ))}
      </div>
    </div>
  )
}
