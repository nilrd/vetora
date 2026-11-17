# Vetora — ponto de parada (17/11/2026, noite)

Para quem continuar (outra sessão ou outro modelo). Leia também `C:\Users\Pichau\.claude\projects\G--Desenvolvimento-Clientes-APP-DE-VETORIZA--O\memory\` (projeto-vetora.md, vetora-relatos-supabase.md, feedback-mensagem-jair.md).

## O que é
Vetorizador web 100% no navegador (TypeScript, Web Worker), site estático no Vercel: https://vetora-two.vercel.app/ (publica a cada `git push origin main`). Cliente: **Jair** (estamparia/DTF). Dono: Nilson. Regra: custo zero, qualidade igual ao Vectorizer.AI. Nilson quer **toda publicação terminando com uma mensagem pronta para o Jair** (WhatsApp, curta).

## Estado
- **No ar (commit 2a0754e):** miolos vazados ao remover fundo; fundo removido só na borda da imagem; halos de cor misturada limpos; polígono/polilinha para bordas tremidas (retas e cantos vivos, cantos arredondados quando a arte tem); antialiasing só no alfa detectado; botão **"Ficou ruim?"** que manda imagem+SVG+ajustes para o Supabase; alça da cortina fixa; preset "Estampa / DTF".
- **Commit local, NÃO publicado (866b601):** modo de visualização com duas telas sincronizadas (pedido do Jair, print do Vector Magic). Compila, mas **não foi testado no navegador**. Conferir: divisória (`.viewport.side .pane + .pane` usa margin -8px, pode ficar feio), zoom pela rodinha na metade direita, e `fit()` ao trocar de modo. Testar com `preview_start vetora-prod` (ou `npm run build && npx vite preview --port 5181`). Se ok: `git push origin main` e mandar mensagem ao Jair.

## Como testar
- `npm test` (15 testes), `node --experimental-strip-types bench/estresse.ts` (32 ok), `npm run bench -- --engines=vetora` (banco; comparar `bench/out/report.txt` com o anterior; médias atuais: png 0,161, pequena 0,546, jpeg 0,747 — nenhuma mudança pode piorar isso).
- Casos reais: `bench/tri.ts` (triângulo do Jair), `bench/estampa.ts`, `bench/halo.ts`, `bench/halo2.ts`, `bench/reais/relatos/<id>/` (7 relatos baixados).

## Relatos (Supabase)
- Projeto `dttuyrpdzqmjckfhlnkd`. Puxar: `SUPABASE_SERVICE_KEY=... node --experimental-strip-types bench/relatos.ts`. A chave de serviço sai de `GET https://api.supabase.com/v1/projects/dttuyrpdzqmjckfhlnkd/api-keys?reveal=true` com o token `sbp_` do Nilson (vale até ~23/11; pedir a ele). Marcar `tratado=true` depois de tratar.
- Pendentes: `download.png` (Dragon Ball) e `aa9d…jpg` (Level Up): ilustrações sombreadas, modo Foto dá 22–36 cores (posterizado). Igualar o Vectorizer.AI nisso exige rede neural (fase 2, com custo). O "Z" tem a mordida na arte original.

## Próximos passos sugeridos
1. Testar e publicar o "Lado a lado".
2. Marcar o defeito na imagem no "Ficou ruim?" (círculo), opcional.
3. Pedir ao Jair mais artes de cores chapadas (logos, textos) pelo botão; tratar por tipo de falha, cada caso vira teste.
4. Segurança: Nilson deve trocar a senha do banco e excluir o token `sbp_` quando terminar.
