import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IArrows } from './icons.tsx'

export type ViewMode = 'compare' | 'vector' | 'original' | 'outline'

interface Props {
  imgUrl: string
  width: number
  height: number
  svg: string
  outlineSvg: string
  mode: ViewMode
  pickable: boolean
  onPick: (id: number) => void
  zoomCmd: { kind: 'in' | 'out' | 'fit'; n: number } | null
  onZoomChange: (z: number) => void
}

/** Mostra original e vetor, com cortina para comparar, zoom na rodinha e arrastar para mover. */
export function Viewer(p: Props) {
  const vp = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const [split, setSplit] = useState(50)
  const [grab, setGrab] = useState(false)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; knob: boolean } | null>(null)

  const fit = useCallback(() => {
    const el = vp.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = Math.min((r.width - 48) / p.width, (r.height - 48) / p.height)
    const sc = Math.max(0.05, s)
    setView({ s: sc, x: (r.width - p.width * sc) / 2, y: (r.height - p.height * sc) / 2 })
  }, [p.width, p.height])

  useLayoutEffect(() => { fit() }, [fit, p.imgUrl])
  useEffect(() => {
    const el = vp.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])
  useEffect(() => { p.onZoomChange(view.s) }, [view.s]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const el = vp.current!
      const r = el.getBoundingClientRect()
      const px = cx ?? r.width / 2, py = cy ?? r.height / 2
      const s = Math.min(64, Math.max(0.05, v.s * factor))
      const k = s / v.s
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }, [])

  useEffect(() => {
    if (!p.zoomCmd) return
    if (p.zoomCmd.kind === 'fit') fit()
    else zoomAt(p.zoomCmd.kind === 'in' ? 1.4 : 1 / 1.4)
  }, [p.zoomCmd]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = vp.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onDown = (e: React.PointerEvent) => {
    const knob = (e.target as HTMLElement).closest('.knob') != null
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, knob }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (!knob) setGrab(true)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.knob) {
      const r = vp.current!.getBoundingClientRect()
      const x = (e.clientX - r.left - view.x) / (p.width * view.s)
      setSplit(Math.max(0, Math.min(100, x * 100)))
    } else setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGrab(false)
    if (d && !d.moved && !d.knob && p.pickable) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null
      const path = el?.closest('path[data-id]')
      if (path) p.onPick(Number(path.getAttribute('data-id')))
    }
  }

  const W = p.width * view.s, H = p.height * view.s
  const showOrig = p.mode === 'compare' || p.mode === 'original'
  const showVec = p.mode === 'compare' || p.mode === 'vector'
  return (
    <div
      ref={vp}
      className={`viewport${grab ? ' grabbing' : ''}${p.pickable ? ' pick' : ''}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onDoubleClick={() => fit()}
      role="img" aria-label="Comparação entre a imagem original e o vetor"
    >
      <div className="canvas" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px)` }}>
        {showOrig && <img src={p.imgUrl} alt="" draggable={false} style={{ imageRendering: view.s > 2 ? 'pixelated' : 'auto' }} />}
        {showVec && (
          <div
            className={`vec${p.pickable ? ' pickable' : ''}`}
            style={p.mode === 'compare' ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
            dangerouslySetInnerHTML={{ __html: p.svg }}
          />
        )}
        {p.mode === 'outline' && <div className="vec" style={{ background: '#fff' }} dangerouslySetInnerHTML={{ __html: p.outlineSvg }} />}
        {p.mode === 'compare' && (
          <div className="split" style={{ left: `${split}%`, width: 0, right: 'auto' }}>
            <div className="knob" aria-label="Arraste para comparar"><IArrows /></div>
          </div>
        )}
      </div>
      {p.mode === 'compare' && <><span className="tag-corner l">Original</span><span className="tag-corner r">Vetor</span></>}
    </div>
  )
}
