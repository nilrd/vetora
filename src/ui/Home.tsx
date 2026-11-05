import { useEffect, useRef, useState } from 'react'
import { ACCEPT } from '../lib/image.ts'
import { IUpload, ILayers } from './icons.tsx'

const EXAMPLES = [
  { file: 'exemplos/adesivo.png', name: 'adesivo.png' },
  { file: 'exemplos/ilustracao.png', name: 'ilustracao.png' },
  { file: 'exemplos/texto.jpg', name: 'texto.jpg' },
  { file: 'exemplos/engrenagem.png', name: 'engrenagem.png' },
]

interface Props {
  onFile: (f: Blob, name: string) => void
  onBatch: (files: File[]) => void
  error: string
}

export function Home({ onFile, onBatch, error }: Props) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const take = (files: FileList | File[] | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (list.length > 1) onBatch(list)
    else if (list.length === 1) onFile(list[0], list[0].name)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) onFile(f, 'colado.png')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onFile])

  return (
    <main className="home">
      <div className="hero">
        <h1>Transforme imagens em vetor<br />com qualidade de verdade</h1>
        <p>Logos, desenhos, estampas e adesivos viram SVG, PDF, EPS ou DXF limpos, prontos para imprimir, cortar ou editar. Grátis e sem enviar sua imagem para lugar nenhum.</p>
      </div>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
      >
        <IUpload className="big-icon" />
        <h2>Solte a imagem aqui</h2>
        <button className="btn primary big" onClick={() => input.current?.click()}>Escolher imagem</button>
        <div className="muted">ou cole com Ctrl+V · PNG, JPG, WebP, GIF ou BMP · várias de uma vez viram lote</div>
        <input ref={input} type="file" accept={ACCEPT} multiple onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      </div>
      {error && <div className="err" role="alert">{error}</div>}
      <div className="examples">
        <div className="label">Sem imagem à mão? Teste com um exemplo:</div>
        <div className="row">
          {EXAMPLES.map((x) => (
            <button key={x.file} style={{ backgroundImage: `url(${x.file})` }} aria-label={`Exemplo ${x.name}`}
              onClick={async () => { const b = await (await fetch(x.file)).blob(); onFile(b, x.name) }} />
          ))}
        </div>
      </div>
      <div className="feats">
        <div className="feat"><b>Bordas exatas</b><span>As cores vizinhas dividem a mesma curva: não sobra fresta branca nem sobreposição.</span></div>
        <div className="feat"><b>Curvas e cantos limpos</b><span>Círculo sai como círculo, canto vivo sai vivo. Poucos nós, fácil de editar.</span></div>
        <div className="feat"><b>Pronto para produção</b><span>Estampa com camadas por cor, bordado, adesivo e corte a laser em milímetros (DXF).</span></div>
        <div className="feat"><b>Privado e sem limite</b><span>Tudo roda no seu navegador. Baixe quantas vezes quiser, sem marca d’água.</span></div>
      </div>
      <p style={{ textAlign: 'center', marginTop: 28 }}>
        <button className="btn ghost" onClick={() => onBatch([])}><ILayers /> Vetorizar várias imagens de uma vez</button>
      </p>
    </main>
  )
}
