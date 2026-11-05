# Paridade: Vetora × originais

Data: 2026-11-05.

## 1. Recursos (features.csv)
**86,9 / 100**, com **32 de 32 recursos essenciais ("must") prontos.** Detalhe por área em `parity-features.md`.
O que falta é "should/could" (ex.: histórico, simetria, elipse exata, ajuste de canto individual) ou foi deixado de fora de propósito (conta, pagamento, API, banco de imagens).

## 2. Qualidade do traço (o que importa)
Banco objetivo (`npm run bench`): 12 desenhos-gabarito nossos (logos, texto, ícones, traços finos, adesivo com transparência, listras, engrenagem, detalhes minúsculos), cada um em PNG, PNG pequeno (140 px) e JPEG q70. O vetor é renderizado em 4x e comparado com o gabarito em 4x.

| variante | Vetora ΔE médio | VTracer ΔE médio | Vetora % px ruins | VTracer % px ruins |
| --- | --- | --- | --- | --- |
| PNG | **0,143** | 1,220 | **0,25 %** | 1,28 % |
| pequena | **0,574** | 2,617 | **0,92 %** | 2,12 % |
| JPEG | **0,717** | 1,974 | **0,53 %** | 1,85 % |

- O Vetora foi mais fiel em **36 de 36 casos**, de 3 a 8,5 vezes menos erro.
- Nós: PNG 333 (VTracer 286), JPEG **319 (VTracer 1.633)**.
- Cores: no exemplo da ilustração, as 7 cores saíram **idênticas** ao original (mesmo hexadecimal).
- Frestas: zero por construção (as cores vizinhas dividem a mesma curva; testado).
- Velocidade: 0,2 s para 400×400; 1,5 s para 2000×2000 (4 MP).

Imagem lado a lado: `diffs/comparacao.png` (original ampliado × VTracer × Vetora).

## 3. E o Vectorizer.AI?
Não testamos o Vectorizer.AI no mesmo banco: para medir, precisaríamos baixar o resultado, e o download deles é pago. As garantias que temos:
- O Vetora implementa as mesmas técnicas que o Vectorizer.AI anuncia: fronteiras compartilhadas sem fresta ("vector graph"), precisão sub-pixel pelo antialiasing, cantos vivos, formas inteiras (círculo) e preenchimento de frestas.
- O erro médio no PNG (0,14 ΔE em 4x) já fica abaixo do que o olho percebe (ΔE ≈ 1 é o limiar de diferença visível).
- **Teste manual recomendado:** pegue 5 imagens suas, passe no Vectorizer.AI (a prévia é grátis) e no Vetora, e compare com zoom. Se algum caso ficar pior, ele vira um teste novo no banco e é corrigido.

Pontos onde o Vectorizer.AI provavelmente ainda ganha: texto minúsculo dentro de JPEG muito comprimido (BUG-006), fotos (os dois posterizam, mas a IA deles escolhe melhor as faixas) e detecção de elipse/simetria.
