## Parity: 86.9 / 100

features 86.9  (67 counted, must-haves 32 of 32 done)

## By area, weakest first
- histórico                      0.0  (1 features)
- conta                          0.0  (2 features)
- api                            0.0  (1 features)
- extras                         0.0  (1 features)
- motor                         73.9  (11 features)
- exportar                      85.1  (18 features)
- envio                         94.4  (7 features)
- editor                        95.2  (9 features)
- ajustes                       96.7  (11 features)
- resultado                    100.0  (3 features)
- lote                         100.0  (1 features)
- geral                        100.0  (2 features)

## Missing, in build order
- [should] motor: Ampliar imagem pequena antes de vetorizar, no  (o sub-pixel já resolve bem imagens pequenas (ver parity.md))
- [should] envio: Recortar ou reduzir imagem grande antes de processar, partial  (reduz automaticamente para 4 MP; sem ferramenta de recorte)
- [should] exportar: DXF linhas / linhas e arcos / splines, partial  (só linhas (o mais compatível))
- [should] motor: Detectar formas (círculo elipse retângulo triângulo estrela), partial  (círculo exato e cantos vivos (retângulo/triângulo/estrela); elipse sai como curva)
- [should] motor: Detectar tipo da imagem automaticamente, partial  (detecta ruído e antialiasing; tipo foto/logo ainda é escolha manual)
- [could] ajustes: Cor de fundo personalizada, no
- [could] api: API pública para terceiros, no  (exige servidor rodando)
- [could] conta: Conta login e assinatura, no  (uso pessoal; exigiria servidor (custo))
- [could] conta: Pagamento e checkout, no  (uso pessoal; volta se virar produto (replica-backend))
- [could] editor: Ajustar canto individual, no
- [could] exportar: Agrupar por pai ou camada, no
- [could] exportar: Modelo de pintura por números, no
- [could] exportar: SVG pequeno (limite de KB), no
- [could] exportar: Tipos de curva permitidos, no  (saída sempre só com retas e cúbicas)
- [could] extras: Banco de imagens gerador de imagem Editor Mágico com IA, no  (outros produtos do DesignVerse)
- [could] histórico: Histórico de trabalhos no navegador, no
- [could] motor: Detectar simetria e formas repetidas, no
- [could] motor: IA proprietária treinada do Vectorizer.AI, no  (substituída pelo Motor Vetora (ver parity.md))
- [could] exportar: Tolerância do ajuste de linha, partial  (via Suavidade das curvas)

## Yours, not in the original (not scored)
- Rodar 100% no navegador sem enviar a imagem
- Mostrar contagem de cores e formas e tamanho do arquivo
- Funcionar offline depois de aberto (PWA)
- Download grátis sem marca d'água e sem limite

## Fix in the matrix
- line 68: priority 'skip' is not must/should/could, counted as could
- line 69: priority 'skip' is not must/should/could, counted as could
- line 70: priority 'skip' is not must/should/could, counted as could
- line 71: priority 'skip' is not must/should/could, counted as could
- line 72: priority 'skip' is not must/should/could, counted as could
