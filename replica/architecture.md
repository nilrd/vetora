# Arquitetura: Vetora

Lido de: `replica/recon.md`, `replica/features.csv`.
Restrições do dono: custo zero de infraestrutura; qualidade no mínimo igual ao Vectorizer.AI; nada no C: nem no E:.

## Stack

| camada | escolha | por quê |
| --- | --- | --- |
| app web | Vite + React + TypeScript | build estático (sem servidor), rápido, leve; React só pela produtividade do editor |
| estilo | CSS puro com tokens (variáveis CSS) | sem dependência extra; o design final sai do replica-design |
| motor | **Motor Vetora** (TypeScript, próprio) rodando em Web Worker | controle total da qualidade: regiões com bordas compartilhadas (sem frestas), borda sub-pixel, curvas Bézier com cantos, detecção de círculo/elipse/retângulo |
| motor de referência | VTracer (`@visioncortex/vtracer`, MIT/Apache, WebAssembly) | linha de base para comparar; fica como modo alternativo se ganhar em algum tipo de imagem |
| exportação | geradores próprios de SVG, PDF, EPS e DXF a partir do mesmo modelo de formas | sem servidor e sem biblioteca pesada |
| dados | memória + IndexedDB (histórico local) | não existe banco; nada sai do computador |
| banco de testes | Node + `@resvg/resvg-js` (renderiza SVG) + `sharp` (PNG/JPEG) | mede a qualidade de forma objetiva, sem depender de site de terceiros |
| hospedagem | Vercel Hobby (uso pessoal) ou Cloudflare Pages (se vender) | site estático grátis |

Sem banco SQL, sem API, sem login: não existe `schema.sql` neste projeto. O "modelo de dados" vive no navegador.

## Modelo de dados (TypeScript)

```ts
type Settings = {
  imageType: 'auto' | 'clipart' | 'photo' | 'drawing'
  purpose: 'general' | 'print' | 'embroidery' | 'line' | 'sticker' | 'cut'
  maxColors: number          // 2..64 (0 = automático)
  palette?: RGB[]            // paleta fixa
  detail: number             // 0..100
  smoothness: number         // 0..100
  corners: 'auto' | 'sharp' | 'round'
  minArea: number            // px², manchas menores somem
  mergeSimilar: number       // 0..100, distância de cor para juntar tons
  background: 'keep' | 'remove' | RGB
}
type Shape = { id: number; color: RGB; d: string; area: number; parent?: number; primitive?: Primitive }
type VectorResult = { width: number; height: number; colors: ColorInfo[]; shapes: Shape[]; stats: Stats }
type ExportOptions = { format: 'svg'|'pdf'|'eps'|'dxf'|'png'; preset: 'edit'|'cut';
  drawStyle: 'fill'|'strokeShapes'|'strokeEdges'; stacking: 'cutouts'|'stacked';
  groupBy: 'none'|'color'; gapFiller: { on: boolean; width: number };
  size: { mode: 'unchanged'|'width'|'height'|'fit'; value?: number; unit: 'px'|'mm'|'cm'|'in' } }
```

## O motor (onde está a qualidade)

Pipeline, cada etapa testada no banco de testes:

1. **Entrada:** decodifica, converte para RGBA linear, trata transparência (alpha vira "fundo vazio").
2. **Limpeza:** filtro que preserva bordas (bilateral/mediana) só em JPEG ruidoso; ampliação 2x para imagens pequenas.
3. **Paleta:** k-means em espaço Lab com semente por histograma; detecta automaticamente quantas cores importam; antialiasing é reconhecido como mistura de duas cores (não vira cor nova).
4. **Segmentação:** cada pixel recebe a cor da paleta; manchas abaixo da área mínima são absorvidas pelo vizinho mais parecido.
5. **Mapa planar:** as fronteiras entre regiões são extraídas uma única vez e **compartilhadas** pelas duas regiões vizinhas. Por isso não existe fresta nem sobreposição (o "vector graph" do Vectorizer.AI).
6. **Sub-pixel:** cada ponto da fronteira é deslocado pelo valor do antialiasing original, então a borda cai na posição real, não na grade.
7. **Curvas:** detecção de cantos, depois ajuste de Bézier cúbicas por trecho (Schneider) com tolerância; retas viram linhas.
8. **Formas inteiras:** fronteiras fechadas que se encaixam num círculo, elipse ou retângulo (arredondado) dentro da tolerância viram essa forma exata.
9. **Saída:** formas empilhadas ou recortadas; SVG compacto.

## "API" interna (mensagens do Worker)

| mensagem | faz | entrada | saída | fluxo |
| --- | --- | --- | --- | --- |
| `vectorize` | roda o pipeline | ImageData, Settings | VectorResult + progresso | F01, F02, F07 |
| `cancel` | interrompe | jobId | — | F01 |
| `export` | gera arquivo | VectorResult, ExportOptions | Blob | F01, F04, F05 |

## Partes que mordem

- **Desempenho:** imagens grandes → limite de 4 MP com redução automática; tudo em Worker; arrays tipados.
- **Fotos:** milhares de regiões; o modo "foto" usa mais cores e simplificação mais forte, com barra de progresso.
- **Tamanho de arquivo:** coordenadas com 2 casas decimais e caminhos relativos.
- **Compatibilidade:** SVG 1.1 só com linhas e cúbicas (abre em Illustrator, Corel, Inkscape, Cricut); DXF R12 (o mais aceito por máquinas de corte).
- **Memória do navegador:** liberar ImageData grandes logo após o uso.

## Ordem de construção

1. **Fatia vertical:** soltar imagem → motor → ver resultado → baixar SVG (S01, S03, S04, S07). Mais o banco de testes medindo a qualidade.
2. **Qualidade:** iterar o motor até empatar ou passar o VTracer em todas as categorias e atingir as metas objetivas (abaixo).
3. **Must-haves** do `features.csv`: ajustes (S05), editor de cores e fundo (S06), DXF/PDF/EPS, predefinição de corte, frestas, unidades.
4. **Should/could:** lote, histórico, formas inteiras avançadas, PWA offline.

## Metas objetivas de qualidade (banco de testes)

Imagens com gabarito: SVGs nossos (logos, letras, ícones, adesivos, estampas) renderizados em PNG pequeno, com e sem JPEG. Vetorizamos o PNG e comparamos o resultado com o gabarito renderizado em 4x:

- erro de cor médio (ΔE Lab) em 4x: o menor possível, e sempre menor que o do VTracer;
- percentual de pixels errados nas bordas em 4x: menor que o do VTracer;
- frestas: zero pixels de fundo aparecendo entre duas cores (Motor Vetora garante por construção);
- número de nós: próximo do gabarito (curvas limpas, não serrilhado);
- círculos do gabarito devem sair como círculo/elipse.

Riscos principais: (1) chegar ao nível do Vectorizer.AI em JPEG ruim e foto; (2) desempenho em PC fraco; (3) exportar PDF/EPS/DXF corretos sem biblioteca.
