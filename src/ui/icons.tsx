const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const IUpload = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={p.className ?? 'icon'} {...base}><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
)
export const IDownload = () => (
  <svg viewBox="0 0 24 24" className="icon" {...base}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></svg>
)
export const IPlus = () => <svg viewBox="0 0 24 24" className="icon" {...base}><path d="M12 5v14M5 12h14" /></svg>
export const IMinus = () => <svg viewBox="0 0 24 24" className="icon" {...base}><path d="M5 12h14" /></svg>
export const IFit = () => (
  <svg viewBox="0 0 24 24" className="icon" {...base}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></svg>
)
export const IUndo = () => <svg viewBox="0 0 24 24" className="icon" {...base}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
export const IRedo = () => <svg viewBox="0 0 24 24" className="icon" {...base}><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
export const IEraser = () => (
  <svg viewBox="0 0 24 24" className="icon" {...base}><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21" /><path d="M7 21h14" /><path d="m5 11 8 8" /></svg>
)
export const IArrows = () => (
  <svg viewBox="0 0 24 24" className="icon" {...base}><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></svg>
)
export const IImage = () => (
  <svg viewBox="0 0 24 24" className="icon" {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
)
export const ILayers = () => (
  <svg viewBox="0 0 24 24" className="icon" {...base}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
)
