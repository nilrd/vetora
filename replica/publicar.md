# Publicar o Vetora (grátis)

O app está pronto para publicar: `npm run build` gera a pasta `dist/` (350 KB). Falta só o login numa hospedagem, que precisa ser feito por você.

## Opção A: Vercel (mais rápido; grátis para uso pessoal)
1. Crie uma conta em vercel.com (pode entrar com Google ou GitHub).
2. No PowerShell, dentro da pasta do projeto:
   ```
   npx vercel login
   npx vercel --prod
   ```
   Nas perguntas, aceite os padrões. O Vercel reconhece o Vite sozinho (build `npm run build`, saída `dist`).
3. O endereço sai no fim, algo como `vetora.vercel.app`.

## Opção B: Cloudflare Pages (grátis e permite vender)
1. Crie uma conta em dash.cloudflare.com.
2. Workers & Pages → Create → Pages → "Upload assets" → arraste a pasta `dist/`.
3. Nome do projeto: `vetora` → endereço `vetora.pages.dev`.

## Depois de publicar
- Teste no celular e em outro computador.
- O app funciona offline depois da primeira visita (PWA): no Chrome, "Instalar app".
- Domínio próprio (opcional, pago à parte): ver `marca/NOME.md` (vetora.com.br está ocupado).
