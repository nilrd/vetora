# Regras para agentes (Codex, Claude e outros)

## Não travar o computador do Nilson

Este PC tem 16 GB de RAM e é o computador de trabalho do Nilson. Testes do Vetora já travaram o
PC inteiro, fechando todos os programas dele: em 18/11/2026 um `node.exe` de teste chegou a 11,6 GB.

**Nunca rode, sem perguntar antes e esperar o "pode":**
- `npm test`, `npm run bench`, `vitest`, qualquer `bench/*.ts` (review-relatos, grande, estampa, halo, recorte...);
- renderização de SVG/PNG com `resvg`, `sharp` ou navegador, principalmente de fotos e ilustrações
  (os SVGs delas têm 7 a 40 MB e dezenas de milhares de formas);
- builds de produção repetidos, servidores de preview, navegador automatizado.

Ao perguntar, diga o que vai rodar, quanto tempo e quanta memória deve usar.
Liberado sem perguntar: ler e editar arquivos, `git`, e `npx tsc -b` (verificação de tipos, leve).

O Nilson prefere publicar sem teste local: o Jair (único usuário) testa no site e relata pelo botão "Ficou ruim?".

## Projeto

Leia `CONTINUAR.md` antes de começar. Publicar = `git push origin main` (o Vercel monta e publica sozinho).
Toda publicação termina com uma mensagem curta e pronta para o Nilson repassar ao Jair no WhatsApp.
