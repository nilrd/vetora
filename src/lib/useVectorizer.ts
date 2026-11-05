import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings, VectorResult } from '../engine/types.ts'
import type { WorkerOut } from '../worker.ts'

export type Status = 'idle' | 'working' | 'done' | 'error'

function makeWorker() {
  return new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' })
}

/** Roda o motor num Worker. Um pedido novo cancela o anterior (o Worker é recriado). */
export function useVectorizer() {
  const workerRef = useRef<Worker | null>(null)
  const idRef = useRef(0)
  const busyRef = useRef(false)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState({ stage: '', fraction: 0 })
  const [result, setResult] = useState<VectorResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => workerRef.current?.terminate(), [])

  const run = useCallback((img: ImageData, settings: Partial<Settings>): Promise<VectorResult> => {
    if (busyRef.current && workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    if (!workerRef.current) workerRef.current = makeWorker()
    const w = workerRef.current
    const id = ++idRef.current
    busyRef.current = true
    setStatus('working')
    setProgress({ stage: 'preparando', fraction: 0 })
    setError('')
    return new Promise((resolve, reject) => {
      w.onmessage = (ev: MessageEvent<WorkerOut>) => {
        const m = ev.data
        if (m.id !== idRef.current) return
        if (m.type === 'progress') setProgress({ stage: m.stage, fraction: m.fraction })
        else if (m.type === 'done') { busyRef.current = false; setResult(m.result); setStatus('done'); resolve(m.result) }
        else { busyRef.current = false; setError(m.message); setStatus('error'); reject(new Error(m.message)) }
      }
      w.onerror = (e) => { busyRef.current = false; setError(e.message || 'Erro no processamento'); setStatus('error'); reject(e) }
      const copy = new Uint8ClampedArray(img.data)
      w.postMessage({ id, rgba: copy, width: img.width, height: img.height, settings }, [copy.buffer])
    })
  }, [])

  const reset = useCallback(() => { setResult(null); setStatus('idle'); setError('') }, [])

  return { run, reset, status, progress, result, setResult, error }
}

/** Para o lote: roda uma imagem por vez num Worker próprio. */
export function vectorizeOnce(img: ImageData, settings: Partial<Settings>): Promise<VectorResult> {
  const w = makeWorker()
  return new Promise((resolve, reject) => {
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data
      if (m.type === 'done') { w.terminate(); resolve(m.result) }
      else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)) }
    }
    w.onerror = (e) => { w.terminate(); reject(e) }
    const copy = new Uint8ClampedArray(img.data)
    w.postMessage({ id: 1, rgba: copy, width: img.width, height: img.height, settings }, [copy.buffer])
  })
}
