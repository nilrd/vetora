import { useState } from 'react'

interface Props {
  onSend: (comentario: string) => Promise<void>
  onClose: () => void
}

/** Caixa do "Ficou ruim": um comentário opcional e o envio. */
export function RelatoDialog(p: Props) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const enviar = async () => {
    setEstado('sending')
    try { await p.onSend(texto); setEstado('ok'); setTimeout(p.onClose, 1600) } catch { setEstado('err') }
  }
  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal" role="dialog" aria-labelledby="relato-t" onClick={(e) => e.stopPropagation()}>
        <h3 id="relato-t">Ficou ruim? Me conta.</h3>
        <p>A imagem que você subiu, o vetor que saiu e os ajustes usados são enviados para análise. Cada caso vira um teste permanente do Vetora.</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="O que ficou ruim? (opcional) Ex.: borda serrilhada no topo, miolo da letra tampado…" />
        {estado === 'err' && <p className="err">Não deu para enviar. Confira a internet e tente de novo.</p>}
        {estado === 'ok' && <p className="ok">Recebido, obrigado! Isso vai virar melhoria.</p>}
        <div className="row">
          <button className="btn ghost" onClick={p.onClose}>Cancelar</button>
          <button className="btn primary" onClick={enviar} disabled={estado === 'sending' || estado === 'ok'}>{estado === 'sending' ? 'Enviando…' : 'Enviar relato'}</button>
        </div>
      </div>
    </div>
  )
}
