# Recon map: Vetorizadores de imagem (web)

Escopo: o ciclo principal de um vetorizador. O usuário envia uma imagem (PNG/JPG/WebP), o app vetoriza, ele ajusta o resultado e baixa em SVG/PDF/EPS/DXF.
Para: uso pessoal do Nilson primeiro, talvez virar produto depois.
Restrição do dono: **custo zero de infraestrutura** e **tem que funcionar de verdade**.
Data: 2026-11-05

Apps estudados:
- **Vectorizer.AI** (vectorizer.ai): o mais citado como melhor em qualidade. É a referência principal.
- **vectorizer.io**: indicado pelo amigo como o melhor, mas as comparações quase não falam dele e as que falam dizem "qualidade varia". Não é o líder.
- **DesignVerse / VectorEasy** (designverse.com.br/vetorizador): indicado como segundo melhor. Tem boas ideias de UX para o público brasileiro (estampa, bordado, adesivo).

Também aparecem como referência de mercado: Adobe Illustrator Image Trace (o mais controlável, pago), Vector Magic (logos), Inkscape/Potrace (grátis, só preto e branco), Recraft (gera e vetoriza), Figma (vetorizador nativo desde fev/2026).

## Fontes

| # | fonte | URL | observações |
| --- | --- | --- | --- |
| 1 | site Vectorizer.AI | https://vectorizer.ai/ | fluxo, editor, formatos, limites (3 MP, 30 MB), prévia grátis e download pago |
| 2 | API Vectorizer.AI (visão geral) | https://vectorizer.ai/api | endpoints vectorize/download/delete, token para baixar de novo |
| 3 | opções de saída Vectorizer.AI | https://vectorizer.ai/api/outputOptions | lista completa de opções de exportação: é o melhor mapa de recursos |
| 4 | site vectorizer.io | https://www.vectorizer.io/ | entrada PNG/BMP/JPEG, saída SVG/EPS/DXF, login por código no e-mail |
| 5 | preços vectorizer.io | https://www.vectorizer.io/pricing/ | passe de 1 semana ou mensal, sem plano grátis, 100 downloads/hora |
| 6 | FAQ vectorizer.io | https://www.vectorizer.io/faq/ | temas: cores faltando, transparência, gradientes, pintura por números, SVG < 15 KB |
| 7 | vetorizador DesignVerse | https://designverse.com.br/vetorizador | tipos (auto/clipart/foto/desenho), algoritmo por uso (estampa/bordado/linha/adesivo), ajustes finos, prévia grátis |
| 8 | preços DesignVerse | https://designverse.com.br/precos | R$ 27 a R$ 98/mês por um pacote de IA e bancos de imagem; o vetorizador é uma parte |
| 9 | VectorEasy | https://vectoreasy.ai/ | motor do DesignVerse; SVG/EPS, até 10 MB, 14 idiomas, editar e ver são grátis, baixar é pago |
| 10 | comparativos 2026 | recraft.ai, atomm.com, perfectvector.com, vectosolve.com | Vectorizer.AI lidera em qualidade; vários comparativos são de quem vende o próprio produto |
| 11 | VTracer (código aberto) | https://github.com/visioncortex/vtracer | MIT, Rust, roda no navegador via WebAssembly, imagens coloridas |
| 12 | VTracer no navegador | https://github.com/JacobHayes/vectorize | prova de que roda 100% local no navegador |
| 13 | SVGit4Me | https://npmjs.com/package/svgit4me | VTracer (cor) + Potrace (P&B) no navegador |

Ainda não feito: screenshots das telas originais em `replica/screens/`. Ficam para o replica-design, com o Nilson navegando junto, sem login.

## Core loop

Enviar uma imagem e receber um vetor limpo que já sai pronto para o uso (estampa, corte, logo), sem precisar consertar à mão no Illustrator. É por isso que se paga: nos três apps, ver é grátis e **baixar é pago**.

## Como cada um cobra (e por que o nosso pode ser grátis)

| app | modelo | onde roda a vetorização |
| --- | --- | --- |
| Vectorizer.AI | prévia grátis, download por assinatura | no servidor deles (IA própria; GPU custa caro) |
| vectorizer.io | passe semanal ou mensal | no servidor deles |
| DesignVerse | assinatura R$ 27–98/mês (pacote) | no servidor (VectorEasy) |
| **o nosso** | **grátis** | **no navegador de quem usa**, com um motor de código aberto em WebAssembly. Site estático hospedado de graça. Sem servidor, sem banco, sem login. |

## Telas

| ID | tela | como chegar | função | componentes principais | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Início / envio | `/` | receber a imagem | área de arrastar e soltar, botão escolher arquivo, colar com Ctrl+V, imagens de exemplo, texto do que aceita | vazio, arrastando, arquivo inválido, grande demais (pede recorte) |
| S02 | Recorte prévio | automático se a imagem passar do limite | reduzir a área ou o tamanho | caixa de recorte, contador de MP | ok, ainda grande demais |
| S03 | Processando | depois do envio | mostrar progresso | barra/etapas, cancelar | processando, erro, cancelado |
| S04 | Resultado | depois de processar | comparar e conferir | visualizador lado a lado ou com cortina, zoom e pan, alternar pixel/vetor/contornos, contagem de cores e formas | ok, sem cores (só fundo), muitas formas (aviso) |
| S05 | Ajustes de vetorização | painel lateral do S04 | reprocessar com outros parâmetros | tipo da imagem (auto/clipart/foto/desenho), finalidade (estampa/bordado/linha/adesivo/corte), número de cores, paleta fixa, detalhe, suavização, cantos, área mínima/manchas, mesclar tons parecidos, cor de fundo | padrão, alterado (reprocessar), reprocessando |
| S06 | Editor do resultado | botão "Refinar" no S04 | consertar sem sair do app | fundo (remover automático e clicar para manter ou tirar), paleta (editar, juntar, apagar cor), regiões (recolorir, juntar, apagar), cantos (vivo, redondo, auto), desfazer/refazer, aplicar/descartar | sem alteração, alterado, aplicando |
| S07 | Exportar | botão "Baixar" | escolher formato e opções | formato (SVG/PDF/EPS/DXF/PNG), predefinição (edição, corte e gravação), estilo (preenchimento, contorno de formas, contorno de bordas), empilhamento (recortes ou empilhado), agrupar (nada/cor/pai/camada), tipos de curva, tolerância, preenchimento de frestas, tamanho e unidade (px/mm/cm/pol), versão SVG, compatível com Adobe, DXF (linhas, arcos, splines) | padrão, personalizado, gerando, pronto |
| S08 | Lote | menu | vetorizar várias imagens com os mesmos ajustes | lista de arquivos, progresso por item, baixar tudo em .zip | vazio, processando, com falhas |
| S09 | Histórico | menu | reabrir trabalhos recentes | lista com miniatura, reabrir, apagar | vazio, com itens |
| S10 | Ajuda / dicas | menu | ensinar a obter bons resultados | dicas por finalidade (estampa, bordado, laser, logo), FAQ | — |

Os originais também têm conta, preços e assinatura (login, checkout, portal de cancelamento). No nosso, para uso pessoal, isso **fica de fora** (ver "Fora do escopo").

## Fluxos

```
F01 Vetorizar um logo e baixar SVG
    S01 -> S03 -> S04 -> S07
    cliques no caminho feliz (Vectorizer.AI): soltar a imagem (1) -> Baixar (2) -> escolher formato (3) -> assinatura (bloqueio)
    meta do nosso: soltar a imagem (1) -> Baixar SVG (2). Sem bloqueio.
    borda: JPEG com ruído; logo pequeno (< 300 px); fundo branco que deveria ser transparente; PNG com transparência

F02 Arrumar as cores antes de baixar
    S04 -> S05 (reduzir para N cores ou fixar paleta) -> S04 -> S06 (juntar/recolorir) -> S07
    borda: cor importante some ao reduzir (o FAQ do vectorizer.io tem "adicionar cores faltando"); gradiente vira faixas

F03 Tirar o fundo
    S04 -> S06 fundo automático -> clicar em regiões para manter ou tirar -> S07
    borda: fundo da mesma cor de partes do desenho; fundo com degradê

F04 Preparar para corte a laser / plotter / gravação
    S01 -> S05 finalidade "corte" -> S07 predefinição "corte e gravação" (contornos finos), DXF ou SVG em mm
    borda: precisa de linha única (não preenchimento); medida exata em mm; sem nós duplicados

F05 Separar cores para estampa (silk) / bordado
    S01 -> S05 finalidade "estampa" ou "bordado", paleta limitada -> S07 agrupar por cor (uma camada por cor)
    borda: cores parecidas precisam virar uma só; detalhes pequenos demais para o bordado

F06 Vetorizar várias imagens de uma vez
    S08 -> mesmos ajustes em todas -> baixar .zip
    borda: uma imagem falha e não pode travar as outras

F07 Foto em vetor (efeito ilustração)
    S01 tipo "foto" -> S05 mais cores, mais detalhe -> S07
    borda: arquivo enorme (milhares de formas); demora no navegador
```

## Componentes

| componente | variações | estados | usado em |
| --- | --- | --- | --- |
| Área de envio | página inteira, compacta | vazia, arrastando, erro | S01, S08 |
| Visualizador comparativo | lado a lado, cortina deslizante | carregando, pronto; zoom/pan | S04, S06 |
| Alternador de vista | pixel, vetor, contornos | — | S04 |
| Slider com valor | detalhe, suavização, cores, área mínima | padrão, alterado, desabilitado | S05 |
| Seletor segmentado | tipo de imagem, finalidade, cantos | — | S05, S06 |
| Paleta de cores | chips editáveis (hex/RGB), juntar, apagar | normal, selecionada, removida | S05, S06 |
| Ferramenta de clique em região | manter, tirar, recolorir | hover, selecionada | S06 |
| Barra desfazer/refazer | — | habilitada, desabilitada | S06 |
| Diálogo de exportação | básico, avançado (opções recolhidas) | padrão, gerando, pronto | S07 |
| Barra de progresso | determinada, por etapas | — | S03, S08 |
| Toast/aviso | sucesso, erro, aviso | — | todas |
| Lista de arquivos | com miniatura e status | na fila, processando, ok, erro | S08, S09 |

## Modelo de dados inferido

Como tudo roda no navegador, não existe banco no servidor. Os dados ficam na memória e, no máximo, no IndexedDB do próprio navegador (histórico).

```
Trabalho (Job)  id, criado_em, arquivo_original {nome, tipo, bytes, largura, altura},
                ajustes (Ajustes), resultado (Resultado), edicoes [Edicao], status
                evidência: S01-S04 em todos os apps; Vectorizer.AI guarda o resultado 24 h e devolve um token para baixar outros formatos depois
                confiança: alta

Ajustes         tipo_imagem (auto|clipart|foto|desenho), finalidade (geral|estampa|bordado|linha|adesivo|corte),
                max_cores, paleta_fixa [cor], detalhe, suavizacao, cantos, area_minima, mesclar_tons_parecidos, cor_fundo
                evidência: DesignVerse (todos os controles), Vectorizer.AI (paleta, número de cores)
                confiança: alta

Resultado       svg, largura, altura, cores [Cor], formas [Forma], estatisticas {n_formas, n_cores, bytes}
                confiança: alta

Forma (Shape)   id, cor, caminho (path), area, pai_id (para empilhamento), tipo_detectado (livre|círculo|elipse|retângulo|triângulo|estrela)
                evidência: Vectorizer.AI "parameterized shapes", "group by parent", "shape stacking"
                confiança: média

Cor             hex, rgb, n_formas, removida (bool)
                evidência: editor de paleta do Vectorizer.AI ("show removed colors")
                confiança: alta

Edicao          tipo (recolorir|juntar_cor|remover_regiao|remover_fundo|canto), alvo, valores, ordem (para desfazer/refazer)
                evidência: editor "Refine result" do Vectorizer.AI
                confiança: média

OpcoesExport    formato (svg|pdf|eps|dxf|png), predefinicao (edicao|corte_gravacao), estilo (preencher|contornar_formas|contornar_bordas),
                empilhamento (recortes|empilhado), agrupar (nada|cor|pai|camada), curvas_permitidas [linha|quadratica|cubica|arco|arco_eliptico],
                tolerancia (0.30|0.10|0.03|0.01 px), frestas {ativo, recortar, espessura}, tamanho {modo, largura, altura, unidade px|mm|cm|pol},
                svg_versao (1.1|tiny1.2), compat_adobe, dxf_compat (linhas|linhas_arcos|linhas_arcos_splines)
                evidência: https://vectorizer.ai/api/outputOptions
                confiança: alta
```

Relações: Trabalho 1-1 Ajustes, Trabalho 1-1 Resultado, Resultado 1-n Forma, Resultado 1-n Cor, Trabalho 1-n Edicao, Lote 1-n Trabalho.

## Matriz de recursos

Ver `features.csv`. Must: 34, should: 20, could: 13, skip: 5 (72 linhas).

## Fora do escopo (não dá ou não deve ser clonado)

- **A IA proprietária do Vectorizer.AI** (redes treinadas por eles, "15 anos de experiência"). Não temos o modelo nem o conjunto de dados. Para chegar perto, usamos uma cadeia aberta: limpeza da imagem, redução de cores, VTracer, ajuste de formas e preenchimento de frestas. **Igualar a qualidade dele em fotos difíceis não está prometido.** Em logos e cliparts dá para chegar muito perto.
- **Conta, login, assinatura e pagamento.** Não fazem sentido para uso pessoal e exigiriam servidor (custo). Se um dia virar produto, entram de novo pelo replica-backend.
- **API para terceiros.** Exige servidor rodando; fica para depois, se houver demanda.
- **Banco de imagens, gerador de imagem e Editor Mágico com IA do DesignVerse.** São outros produtos, com conteúdo licenciado e custo de IA.
- **Marcas, textos, ícones e imagens de exemplo dos originais.** Vamos usar só exemplos nossos.

## Meta de qualidade (portão: se ficar pior, não lança)

Exigência do Nilson: **no mínimo igual ao Vectorizer.AI**. O objetivo é ser melhor; ficar pior não é aceitável e, nesse caso, não se constrói.

Como garantir isso sem prometer no escuro:
1. **Banco de testes** com ~20 imagens nossas: logos, cliparts, textos, adesivos, desenhos a traço, estampas, 3 fotos e 3 JPEGs ruins/pequenos.
2. Cada imagem passa no Vectorizer.AI (a prévia é grátis) e no nosso. Comparamos lado a lado com zoom: bordas, cantos, círculos, frestas, cores, número de nós e tamanho do arquivo. O replica-diff ajuda com a comparação de layout.
3. **Portão:** a construção completa só segue quando o nosso **empatar ou ganhar** em logos, cliparts, texto e adesivos. Se não empatar com algoritmo, entra a camada de IA (abaixo). Se nem assim empatar, paramos, sem gastar semanas à toa.

## De onde vem a qualidade do Vectorizer.AI e como chegar lá

Pelo que eles mesmos descrevem, a qualidade vem de duas coisas:
- **IA treinada por eles:** decide onde fica cada borda, separa cores e simplifica bordas fracas. Não temos esse modelo.
- **Geometria caprichada:** formas inteiras (círculos, elipses, retângulos, estrelas), bordas com precisão sub-pixel (usando o antialiasing), vizinhos que se encaixam sem fresta ("vector graph"), simetria, cantos vivos ou redondos. **Isso é engenharia, não IA paga**, e dá para fazer.

Nosso caminho, em camadas (cada uma só entra se o teste mostrar que precisa):

| camada | o que faz | onde roda | custo |
| --- | --- | --- | --- |
| 1. Geometria | detecção de formas, sub-pixel, bordas compartilhadas sem fresta, cantos, simplificação | navegador | R$ 0 |
| 2. Limpeza com IA pequena | ampliar imagem pequena, tirar ruído de JPEG, remover fundo (modelos abertos em ONNX/WebGPU) | navegador (placa de vídeo de quem usa) | R$ 0 |
| 3. IA de vetorização grande | modelos abertos como StarVector (1B/8B) ou pesquisas novas (VectorArk 2026) | servidor com GPU | ver custos |

Observação sobre os modelos abertos: o StarVector gera o SVG como "código" e vai bem em ícones simples, mas não é feito para traçar fielmente imagens complexas. Não serve como substituto direto. Fica como opção de pesquisa, não como base.

## Custos (se algum dia precisar de servidor com IA)

- **Camadas 1 e 2:** zero. Tudo roda no navegador, e o site fica hospedado de graça (GitHub Pages, Cloudflare Pages ou Vercel Hobby; o Vercel Hobby é só para uso não comercial).
- **Camada 3, GPU sob demanda (paga por segundo, só quando usa):**
  - Modal: dá US$ 30/mês de crédito grátis; H100 a cerca de US$ 4/hora. Exemplo publicado: 100 pedidos de 2 s por dia ≈ US$ 17/mês.
  - RunPod Serverless: GPUs de 24 GB (L4, 3090) a cerca de US$ 0,69/hora.
  - Replicate: A100 a cerca de US$ 0,0014/segundo.
  - Para uso pessoal (dezenas de imagens por dia), cabe no crédito grátis do Modal. **Se virar produto com muitos usuários, aí sim há custo**, proporcional ao uso.
  - Preços de 2026, que mudam com frequência. Conferir no site de cada um antes de decidir.

## PC de referência (o do Nilson)

AMD Ryzen 5 4600G (6 núcleos/12 threads), 16 GB de RAM, vídeo integrado Radeon. Vetorizar um logo no navegador leva poucos segundos numa máquina assim. O processamento roda num Web Worker (em segundo plano), então a página não trava; fotos grandes demoram mais e mostram uma barra de progresso. As IAs da camada 2 rodam mais devagar em vídeo integrado, então são opcionais e só ligam quando ajudam.

## Tamanho

Telas 10, fluxos 7, entidades 7.

Partes difíceis:
1. **Qualidade perto do Vectorizer.AI sem IA paga:** limpar o JPEG, reduzir cores sem perder cores importantes, ajustar curvas, detectar círculos e retângulos, fechar frestas entre cores.
2. **Desempenho no navegador** com imagens grandes e fotos (milhares de formas): WebAssembly em Web Worker, sem travar a tela.
3. **Exportar PDF, EPS e DXF no próprio navegador** (o SVG é direto; os outros formatos exigem gerar o arquivo nós mesmos).
4. **Editor de regiões** (clicar numa forma e recolorir, juntar ou apagar) com desfazer e refazer.

Tamanho: **M** (algumas semanas). A primeira versão útil (F01 + F02 + F04, com SVG e DXF) é **S**: dá para ter funcionando em poucos dias.
