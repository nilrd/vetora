/// <reference lib="webworker" />
import { vectorize } from './engine/index.ts'
import type { Settings } from './engine/types.ts'

export type WorkerIn = { id: number; rgba: Uint8ClampedArray; width: number; height: number; settings: Partial<Settings> }
export type WorkerOut =
  | { id: number; type: 'progress'; stage: string; fraction: number }
  | { id: number; type: 'done'; result: ReturnType<typeof vectorize> }
  | { id: number; type: 'error'; message: string }

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const { id, rgba, width, height, settings } = ev.data
  try {
    let last = 0
    const result = vectorize({
      rgba, width, height, settings,
      onProgress: (stage, fraction) => {
        const now = Date.now()
        if (now - last < 60 && fraction < 1) return
        last = now
        ;(self as unknown as Worker).postMessage({ id, type: 'progress', stage, fraction } satisfies WorkerOut)
      },
    })
    ;(self as unknown as Worker).postMessage({ id, type: 'done', result } satisfies WorkerOut)
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, type: 'error', message: e instanceof Error ? e.message : String(e) } satisfies WorkerOut)
  }
}
