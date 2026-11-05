# Plano de testes: Vetora

## Automáticos
| o quê | como rodar | resultado em 2026-11-05 |
| --- | --- | --- |
| Testes do motor e da exportação (13) | `npm test` | 13 de 13 passando |
| Banco de qualidade (12 imagens × PNG/pequena/JPEG = 36 casos) | `npm run bench -- --save` | Vetora mais fiel que o VTracer em 36 de 36 |
| Tipos (TypeScript) | `npx tsc -p tsconfig.json --noEmit` | sem erros |
| Build de produção | `npm run build` | 82 KB gzip + motor 27 KB |

Os testes do motor conferem: cores exatas (sem cor nova vinda do antialiasing), mapa planar (cada fronteira interna usada pelas duas regiões = sem fresta), círculo exato, cantos vivos no lugar, transparência, remover fundo, juntar cores com paleta fixa, imagens de 1 px e de uma cor só, SVG/PDF/DXF válidos, corte por bordas sem linha dupla e cor adicionada.

## Arquivos validados em programas de terceiros
- PDF: aberto e renderizado no PyMuPDF (tamanho exato em mm).
- DXF: `ezdxf.audit()` sem erros; extensão dentro da largura pedida; uma camada por cor.

## Fluxos testados no navegador (desenvolvimento e produção)
| fluxo | caso | resultado |
| --- | --- | --- |
| F01 logo → SVG | exemplo ilustração: 7 cores idênticas ao original, 64 nós, 0,2 s | ok |
| F01 | baixar SVG, PDF, EPS, DXF, PNG | 5 arquivos gerados, sem erro |
| F02 cores | trocar cor, juntar com cor escolhida, adicionar cor | ok (bug corrigido, ver bugs.md) |
| F03 fundo | Borracha em uma região + desfazer | ok |
| F03 | Pincel em uma região | ok |
| F04 corte | finalidade Corte a laser → DXF, mm, 100 mm, fundo removido | ok |
| F06 lote | 3 imagens → .zip | ok |
| produção | worker + service worker (offline) ativos | ok |
| desempenho | 2000×2000 px (limite de 4 MP) | 1,5 s |

## Casos-limite cobertos
JPEG ruidoso, imagem pequena (140 px), traço de 1,5 px, texto de 10–14 px, transparência, degradê/foto, imagem de 1 px.
