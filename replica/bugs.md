# Bugs: Vetora

Nenhum S1 ou S2 aberto.

### BUG-001: Linhas finas sumiam
- Severity: S1
- Flow / case: F01 / traço de 1,5 px
- Steps: vetorizar `bench/gt/08-linhas-finas` em PNG
- Expected: as linhas aparecem. Actual: imagem só com o fundo.
- Suspected cause: nenhum pixel do traço é "liso", então a cor não entrava na paleta.
- Status: fixed (cores de traços finos recuperadas uma por vez, a mais pura)

### BUG-002: Traço curvo virava um círculo gigante
- Severity: S1
- Flow / case: F01 / JPEG com traço em arco
- Expected: arco fino. Actual: disco laranja enorme.
- Suspected cause: detector de círculo aceitava laço fino alongado.
- Status: fixed (exige área compatível com πr²)

### BUG-003: Sub-pixel desligado em imagens com poucas cores
- Severity: S2
- Flow / case: F01 / linhas finas PNG
- Expected: borda reta. Actual: "dentes" de escada.
- Suspected cause: detector de antialiasing contava cores únicas (< 64).
- Status: fixed (detector por cores raras)

### BUG-004: Juntar cores apagava uma cor trocada e ignorava a cor escolhida
- Severity: S2
- Flow / case: F02 / trocar sol para vermelho, depois juntar outra cor
- Expected: sol continua (vermelho); a cor vai para a escolhida. Actual: sol sumiu; cor ia para a mais próxima.
- Suspected cause: paleta fixa montada com a cor editada.
- Status: fixed (mergeMap no motor; edições de cor preservadas pelo índice)

### BUG-005: Franjas de cor do JPEG em volta de texto
- Severity: S3
- Flow / case: F01 / exemplo texto.jpg
- Status: fixed (variações raras de borda absorvidas; franjas de mistura removidas)

### BUG-006: Texto minúsculo em JPEG sai áspero
- Severity: S3
- Flow / case: F01 / letras de ~10 px dentro de JPEG de 360 px
- Expected: letras lisas. Actual: contornos tremidos em algumas letras.
- Status: open (melhorado com mais suavização; ampliação 2x testada e piorou a média)
