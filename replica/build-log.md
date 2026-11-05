# Registro de construção: Vetora

Data: 2026-11-05. Construído em uma sessão, com o banco de testes ligado o tempo todo.

## Fatia vertical (F01)
- Motor próprio em TypeScript (`src/engine/`): paleta, segmentação, mapa planar, sub-pixel, curvas e formas.
- Web Worker (`src/worker.ts`) + hook com cancelamento (`src/lib/useVectorizer.ts`).
- Tela inicial S01 (soltar, escolher, colar, exemplos), editor S04 (cortina, zoom, arrastar), download SVG.

## Qualidade do motor (iterações medidas no `npm run bench`)
| passo | o que mudou | ΔE médio PNG / pequena / JPEG |
| --- | --- | --- |
| 1 | primeira versão | 0,42 / 1,15 / 1,80 |
| 2 | filtro de ruído para JPEG + junção de cores quase iguais | — |
| 3 | cores de traços finos (uma por vez, a mais pura) | 0,26 / 0,79 / 0,82 |
| 4 | sub-pixel correto para traços de 1–2 px | 0,22 / 0,68 / 0,76 |
| 5 | franjas de antialiasing/JPEG somem; cantos em duas escalas | 0,22 / 0,65 / 0,75 |
| 6 | limite de ruído 0,2 → 0,06 | 0,22 / 0,65 / 0,72 |
| 7 | detector de antialiasing por "cores raras" | **0,14** / **0,57** / 0,72 |
| 8 | traço fino desbotado no JPEG vira uma cor só | 0,14 / 0,57 / **0,69** |
| 9 | variações raras de cor do JPEG + curvas mais suaves com ruído | 0,14 / 0,57 / 0,72 (nós JPEG 393 → 319) |
| — | teste: ampliar 2x por dentro | piorou (0,17 / 0,62 / 0,80): ficou desligado |

Referência VTracer no mesmo banco: 1,22 / 2,62 / 1,97.

## Interface
- Editor: Comparar / Vetor / Original / Contornos; zoom na rodinha; Borracha; Pincel; desfazer/refazer.
- Painel: 6 finalidades, tipo de imagem, quantidade de cores, juntar tons, paleta (trocar, apagar, juntar, adicionar com conta-gotas), detalhes, suavidade, cantos, remover fundo.
- Exportar: SVG, PDF, EPS, DXF (R12, mm), PNG (1–8x); edição/corte; camadas por cor; empilhado/recortes; fechar frestas; largura em px/mm/cm/pol; corte por contorno ou por bordas (sem linha dupla).
- Lote com .zip; PWA offline; tema claro/escuro; layout de celular.

## Features.csv
32 de 32 "must" prontos. Paridade de recursos 86,9 (ver `parity.md`).
