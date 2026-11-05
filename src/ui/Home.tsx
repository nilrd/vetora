import { useEffect, useRef, useState } from 'react'
import { ACCEPT } from '../lib/image.ts'
import { IUpload } from './icons.tsx'
import { LiveDemo } from './LiveDemo.tsx'

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
      const f = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (f) onFile(f, 'colado.png')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onFile])

  return (
    <main className="home">
      <section className="hero">
        <div>
          <p className="kicker">vetorizador de imagens · roda no seu navegador</p>
          <h1>Pixels entram.<br /><em>Curvas</em> saem.</h1>
          <p className="lede">
            Logo, desenho, estampa ou adesivo em SVG, PDF, EPS ou DXF, com bordas exatas, cantos vivos e poucos nós.
            Sua imagem não sai do computador.
          </p>
          <div
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
          >
            <div className="glyph"><IUpload /></div>
            <h2>Solte uma imagem aqui</h2>
            <div className="sub">PNG, JPG, WebP, GIF ou BMP · até 40 MB · várias de uma vez viram lote</div>
            <div className="actions">
              <button className="btn ink big" onClick={() => input.current?.click()}>Escolher arquivo</button>
              <span className="sub">ou cole com <span className="kbd">Ctrl</span> + <span className="kbd">V</span></span>
            </div>
            <input ref={input} type="file" accept={ACCEPT} multiple onChange={(e) => { take(e.target.files); e.target.value = '' }} />
          </div>
          {error && <div className="err" role="alert">{error}</div>}
        </div>
        <LiveDemo onOpen={onFile} />
      </section>

      <section className="spec" id="como-funciona">
        <div>
          <h3>Ficha técnica</h3>
          <dl className="rows">
            <div><dt>formatos</dt><dd>SVG, PDF, EPS, DXF (R12, em mm) e PNG até 8x</dd></div>
            <div><dt>finalidades</dt><dd>Estampa com camadas por cor, bordado, adesivo, corte a laser e desenho a traço</dd></div>
            <div><dt>bordas</dt><dd>Cores vizinhas dividem a mesma curva: sem fresta, sem sobreposição. Posição sub-pixel.</dd></div>
            <div><dt>edição</dt><dd>Trocar, juntar, apagar e adicionar cores; borracha e pincel por região</dd></div>
            <div><dt>privacidade</dt><dd>Tudo roda no seu navegador. Funciona até sem internet.</dd></div>
            <div><dt>preço</dt><dd>Grátis, sem marca d’água e sem limite</dd></div>
          </dl>
        </div>
        <div>
          <h3>Medido, não prometido</h3>
          <p className="note">12 desenhos-gabarito, vetorizados e comparados com o original em 4x. Quanto menor o erro de cor, mais fiel.</p>
          <table className="score">
            <thead><tr><th>imagem</th><th className="num">Vetora</th><th className="num">VTracer</th></tr></thead>
            <tbody>
              <tr><td>PNG</td><td className="num me">0,14</td><td className="num">1,22</td></tr>
              <tr><td>PNG pequeno (140 px)</td><td className="num me">0,57</td><td className="num">2,62</td></tr>
              <tr><td>JPEG comprimido</td><td className="num me">0,72</td><td className="num">1,97</td></tr>
            </tbody>
          </table>
          <p className="hint">Mais fiel em 36 de 36 casos. O teste está no código (<span className="mono">npm run bench</span>).</p>
        </div>
      </section>

      <footer className="foot">
        <span>Vetora · feito no Brasil</span>
        <span><button className="btn ghost small" onClick={() => onBatch([])}>Vetorizar em lote</button> <a href="https://github.com/nilrd/vetora">Código no GitHub</a></span>
      </footer>
    </main>
  )
}
