# Vetora — continuidade (16/11/2026, horário de São Paulo)

Para quem continuar (outra sessão ou outro modelo). Leia também `C:\Users\Pichau\.claude\projects\G--Desenvolvimento-Clientes-APP-DE-VETORIZA--O\memory\` (projeto-vetora.md, vetora-relatos-supabase.md, feedback-mensagem-jair.md).

## O que é
Vetorizador web 100% no navegador (TypeScript, Web Worker), site estático no Vercel: https://vetora-two.vercel.app/ (publica a cada `git push origin main`). Cliente: **Jair** (estamparia/DTF). Dono: Nilson. Regra: custo zero, qualidade igual ao Vectorizer.AI. Nilson quer **toda publicação terminando com uma mensagem pronta para o Jair** (WhatsApp, curta).

## Revisão atual

- Modo lado a lado publicado no commit dab9b3e.
- Novos relatos baixados com bench/relatos.ps1. Três casos principais de 22h17–22h20: AREIA (eef680cf…), Level Up (59967f5f…) e armadura (d72b7edd…).
- Motor revisado para preservar tons e detalhes em ilustrações. Automático reconhece textura em imagens acima de 360 mil pixels; Foto força a estratégia em qualquer tamanho. Paleta até 128 cores, filtro mais leve e limpeza que preserva marcas contrastantes. Logo/Desenho mantêm a estratégia de cores chapadas.
- Polígonos aceitam lados menores, sujeitos às mesmas verificações geométricas. Z superior passa de curvas e segmentos residuais a seis lados retos.
- PDF e EPS passam a respeitar gapFiller, desenhando contornos sob o preenchimento.
- Testes de qualidade adicionais em src/engine/quality.test.ts. Comparações locais em bench/out/review/. Reproduzir casos com node --experimental-strip-types bench/review-relatos.ts <etiqueta> [id ...].
- Banco após mudança: PNG 0,161; pequena 0,543; JPEG 0,747. Erro RGB médio nas ilustrações reais, sobre branco: Level Up 7,52 → 4,27; armadura 9,82 → 4,09. Isso mede aproximação do raster, e não qualidade de impressão. Z muda ligeiramente o erro raster (0,398 → 0,401 na arte inteira) ao reconstruir retas.
- Limitações: ilustrações ainda têm bandas de cor e perda de detalhes muito pequenos. SVG de Level Up ~7 MB e armadura ~14,45 MB. PDF renderizado e inspecionado. Validação desta revisão no navegador pendente porque a ferramenta falhou com janelas minimizadas; foi pedido ao usuário abrir Chrome. Impressão física depende do teste do Jair.
- Pesquisa consultada: https://potrace.sourceforge.net/potrace.pdf e https://www.visioncortex.org/vtracer-docs/ . A evidência desta rodada demonstra melhoria substancial sem rede neural; a antiga hipótese de que isso exigiria rede neural não foi sustentada.

## Histórico anterior
- **No ar (commit 2a0754e):** miolos vazados ao remover fundo; fundo removido só na borda da imagem; halos de cor misturada limpos; polígono/polilinha para bordas tremidas (retas e cantos vivos, cantos arredondados quando a arte tem); antialiasing só no alfa detectado; botão **"Ficou ruim?"** que manda imagem+SVG+ajustes para o Supabase; alça da cortina fixa; preset "Estampa / DTF".
- **Commit local, NÃO publicado (866b601):** modo de visualização com duas telas sincronizadas (pedido do Jair, print do Vector Magic). Compila, mas **não foi testado no navegador**. Conferir: divisória (`.viewport.side .pane + .pane` usa margin -8px, pode ficar feio), zoom pela rodinha na metade direita, e `fit()` ao trocar de modo. Testar com `preview_start vetora-prod` (ou `npm run build && npx vite preview --port 5181`). Se ok: `git push origin main` e mandar mensagem ao Jair.

## Como testar
- `npm test` (15 testes), `node --experimental-strip-types bench/estresse.ts` (32 ok), `npm run bench -- --engines=vetora` (banco; comparar `bench/out/report.txt` com o anterior; médias atuais: png 0,161, pequena 0,546, jpeg 0,747 — nenhuma mudança pode piorar isso).
- Casos reais: `bench/tri.ts` (triângulo do Jair), `bench/estampa.ts`, `bench/halo.ts`, `bench/halo2.ts`, `bench/reais/relatos/<id>/` (7 relatos baixados).

## Relatos (Supabase)

- Credencial temporária guardada com DPAPI do Windows em `%LOCALAPPDATA%\Vetora\supabase-token.json`, fora do repositório. Reutilizar com `./bench/relatos.ps1`. Prazo local de sete dias a partir do armazenamento. Quando expirar ou for revogada, pedir outra ao Nilson. Renovação interativa com `./bench/relatos.ps1 -SalvarChave` (entrada oculta). A chave de serviço é obtida em memória e a variável de ambiente é restaurada ao terminar.
- Projeto `dttuyrpdzqmjckfhlnkd`. Puxar: `SUPABASE_SERVICE_KEY=... node --experimental-strip-types bench/relatos.ts`. A chave de serviço sai de `GET https://api.supabase.com/v1/projects/dttuyrpdzqmjckfhlnkd/api-keys?reveal=true` com o token `sbp_` do Nilson (vale até ~23/11; pedir a ele). Marcar `tratado=true` depois de tratar.
- Pendentes: `download.png` (Dragon Ball) e `aa9d…jpg` (Level Up): ilustrações sombreadas, modo Foto dá 22–36 cores (posterizado). A equivalência com Vectorizer.AI permanece sem comprovação. O "Z" tem a mordida na arte original.

## Próximos passos sugeridos
1. Testar e publicar o "Lado a lado".
2. Marcar o defeito na imagem no "Ficou ruim?" (círculo), opcional.
3. Pedir ao Jair mais artes de cores chapadas (logos, textos) pelo botão; tratar por tipo de falha, cada caso vira teste.
4. Segurança: Nilson deve trocar a senha do banco e excluir o token `sbp_` quando terminar.

## Relatos de 16/11, 23h21–23h47 (São Paulo)
- 0f86b0b5-f3b0-4871-b135-7decc688b87c, 86571fae-c696-4b51-b341-e83ceaecd936 e d83675f0-afc4-4e52-943b-9a8169b8b27c: reproduzidos com as opções enviadas na revisão 3e0a244.
- Em artes com muitos tons, a limpeza agora é mais leve, o tamanho mínimo de regiões cai de 5 para 3 px no detalhe padrão e a paleta automática pode chegar a 160 cores. O limite manual continua valendo quando escolhido.
- Erro médio RGB entre o SVG renderizado no tamanho original e a entrada, sobre branco: personagens 7,881 → 6,983; Jujutsu 7,023 → 6,722; Levi 3,660 → 3,278. As diferenças horizontais de borda melhoraram nos personagens e no Levi, mas pioraram levemente no Jujutsu (8,244 → 8,399). O Jujutsu ainda precisa de confirmação visual, especialmente nas letras. Os SVGs ficaram maiores. Validação de impressão com Jair.
